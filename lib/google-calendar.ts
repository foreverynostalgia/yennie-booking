import {courseCalendarId} from '@/lib/course-calendars';
import {requestGoogleScript} from '@/lib/google-script-http';
import {calendarBookingTitle} from '@/lib/calendar-display';
import {env,waitUntil} from 'cloudflare:workers';
import {db} from '@/lib/server';
import {attendanceText} from '@/lib/attendance';
import {getMakeWebhook} from '@/lib/make-calendar';
import {getScriptConnection} from '@/lib/script-calendar';
import {googleEventColor} from '@/lib/course-colors';

const timezone='Asia/Seoul';
type Credentials={client_email:string;private_key:string;private_key_id?:string};
type CalendarBooking={id:string;course_id:string;color:string;calendar_label:string;date:string;name:string;school:string;grade:string;status:string;attendance:string;requested_date:string|null;requested_start:string|null;requested_end:string|null;title:string;start:string;end:string};
let cachedToken:{value:string;expires:number}|null=null;
const runtime=()=>env as unknown as Record<string,string|undefined>;
export const googleCalendarConfigured=()=>!!runtime().GOOGLE_CALENDAR_ID&&!!runtime().GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
const encode=(value:unknown)=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function token(credentials:Credentials){
 if(cachedToken&&cachedToken.expires>Date.now()+60000)return cachedToken.value;
 const now=Math.floor(Date.now()/1000),header={alg:'RS256',typ:'JWT',kid:credentials.private_key_id},claims={iss:credentials.client_email,scope:'https://www.googleapis.com/auth/calendar.events',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600};
 const keyBytes=Uint8Array.from(atob(credentials.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',keyBytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const body=`${encode(header)}.${encode(claims)}`;
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(body));
 const assertion=`${body}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!response.ok)throw new Error(`Google 인증 실패 (${response.status})`);
 const result=await response.json() as {access_token?:string;expires_in?:number};
 if(!result.access_token)throw new Error('Google 인증 토큰을 받지 못했습니다.');
 cachedToken={value:result.access_token,expires:Date.now()+(result.expires_in||3600)*1000};return result.access_token;
}
async function eventId(id:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));return 'a'+Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('')}
async function sendCalendarRequest(method:string,url:string,accessToken:string,body?:unknown){
 return fetch(url,{method,headers:{Authorization:`Bearer ${accessToken}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
export async function syncGoogleCalendarBooking(id:string){
 const booking=await db().prepare('SELECT b.id,b.course_id,c.color,c.calendar_label,b.date,b.name,b.school,b.grade,b.status,b.attendance,b.requested_date,b.requested_start,b.requested_end,c.title,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=?').bind(id).first<CalendarBooking>();
 if(!booking)return;
 try{
  const script=await getScriptConnection(),makeWebhook=script?null:await getMakeWebhook();
  if(!script&&!makeWebhook&&!googleCalendarConfigured()){
   await db().prepare("UPDATE bookings SET calendar_sync_status='unconfigured',calendar_sync_error='구글 캘린더 연결 정보가 필요합니다.' WHERE id=?").bind(id).run();return;
  }
  if(script||makeWebhook){
   const payload={bookingId:booking.id,bookingMarker:`YEBOOKING:${booking.id}`,action:booking.status==='cancelled'?'delete':'upsert',eventColor:googleEventColor(booking.color,booking.course_id),title:booking.title,studentName:booking.name,name:calendarBookingTitle(booking.name,booking.calendar_label,booking.attendance),eventTitle:calendarBookingTitle(booking.name,booking.calendar_label,booking.attendance),school:booking.school,grade:booking.grade,date:booking.date,start:booking.start,end:booking.end,status:booking.status,attendance:attendanceText[booking.attendance]||'미확인',requestedDate:booking.requested_date,requestedStart:booking.requested_start,requestedEnd:booking.requested_end,timeZone:timezone};
   if(script){
    const {result}=await requestGoogleScript(script.url,{...payload,token:script.secret,calendarId:await courseCalendarId(booking.course_id)});
    if(!result.ok)throw new Error(`Google Script: ${result.error||'일정 반영을 확인하지 못했습니다.'}`);
    if(payload.action==='upsert'&&![2,3,4,5,6,7,8].includes(Number(result.version)))throw new Error('학생 이름·수업 색상 표시를 적용하려면 Apps Script 코드를 새 코드로 교체한 뒤 기존 배포를 새 버전으로 업데이트해 주세요.');
    if(await courseCalendarId(booking.course_id)&&Number(result.version)<7)throw Error('수업별 캘린더는 최신 Apps Script 코드(v7 이상)로 배포해야 합니다.');
    await db().prepare("INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) VALUES('google_script_version',?,?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at").bind(String(result.version||0),new Date().toISOString()).run();
    await db().prepare("UPDATE bookings SET calendar_sync_status='synced',calendar_synced_at=?,calendar_sync_error=NULL WHERE id=?").bind(new Date().toISOString(),id).run();return;
   }
   if(!makeWebhook)throw new Error('Make 연결 주소를 확인해 주세요.');
   const response=await fetch(makeWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!response.ok)throw new Error(`Make 웹훅 전송 실패 (${response.status})`);
   await db().prepare("UPDATE bookings SET calendar_sync_status='sent',calendar_synced_at=?,calendar_sync_error=NULL WHERE id=?").bind(new Date().toISOString(),id).run();return;
  }
  const config=JSON.parse(runtime().GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!) as Credentials;
  if(!config.client_email||!config.private_key)throw new Error('서비스 계정 키 형식을 확인해 주세요.');
  const accessToken=await token(config),calendarId=encodeURIComponent(runtime().GOOGLE_CALENDAR_ID!),idForEvent=await eventId(id),base=`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  if(booking.status==='cancelled'){
   const response=await sendCalendarRequest('DELETE',`${base}/${idForEvent}`,accessToken);
   if(!response.ok&&response.status!==404)throw new Error(`Google 일정 삭제 실패 (${response.status})`);
  }else{
   const status=booking.status==='cancel_pending'?' · 취소 승인 대기':booking.status==='change_pending'?' · 변경 승인 대기':'';
   const description=[`학교: ${booking.school}`,`학년: ${booking.grade}`,`출결: ${attendanceText[booking.attendance]||'미확인'}`,booking.status==='change_pending'&&booking.requested_date?`변경 요청: ${booking.requested_date} ${booking.requested_start}–${booking.requested_end}`:'','옌쌤 과학 예약 사이트와 동기화된 일정입니다.'].filter(Boolean).join('\n');
   const event={id:idForEvent,summary:calendarBookingTitle(booking.name,booking.calendar_label,booking.attendance),colorId:googleEventColor(booking.color,booking.course_id),description:[status.trim(),description].filter(Boolean).join('\n'),start:{dateTime:`${booking.date}T${booking.start}:00+09:00`,timeZone:timezone},end:{dateTime:`${booking.date}T${booking.end}:00+09:00`,timeZone:timezone},extendedProperties:{private:{siteBookingId:id}}};
   const response=await sendCalendarRequest('POST',base,accessToken,event);
   if(response.status===409){const update=await sendCalendarRequest('PATCH',`${base}/${idForEvent}`,accessToken,event);if(!update.ok)throw new Error(`Google 일정 변경 실패 (${update.status})`)}
   else if(!response.ok)throw new Error(`Google 일정 등록 실패 (${response.status})`);
  }
  await db().prepare("UPDATE bookings SET calendar_sync_status='synced',calendar_synced_at=?,calendar_sync_error=NULL WHERE id=?").bind(new Date().toISOString(),id).run();
 }catch(error){const message=error instanceof Error?error.message:'알 수 없는 오류';await db().prepare("UPDATE bookings SET calendar_sync_status='failed',calendar_sync_error=? WHERE id=?").bind(message.slice(0,300),id).run();console.error('Google Calendar sync failed',id,message)}
}
export async function queueGoogleCalendarSync(ids:string[]){if(!ids.length)return;try{await db().prepare("UPDATE bookings SET calendar_sync_status='pending',calendar_sync_error=NULL WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).run()}catch(error){console.error('Google Calendar queue failed',error)}waitUntil((async()=>{for(const id of ids)await syncGoogleCalendarBooking(id)})())}
