import {validAdminBookingSchedule} from '@/lib/admin-booking-schedule';
import {blockAppliesSql} from '@/lib/reservation-blocks';
import {queueGoogleCalendarSync} from '@/lib/google-calendar';
import {NextRequest} from 'next/server';
import {createBooking} from '@/app/api/bookings/route';
import {db,fail,json,phone,protectedMutation} from '@/lib/server';
import {acceptsGrade} from '@/lib/course-grades';
import {bookingWeek} from '@/lib/booking-week';
import {peakOccupancySql} from '@/lib/booking-slots';
import {validDate} from '@/lib/course-period';
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const x=await req.clone().json() as Record<string,unknown>;const memo=String(x.memo||'').trim();if(memo.length>2000)return fail('메모는 2,000자 이내로 입력해 주세요.');return createBooking(req,memo,x.overrideWeeklyLimit===true,true)}catch{return fail('예약 정보를 확인해 주세요.')}
}
export async function PATCH(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const x=await req.json() as Record<string,unknown>;
  const overrideWeeklyLimit=x.overrideWeeklyLimit===true;
  const memo=String(x.memo||'').trim();if(memo.length>2000)return fail('메모는 2,000자 이내로 입력해 주세요.');
  const id=String(x.id||''),name=String(x.name||'').trim(),school=String(x.school||'').trim(),grade=String(x.grade||''),p=phone(String(x.phone||'')),date=String(x.date||''),courseId=String(x.courseId||''),start=String(x.start||''),end=String(x.end||'');
  if(name.length<2||name.length>40||!school||school.length>80||!['중1','중2','중3','고1','고2','고3'].includes(grade)||p.length<10||p.length>11||!validDate(date))return fail('학생 정보와 날짜를 확인해 주세요.');
  const old=await db().prepare('SELECT b.*,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=?').bind(id).first<any>();
  if(!old||old.status==='cancelled')return fail('취소되었거나 존재하지 않는 예약입니다.',409);
  if(x.original!==JSON.stringify([old.course_id,old.date,old.start,old.end,old.name,old.school,old.grade,old.phone,old.status,old.attendance,old.requested_date,old.requested_start,old.requested_end,old.admin_memo||'']))return fail('예약이 변경되었습니다. 화면을 새로고침하고 다시 수정해 주세요.',409);
  const changed=old.course_id!==courseId||old.date!==date||old.start!==start||old.end!==end;
  const c=await db().prepare('SELECT * FROM courses WHERE id=?').bind(courseId).first<any>();
  if(!c)return fail('수업을 확인해 주세요.');
  if((changed||grade!==old.grade)&&!acceptsGrade(c.target_grades,grade))return fail('선택한 학년의 대상 수업이 아닙니다.');
  if(changed){
   if(old.attendance!=='unmarked')return fail('출결이 입력된 예약은 학생 정보만 수정할 수 있습니다.');
   if(!validAdminBookingSchedule(date,start,end))return fail('올바른 날짜와 시작·종료 시간을 선택해 주세요. 종료 시간은 시작 시간보다 늦어야 합니다.');
  }
  const enrolled=await db().prepare('SELECT id FROM students WHERE name=? AND phone=?').bind(name,p).first<{id:string}>();
  const studentId=enrolled?.id||(name===old.name&&p===old.phone?old.student_id:null)||null;
  const week=bookingWeek(date);
  const r=await db().prepare(`WITH n AS (SELECT ? AS id,? AS course_id,? AS date,? AS start,? AS end,? AS name,? AS school,? AS grade,? AS phone,? AS week_start,? AS week_end,? AS admin_memo,? AS override_weekly_limit,? AS student_id)
   UPDATE bookings SET course_id=n.course_id,date=n.date,time_start=n.start,time_end=n.end,name=n.name,school=n.school,grade=n.grade,phone=n.phone,admin_memo=n.admin_memo,student_id=n.student_id
   ${changed?",status='confirmed',requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL,cancel_requested_at=NULL":''}
   FROM n JOIN courses c ON c.id=n.course_id WHERE bookings.id=n.id
   AND bookings.status=? AND bookings.attendance=? AND bookings.course_id=? AND bookings.date=? AND bookings.name=? AND bookings.school=? AND bookings.grade=? AND bookings.phone=? AND bookings.time_start IS ? AND bookings.time_end IS ? AND bookings.requested_date IS ? AND bookings.requested_start IS ? AND bookings.requested_end IS ? AND bookings.admin_memo=? ${grade!==old.grade?'AND EXISTS (SELECT 1 FROM json_each(c.target_grades) g WHERE g.value=n.grade)':''}
   ${changed?`AND EXISTS (SELECT 1 FROM json_each(c.target_grades) g WHERE g.value=n.grade) AND ${peakOccupancySql('n.course_id','n.date','n.start','n.end','n.id')}<c.capacity AND NOT EXISTS (SELECT 1 FROM reservation_blocks rb WHERE rb.date=n.date AND ${blockAppliesSql('n.course_id')} AND rb.start<n.end AND rb.end>n.start)`:''}
   AND NOT EXISTS (SELECT 1 FROM bookings other WHERE other.id<>n.id AND other.course_id=n.course_id AND other.date=n.date AND (other.student_id=n.student_id OR (other.name=n.name AND other.phone=n.phone)) AND other.status IN ('confirmed','cancel_pending','change_pending') AND COALESCE(other.time_start,c.start)<n.end AND COALESCE(other.time_end,c.end)>n.start)
   AND (n.override_weekly_limit=1 OR c.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings wb WHERE wb.id<>n.id AND wb.course_id=n.course_id AND (wb.student_id=n.student_id OR (wb.name=n.name AND wb.phone=n.phone)) AND wb.date>=n.week_start AND wb.date<n.week_end AND wb.status IN ('confirmed','cancel_pending','change_pending'))<c.weekly_limit)`)
   .bind(id,courseId,date,start,end,name,school,grade,p,week.start,week.end,memo,overrideWeeklyLimit?1:0,studentId,old.status,old.attendance,old.course_id,old.date,old.name,old.school,old.grade,old.phone,old.time_start,old.time_end,old.requested_date,old.requested_start,old.requested_end,old.admin_memo||'').run();
  if(!r.meta.changes)return fail('예약이 변경되었거나 해당 시간이 차단·마감되었습니다. 중복 예약과 주간 한도를 확인해 주세요.',409);
  await queueGoogleCalendarSync([id]);return json({ok:true,accessCode:old.access_code});
 }catch(e){console.error('관리자 예약 수정 실패',e);return fail('예약을 수정하지 못했습니다. 다시 시도해 주세요.',503)}
}
