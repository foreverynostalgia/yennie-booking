import {queueGoogleCalendarSync} from '@/lib/google-calendar';
import {acceptsGrade} from '@/lib/course-grades';
import {bookingWeek} from '@/lib/booking-week';
import {NextRequest} from 'next/server';
import {db,fail,future,json,protectedMutation} from '@/lib/server';
import {withinCoursePeriod} from '@/lib/course-period';
import {bookingSlots,peakOccupancySql} from '@/lib/booking-slots';
import {parseSchedules} from '@/lib/schedules';

export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const {id,decision}=await req.json() as {id?:string;decision?:string};
  if(!id||!['approve','reject'].includes(decision||''))return fail('요청 내용을 확인해 주세요.');
  if(decision==='reject'){
   const r=await db().prepare("UPDATE bookings SET status='confirmed',requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL WHERE id=? AND status='change_pending'").bind(id).run();
   if(r.meta.changes)await queueGoogleCalendarSync([id]);return r.meta.changes?json({ok:true}):fail('이미 처리된 요청입니다.',409);
  }
  const b=await db().prepare('SELECT b.course_id,b.grade,c.target_grades,b.requested_date,b.requested_start,b.requested_end,b.status,c.title,c.day,c.start,c.end,c.schedules,c.start_date,c.end_date,c.active FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=?').bind(id).first<{course_id:string;grade:string;target_grades:string;requested_date:string|null;requested_start:string|null;requested_end:string|null;status:string;title:string;day:number;start:string;end:string;schedules:string;start_date:string|null;end_date:string|null;active:number}>();
  if(!b||b.status!=='change_pending'||!b.requested_date||!b.requested_start||!b.requested_end)return fail('이미 처리된 요청입니다.',409);
  const weekday=(new Date(b.requested_date+'T12:00:00+09:00').getUTCDay()+6)%7;
  if(!acceptsGrade(b.target_grades,b.grade)||!b.active||!withinCoursePeriod(b.requested_date,b.start_date,b.end_date)||!future(b.requested_date,b.requested_start)||!bookingSlots(b.title,parseSchedules(b.schedules,{day:b.day,start:b.start,end:b.end})).some(s=>s.day===weekday&&s.start===b.requested_start&&s.end===b.requested_end))return fail('변경할 회차가 더 이상 예약 가능하지 않습니다. 요청을 거절하고 다른 날짜를 안내해 주세요.',409);
  const week=bookingWeek(b.requested_date);
  const r=await db().prepare(`UPDATE bookings SET date=requested_date,time_start=requested_start,time_end=requested_end,status='confirmed',requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL WHERE id=? AND status='change_pending' AND requested_date=? AND requested_start=? AND requested_end=? AND NOT EXISTS (SELECT 1 FROM reservation_blocks rb WHERE rb.date=bookings.requested_date AND (rb.course_id IS NULL OR rb.course_id=bookings.course_id) AND rb.start<bookings.requested_end AND rb.end>bookings.requested_start) AND EXISTS (SELECT 1 FROM courses wc WHERE wc.id=bookings.course_id AND (wc.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings wb WHERE wb.course_id=wc.id AND wb.name=bookings.name AND wb.phone=bookings.phone AND wb.date>=? AND wb.date<? AND wb.id<>bookings.id AND wb.status IN ('confirmed','cancel_pending','change_pending'))<wc.weekly_limit)) AND EXISTS (SELECT 1 FROM courses c WHERE c.id=bookings.course_id AND c.active=1 AND EXISTS (SELECT 1 FROM json_each(c.target_grades) g WHERE g.value=bookings.grade) AND (c.start_date IS NULL OR c.start_date<=bookings.requested_date) AND (c.end_date IS NULL OR c.end_date>=bookings.requested_date) AND ${peakOccupancySql('bookings.course_id','bookings.requested_date','bookings.requested_start','bookings.requested_end','bookings.id')}<c.capacity) AND NOT EXISTS (SELECT 1 FROM bookings other WHERE other.course_id=bookings.course_id AND other.date=bookings.requested_date AND COALESCE(other.time_start,(SELECT start FROM courses WHERE id=bookings.course_id))<bookings.requested_end AND COALESCE(other.time_end,(SELECT end FROM courses WHERE id=bookings.course_id))>bookings.requested_start AND other.phone=bookings.phone AND other.name=bookings.name AND other.status IN ('confirmed','cancel_pending','change_pending') AND other.id<>bookings.id)`).bind(id,b.requested_date,b.requested_start,b.requested_end,week.start,week.end).run();
  if(!r.meta.changes)return fail('해당 회차가 예약 불가·마감 상태이거나 주간 예약 한도에 도달했습니다. 요청을 다시 확인해 주세요.',409);
  await queueGoogleCalendarSync([id]);return json({ok:true});
 }catch{return fail('변경 요청을 처리하지 못했습니다.',503)}
}
