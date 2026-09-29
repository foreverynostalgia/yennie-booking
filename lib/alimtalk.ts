import { env } from 'cloudflare:workers';
import { db } from '@/lib/server';

type Reservation = { id:string; phone:string; name:string; school:string; grade:string; date:string; time_start:string; time_end:string; access_code:string; title:string; status:string; notification_status:string };
type ApiResponse = { messageList?:Array<{messageId?:string;statusCode?:string;statusMessage?:string}>; failedMessageList?:Array<{statusMessage?:string}> };

const configuration = () => {
  const e = env as unknown as Record<string,string|undefined>;
  return {key:e.SOLAPI_API_KEY, secret:e.SOLAPI_API_SECRET, pfId:e.SOLAPI_PF_ID, templateId:e.SOLAPI_TEMPLATE_ID};
};
export const alimtalkConfigured = () => Object.values(configuration()).every(Boolean);

async function authorization(key:string, secret:string) {
  const date = new Date().toISOString();
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2,'0')).join('');
  const signingKey = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest = await crypto.subtle.sign('HMAC',signingKey,new TextEncoder().encode(date+salt));
  const signature = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2,'0')).join('');
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

// Only explicit provider rejections are retryable. An interrupted request may have been
// accepted by the provider, so it remains 'unknown' until reconciled there.
export async function sendReservationAlimtalk(id:string, retry=false) {
  const c=configuration();
  const booking=await db().prepare(`SELECT b.*, c.title FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=?`).bind(id).first<Reservation>();
  if(!booking || booking.status!=='confirmed') return 'skipped';
  if(!c.key||!c.secret||!c.pfId||!c.templateId){
    await db().prepare("UPDATE bookings SET notification_status='unconfigured',notification_error='발송 서비스 설정 필요' WHERE id=? AND notification_status IN ('pending','unconfigured')").bind(id).run();
    return 'unconfigured';
  }
  const allowed=retry?"('failed','unconfigured')":"('pending')";
  const claim=await db().prepare(`UPDATE bookings SET notification_status='sending',notification_error=NULL,notification_attempted_at=? WHERE id=? AND status='confirmed' AND notification_status IN ${allowed}`).bind(new Date().toISOString(),id).run();
  if(!claim.meta.changes)return 'skipped';
  try{
    const response=await fetch('https://api.solapi.com/messages/v4/send-many/detail',{
      method:'POST', headers:{Authorization:await authorization(c.key,c.secret),'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{to:booking.phone,type:'ATA',kakaoOptions:{pfId:c.pfId,templateId:c.templateId,disableSms:true,variables:{'#{학생명}':booking.name,'#{학교}':booking.school,'#{학년}':booking.grade,'#{수업명}':booking.title,'#{날짜}':booking.date,'#{시작시간}':booking.time_start,'#{종료시간}':booking.time_end,'#{조회코드}':booking.access_code}}}],showMessageList:true}),
      signal:AbortSignal.timeout(8000),
    });
    const result=await response.json() as ApiResponse & {errorCode?:string;message?:string};
    const accepted=response.ok?result.messageList?.find(x=>x.messageId&&x.statusCode==='2000'):undefined;
    const error=String(result.failedMessageList?.[0]?.statusMessage||result.message||result.errorCode||`발송 접수 실패 (${response.status})`).slice(0,200);
    await db().prepare('UPDATE bookings SET notification_status=?,notification_message_id=?,notification_error=? WHERE id=?').bind(accepted?'accepted':'failed',accepted?.messageId||null,accepted?null:error,id).run();
    return accepted?'accepted':'failed';
  }catch{
    await db().prepare("UPDATE bookings SET notification_status='unknown',notification_error='접수 여부 불명: 발송 서비스에서 확인 필요' WHERE id=?").bind(id).run();
    return 'unknown';
  }
}
