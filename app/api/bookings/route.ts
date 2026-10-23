import {blockAppliesSql} from '@/lib/reservation-blocks';
import {queueGoogleCalendarSync} from '@/lib/google-calendar';
import {waitUntil} from 'cloudflare:workers';
import {notifyAdminPush} from '@/lib/admin-push';
import {acceptsGrade} from '@/lib/course-grades';
import {bookingWeek} from '@/lib/booking-week';
import {bookingSlots,peakOccupancySql} from '@/lib/booking-slots';
import {createReservationCode} from '@/lib/reservation-code';
import {NextRequest} from 'next/server';
import {db,fail,future,json,phone,sameOrigin} from '@/lib/server';
import {parseSchedules} from '@/lib/schedules';
import {withinCoursePeriod} from '@/lib/course-period';
import {sendReservationAlimtalk} from '@/lib/alimtalk';
export async function POST(req:NextRequest){return createBooking(req)}
export async function createBooking(req:NextRequest,adminMemo=''){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{
  const x=await req.json() as Record<string,unknown>;
  const name=String(x.name||'').trim(),school=String(x.school||'').trim(),grade=String(x.grade||''),p=phone(String(x.phone||'')),date=String(x.date||''),courseId=String(x.courseId||''),start=String(x.start||''),end=String(x.end||'');
  if(name.length<2||name.length>40||!school||school.length>80||!['중1','중2','중3','고1','고2','고3'].includes(grade)||p.length<10||p.length>11||!/^\d{4}-\d{2}-\d{2}$/.test(date))return fail('학생 정보와 날짜를 확인해 주세요.');
  const c=await db().prepare('SELECT * FROM courses WHERE id=? AND active=1').bind(courseId).first<{id:string;title:string;target_grades:string;day:number;start:string;end:string;schedules:string;capacity:number;start_date:string|null;end_date:string|null}>();
  if(c&&!acceptsGrade(c.target_grades,grade))return fail('선택한 학년의 대상 수업이 아닙니다.');
  if(!c)return fail('예약 가능한 수업이 아닙니다.');
  if(!withinCoursePeriod(date,c.start_date,c.end_date))return fail('개강일과 종강일 사이의 날짜만 예약할 수 있습니다.');
  const day=(new Date(`${date}T12:00:00+09:00`).getUTCDay()+6)%7;
  const slots=bookingSlots(c.title,parseSchedules(c.schedules,{day:c.day,start:c.start,end:c.end}));
  if(!slots.some(s=>s.day===day&&s.start===start&&s.end===end)||!future(date,start))return fail('예약 가능한 날짜와 시간이 아닙니다. 수업 시간 범위 안에서 알맞은 시간을 선택해 주세요.');
  const week=bookingWeek(date),id=crypto.randomUUID();let code='',saved=false;
  for(let attempt=0;attempt<30;attempt++){
   code=createReservationCode();
   const result=await db().prepare(`WITH candidate AS (SELECT ? AS id,? AS course_id,? AS date,? AS start,? AS end,? AS name,? AS school,? AS grade,? AS phone,? AS code,? AS created_at,? AS week_start,? AS week_end,? AS admin_memo)
    INSERT INTO bookings(id,course_id,date,time_start,time_end,name,school,grade,phone,access_code,status,created_at,notification_status,admin_memo)
    SELECT n.id,n.course_id,n.date,n.start,n.end,n.name,n.school,n.grade,n.phone,n.code,'confirmed',n.created_at,'pending',n.admin_memo FROM candidate n JOIN courses c ON c.id=n.course_id
    WHERE c.active=1 AND EXISTS (SELECT 1 FROM json_each(c.target_grades) g WHERE g.value=n.grade) AND (c.start_date IS NULL OR c.start_date<=n.date) AND (c.end_date IS NULL OR c.end_date>=n.date)
    AND ${peakOccupancySql('n.course_id','n.date','n.start','n.end')}<c.capacity
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.course_id=n.course_id AND b.date=n.date AND b.name=n.name AND b.phone=n.phone AND b.status IN ('confirmed','cancel_pending','change_pending') AND COALESCE(b.time_start,c.start)<n.end AND COALESCE(b.time_end,c.end)>n.start)
    AND NOT EXISTS (SELECT 1 FROM reservation_blocks rb WHERE rb.date=n.date AND ${blockAppliesSql('n.course_id')} AND rb.start<n.end AND rb.end>n.start)
    AND (c.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings wb WHERE wb.course_id=n.course_id AND wb.name=n.name AND wb.phone=n.phone AND wb.date>=n.week_start AND wb.date<n.week_end AND wb.status IN ('confirmed','cancel_pending','change_pending'))<c.weekly_limit)
    AND NOT EXISTS (SELECT 1 FROM bookings WHERE access_code=n.code)`)
    .bind(id,courseId,date,start,end,name,school,grade,p,code,new Date().toISOString(),week.start,week.end,adminMemo).run();
   if(result.meta.changes){saved=true;break}
   if(await db().prepare('SELECT 1 FROM bookings WHERE access_code=?').bind(code).first())continue;
   return fail('선택한 시간이 예약 불가로 설정되었거나 정원·학생별 주간 예약 한도에 도달했습니다. 날짜와 중복 예약을 확인해 주세요.',409);
  }
  if(!saved)return fail('예약 번호를 발급하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
  await queueGoogleCalendarSync([id]);
  waitUntil(notifyAdminPush('reservation',{name,title:c.title,date,start,end}).catch(e=>console.error('관리자 예약 알림 실패',e)));
  let notificationStatus='unknown';
  try{notificationStatus=await sendReservationAlimtalk(id)}catch{await db().prepare("UPDATE bookings SET notification_status='unknown',notification_error='발송 접수 여부 확인 필요' WHERE id=? AND notification_status IN ('pending','sending')").bind(id).run().catch(()=>{})}
  return json({id,accessCode:code,status:'confirmed',notificationStatus},201);
 }catch(e){console.error('예약 저장 실패',e);return fail('예약을 저장하지 못했습니다. 다시 시도해 주세요.',503)}
}
