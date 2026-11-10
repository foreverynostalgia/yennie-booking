import {calendarBookingTitle} from '@/lib/calendar-display';
import {NextRequest} from 'next/server';
import {db,fail,json} from '@/lib/server';
import {getScriptConnection} from '@/lib/script-calendar';
import {validAdminBookingSchedule} from '@/lib/admin-booking-schedule';
import {acceptsGrade} from '@/lib/course-grades';
import {peakOccupancySql} from '@/lib/booking-slots';
import {blockAppliesSql} from '@/lib/reservation-blocks';
import {bookingWeek} from '@/lib/booking-week';
import {createReservationCode} from '@/lib/reservation-code';
import {prerequisiteError,prerequisiteMessage} from '@/lib/course-prerequisite';
import {googleEventColor} from '@/lib/course-colors';
import {waitUntil} from 'cloudflare:workers';
import {notifyAdminPush} from '@/lib/admin-push';
import {sendReservationAlimtalk} from '@/lib/alimtalk';

type Change={action:'create'|'update'|'delete';eventId:string;bookingId?:string;title?:string;date?:string;start?:string;end?:string};
const uuid=/^[a-f0-9-]{36}$/;
const active="('confirmed','cancel_pending','change_pending')";
const mapKey=async(id:string)=>'google_event_'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id)))).map(x=>x.toString(16).padStart(2,'0')).join('');
function safeEqual(a:string,b:string){let mismatch=a.length^b.length;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return mismatch===0}
async function mapped(key:string){return db().prepare('SELECT webhook_encrypted AS bookingId FROM calendar_settings WHERE id=?').bind(key).first<{bookingId:string}>()}
async function remember(key:string,id:string){await db().prepare('INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at').bind(key,id,new Date().toISOString()).run()}
async function apply(x:Change){
 if(!['create','update','delete'].includes(x.action)||typeof x.eventId!=='string'||x.eventId.length<5||x.eventId.length>300||!(/^[\w@.\-]+$/.test(x.eventId)))throw Error('일정 ID를 확인해 주세요.');
 const key=await mapKey(x.eventId),link=await mapped(key);
 if(x.action==='create'){
  if(link){const found=await db().prepare('SELECT b.name,b.attendance,c.calendar_label,c.color,b.course_id FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=?').bind(link.bookingId).first<any>();return {bookingId:link.bookingId,title:found?calendarBookingTitle(found.name,found.calendar_label,found.attendance):undefined,colorId:found?googleEventColor(found.color,found.course_id):undefined};}
  const parts=String(x.title||'').split('|').map(s=>s.trim());
  if(parts.length!==3||parts[0]!=='예약추가'||!parts[1]||!parts[2])throw Error('새 일정 제목을 예약추가 | 닉네임 | 수업명 형식으로 입력해 주세요.');
  const student=await db().prepare('SELECT * FROM students WHERE nickname=? AND active=1').bind(parts[1]).first<any>();
  const course=await db().prepare('SELECT * FROM courses WHERE title=? AND active=1').bind(parts[2]).all<any>();
  if(!student||course.results.length!==1)throw Error('등록된 닉네임과 정확한 수업명 한 개를 확인해 주세요.');
  const c=course.results[0],date=String(x.date||''),start=String(x.start||''),end=String(x.end||'');
  if(!validAdminBookingSchedule(date,start,end)||new Date(`${date}T${start}:00+09:00`).getTime()<=Date.now())throw Error('미래의 유효한 날짜와 시간을 설정해 주세요.');
  if(!acceptsGrade(c.target_grades,student.grade))throw Error('학생 학년의 대상 수업이 아닙니다.');
  const week=bookingWeek(date),id=crypto.randomUUID();
  for(let n=0;n<20;n++){
   const code=createReservationCode();
   const inserted=await db().prepare(`WITH candidate AS (SELECT ? AS id,? AS course_id,? AS date,? AS start,? AS end,? AS student_id,? AS name,? AS school,? AS grade,? AS phone,? AS code,? AS week_start,? AS week_end,? AS created_at)
    INSERT INTO bookings(id,course_id,date,time_start,time_end,student_id,name,school,grade,phone,access_code,status,created_at,notification_status,calendar_sync_status,calendar_synced_at)
    SELECT n.id,n.course_id,n.date,n.start,n.end,n.student_id,n.name,n.school,n.grade,n.phone,n.code,'confirmed',n.created_at,'pending','synced',n.created_at FROM candidate n JOIN courses c ON c.id=n.course_id
    WHERE c.active=1 AND EXISTS (SELECT 1 FROM json_each(c.target_grades) g WHERE g.value=n.grade)
    AND ${peakOccupancySql('n.course_id','n.date','n.start','n.end')}<c.capacity
    AND NOT EXISTS (SELECT 1 FROM reservation_blocks rb WHERE rb.date=n.date AND ${blockAppliesSql('n.course_id')} AND rb.start<n.end AND rb.end>n.start)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.course_id=n.course_id AND b.date=n.date AND (b.student_id=n.student_id OR (b.name=n.name AND b.phone=n.phone)) AND b.status IN ${active} AND COALESCE(b.time_start,c.start)<n.end AND COALESCE(b.time_end,c.end)>n.start)
    AND (c.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings b WHERE b.course_id=n.course_id AND (b.student_id=n.student_id OR (b.name=n.name AND b.phone=n.phone)) AND b.date>=n.week_start AND b.date<n.week_end AND b.status IN ${active})<c.weekly_limit)
    AND NOT EXISTS (SELECT 1 FROM bookings WHERE access_code=n.code)`).bind(id,c.id,date,start,end,student.id,student.name,student.school,student.grade,student.phone,code,week.start,week.end,new Date().toISOString()).run();
   if(inserted.meta.changes){await remember(key,id);waitUntil(Promise.allSettled([notifyAdminPush('reservation',{name:student.name,title:c.title,date,start,end}),sendReservationAlimtalk(id)]).then(()=>{}));return {bookingId:id,title:calendarBookingTitle(student.name,c.calendar_label),colorId:googleEventColor(c.color,c.id)};}
   if(!await db().prepare('SELECT 1 FROM bookings WHERE access_code=?').bind(code).first())break;
  }
  throw Error('차단·정원·중복·주간 한도 또는 선행 수업 조건을 확인해 주세요.');
 }
 if(!uuid.test(String(x.bookingId||'')))throw Error('예약 표시가 없는 일정은 반영할 수 없습니다.');
 const id=x.bookingId!;
 if(link&&link.bookingId!==id)throw Error('캘린더 일정과 예약 연결이 일치하지 않습니다.');
 const old=await db().prepare('SELECT b.*,c.start AS course_start,c.end AS course_end,c.capacity,c.weekly_limit,c.target_grades,c.title AS course_title,c.calendar_label FROM bookings b JOIN courses c ON b.course_id=c.id WHERE b.id=?').bind(id).first<any>();
 if(!old)throw Error('예약 시스템에서 일정을 찾지 못했습니다.');
 if(x.action==='delete'){
  if(old.status==='cancelled'){await db().prepare('DELETE FROM calendar_settings WHERE id=?').bind(key).run();return {bookingId:id}}
  const r=await db().prepare(`UPDATE bookings SET status='cancelled',cancelled_at=?,requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL WHERE id=? AND attendance='unmarked' AND status IN ${active}`).bind(new Date().toISOString(),id).run();
  if(!r.meta.changes)throw Error('출결이 입력된 예약은 캘린더에서 삭제할 수 없습니다.');
  await db().prepare('DELETE FROM calendar_settings WHERE id=?').bind(key).run();return {bookingId:id};
 }
 if(old.status==='cancelled'||old.attendance!=='unmarked')throw Error('취소·출결 처리된 예약은 캘린더에서 수정할 수 없습니다.');
 const date=String(x.date||''),start=String(x.start||''),end=String(x.end||'');
 if(!validAdminBookingSchedule(date,start,end)||new Date(`${date}T${start}:00+09:00`).getTime()<=Date.now())throw Error('미래의 유효한 날짜와 시간을 설정해 주세요.');
 const week=bookingWeek(date);
 const r=await db().prepare(`WITH n AS (SELECT ? AS id,? AS date,? AS start,? AS end,? AS week_start,? AS week_end)
  UPDATE bookings SET date=n.date,time_start=n.start,time_end=n.end,status='confirmed',requested_date=NULL,requested_start=NULL,requested_end=NULL,cancel_requested_at=NULL,change_requested_at=NULL,calendar_sync_status='synced',calendar_synced_at=?
  FROM n JOIN courses c ON c.id=? WHERE bookings.id=n.id AND bookings.status IN ${active} AND bookings.attendance='unmarked'
  AND ${peakOccupancySql('bookings.course_id','n.date','n.start','n.end','n.id')}<c.capacity
  AND NOT EXISTS (SELECT 1 FROM reservation_blocks rb WHERE rb.date=n.date AND ${blockAppliesSql('bookings.course_id')} AND rb.start<n.end AND rb.end>n.start)
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id<>n.id AND b.course_id=bookings.course_id AND b.date=n.date AND (b.student_id=bookings.student_id OR (b.name=bookings.name AND b.phone=bookings.phone)) AND b.status IN ${active} AND COALESCE(b.time_start,c.start)<n.end AND COALESCE(b.time_end,c.end)>n.start)
  AND (c.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings b WHERE b.id<>n.id AND b.course_id=bookings.course_id AND (b.student_id=bookings.student_id OR (b.name=bookings.name AND b.phone=bookings.phone)) AND b.date>=n.week_start AND b.date<n.week_end AND b.status IN ${active})<c.weekly_limit)`).bind(id,date,start,end,week.start,week.end,new Date().toISOString(),old.course_id).run();
 if(!r.meta.changes)throw Error('차단·정원·중복·주간 한도 또는 선행 수업 조건을 확인해 주세요.');
 await remember(key,id);return {bookingId:id,title:calendarBookingTitle(old.name,old.calendar_label,old.attendance)};
}
export async function POST(req:NextRequest){
 const setting=await getScriptConnection();
 const token=req.headers.get('x-ye-calendar-token')||'';
 if(!setting||!token||!safeEqual(token,setting.secret))return fail('연결 인증이 필요합니다.',401);
 if(Number(req.headers.get('content-length')||0)>4096)return fail('요청이 너무 큽니다.',413);
 try{const x=await req.json() as Change;return json({ok:true,...await apply(x)})}
 catch(e){const message=prerequisiteError(e)?prerequisiteMessage:e instanceof Error?e.message:'일정을 반영하지 못했습니다.';return fail(message,409)}
}
