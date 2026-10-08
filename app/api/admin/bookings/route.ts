import {NextRequest} from 'next/server';
import {createBooking} from '@/app/api/bookings/route';
import {db,fail,future,json,phone,protectedMutation} from '@/lib/server';
import {bookingWeek} from '@/lib/booking-week';
import {bookingSlots,isClinic,peakOccupancySql} from '@/lib/booking-slots';
import {parseSchedules} from '@/lib/schedules';
import {withinCoursePeriod,validDate} from '@/lib/course-period';
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const x=await req.clone().json() as Record<string,unknown>;const memo=String(x.memo||'').trim();if(memo.length>2000)return fail('메모는 2,000자 이내로 입력해 주세요.');return createBooking(req,memo)}catch{return fail('예약 정보를 확인해 주세요.')}
}
export async function PATCH(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const x=await req.json() as Record<string,unknown>;
  const memo=String(x.memo||'').trim();if(memo.length>2000)return fail('메모는 2,000자 이내로 입력해 주세요.');
  const id=String(x.id||''),name=String(x.name||'').trim(),school=String(x.school||'').trim(),grade=String(x.grade||''),p=phone(String(x.phone||'')),date=String(x.date||''),courseId=String(x.courseId||''),start=String(x.start||''),end=String(x.end||'');
  if(name.length<2||name.length>40||!school||school.length>80||!['중1','중2','중3','고1','고2','고3'].includes(grade)||p.length<10||p.length>11||!validDate(date))return fail('학생 정보와 날짜를 확인해 주세요.');
  const old=await db().prepare('SELECT b.*,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=?').bind(id).first<any>();
  if(!old||old.status==='cancelled')return fail('취소되었거나 존재하지 않는 예약입니다.',409);
  if(x.original!==JSON.stringify([old.course_id,old.date,old.start,old.end,old.name,old.school,old.grade,old.phone,old.status,old.attendance,old.requested_date,old.requested_start,old.requested_end,old.admin_memo||'']))return fail('예약이 변경되었습니다. 화면을 새로고침하고 다시 수정해 주세요.',409);
  const changed=old.course_id!==courseId||old.date!==date||old.start!==start||old.end!==end;
  const c=await db().prepare('SELECT * FROM courses WHERE id=?').bind(courseId).first<any>();
  if(!c)return fail('수업을 확인해 주세요.');
  if(changed){
   if(old.attendance!=='unmarked'||!future(old.date,old.end))return fail('출결이 입력되었거나 지난 예약은 학생 정보만 수정할 수 있습니다.');
   const day=(new Date(date+'T12:00:00+09:00').getUTCDay()+6)%7;
   if(!c.active||!withinCoursePeriod(date,c.start_date,c.end_date)||!future(date,isClinic(c.title)?start:end)||!bookingSlots(c.title,parseSchedules(c.schedules,{day:c.day,start:c.start,end:c.end})).some(s=>s.day===day&&s.start===start&&s.end===end))return fail('예약 가능한 수업·날짜·시간을 선택해 주세요.');
  }
  const week=bookingWeek(date);
  const r=await db().prepare(`WITH n AS (SELECT ? AS id,? AS course_id,? AS date,? AS start,? AS end,? AS name,? AS school,? AS grade,? AS phone,? AS week_start,? AS week_end,? AS admin_memo)
   UPDATE bookings SET course_id=n.course_id,date=n.date,time_start=n.start,time_end=n.end,name=n.name,school=n.school,grade=n.grade,phone=n.phone,admin_memo=n.admin_memo
   ${changed?",status='confirmed',requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL,cancel_requested_at=NULL":''}
   FROM n JOIN courses c ON c.id=n.course_id WHERE bookings.id=n.id
   AND bookings.status=? AND bookings.attendance=? AND bookings.course_id=? AND bookings.date=? AND bookings.name=? AND bookings.school=? AND bookings.grade=? AND bookings.phone=? AND bookings.time_start IS ? AND bookings.time_end IS ? AND bookings.requested_date IS ? AND bookings.requested_start IS ? AND bookings.requested_end IS ? AND bookings.admin_memo=?
   ${changed?`AND c.active=1 AND (c.start_date IS NULL OR c.start_date<=n.date) AND (c.end_date IS NULL OR c.end_date>=n.date) AND ${peakOccupancySql('n.course_id','n.date','n.start','n.end','n.id')}<c.capacity AND NOT EXISTS (SELECT 1 FROM reservation_blocks rb WHERE rb.date=n.date AND (rb.course_id IS NULL OR rb.course_id=n.course_id) AND rb.start<n.end AND rb.end>n.start)`:''}
   AND NOT EXISTS (SELECT 1 FROM bookings other WHERE other.id<>n.id AND other.course_id=n.course_id AND other.date=n.date AND other.name=n.name AND other.phone=n.phone AND other.status IN ('confirmed','cancel_pending','change_pending') AND COALESCE(other.time_start,c.start)<n.end AND COALESCE(other.time_end,c.end)>n.start)
   AND (c.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings wb WHERE wb.id<>n.id AND wb.course_id=n.course_id AND wb.name=n.name AND wb.phone=n.phone AND wb.date>=n.week_start AND wb.date<n.week_end AND wb.status IN ('confirmed','cancel_pending','change_pending'))<c.weekly_limit)`)
   .bind(id,courseId,date,start,end,name,school,grade,p,week.start,week.end,memo,old.status,old.attendance,old.course_id,old.date,old.name,old.school,old.grade,old.phone,old.time_start,old.time_end,old.requested_date,old.requested_start,old.requested_end,old.admin_memo||'').run();
  if(!r.meta.changes)return fail('예약이 변경되었거나 해당 시간이 차단·마감되었습니다. 중복 예약과 주간 한도를 확인해 주세요.',409);
  return json({ok:true,accessCode:old.access_code});
 }catch(e){console.error('관리자 예약 수정 실패',e);return fail('예약을 수정하지 못했습니다. 다시 시도해 주세요.',503)}
}
