import {bookingWeek} from '@/lib/booking-week';
import {NextRequest} from 'next/server';
import {db,fail,future,json,phone,sameOrigin} from '@/lib/server';
import {validDate,withinCoursePeriod} from '@/lib/course-period';
import {bookingSlots,isClinic} from '@/lib/booking-slots';
import {parseSchedules} from '@/lib/schedules';

export async function POST(req:NextRequest){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{
  const x=await req.json() as Record<string,unknown>,id=String(x.id||''),name=String(x.name||'').trim(),p=phone(String(x.phone||'')),code=String(x.accessCode||'').trim().replace(/^ye/i,'YE'),date=String(x.date||''),start=String(x.start||''),end=String(x.end||'');
  if(!id||!name||!p||!code||!validDate(date))return fail('예약 정보와 변경할 날짜를 확인해 주세요.');
  const b=await db().prepare('SELECT b.course_id,b.date,b.status,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end,c.title,c.day,c.start AS course_start,c.end AS course_end,c.schedules,c.start_date,c.end_date,c.capacity,c.active FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=? AND b.name=? AND b.phone=? AND b.access_code=?').bind(id,name,p,code.startsWith('YE')?code.toUpperCase():code.toLowerCase()).first<{course_id:string;date:string;status:string;start:string;end:string;title:string;day:number;course_start:string;course_end:string;schedules:string;start_date:string|null;end_date:string|null;capacity:number;active:number}>();
  if(!b)return fail('예약을 찾을 수 없습니다.',404);
  if(b.status!=='confirmed'||!future(b.date,b.end))return fail('이 예약은 변경 요청할 수 없습니다.',409);
  const weekday=(new Date(date+'T12:00:00+09:00').getUTCDay()+6)%7;
  if(!b.active||!withinCoursePeriod(date,b.start_date,b.end_date)||!future(date,isClinic(b.title)?start:end)||!bookingSlots(b.title,parseSchedules(b.schedules,{day:b.day,start:b.course_start,end:b.course_end})).some(s=>s.day===weekday&&s.start===start&&s.end===end))return fail('변경 가능한 날짜와 시간이 아닙니다.');
  if(date===b.date&&start===b.start&&end===b.end)return fail('현재 예약과 다른 날짜 또는 시간을 선택해 주세요.');
  const week=bookingWeek(date);
  const result=await db().prepare("UPDATE bookings SET status='change_pending',requested_date=?,requested_start=?,requested_end=?,change_requested_at=? WHERE id=? AND attendance='unmarked' AND status='confirmed' AND NOT EXISTS (SELECT 1 FROM reservation_blocks rb WHERE rb.date=? AND (rb.course_id IS NULL OR rb.course_id=bookings.course_id) AND rb.start<? AND rb.end>?) AND EXISTS (SELECT 1 FROM courses wc WHERE wc.id=bookings.course_id AND (wc.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings wb WHERE wb.course_id=wc.id AND wb.name=bookings.name AND wb.phone=bookings.phone AND wb.date>=? AND wb.date<? AND wb.id<>bookings.id AND wb.status IN ('confirmed','cancel_pending','change_pending'))<wc.weekly_limit))").bind(date,start,end,new Date().toISOString(),id,date,end,start,week.start,week.end).run();
  if(!result.meta.changes)return fail('변경할 시간대가 예약 불가이거나 주간 예약 한도에 도달했거나 이미 처리 중인 요청입니다.',409);
  return json({status:'change_pending'});
 }catch{return fail('변경 요청을 저장하지 못했습니다.',503)}
}
