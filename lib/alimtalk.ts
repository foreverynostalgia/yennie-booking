import { env } from 'cloudflare:workers';
import { db } from '@/lib/server';

type Reservation = { id:string; phone:string; name:string; school:string; grade:string; date:string; time_start:string; time_end:string; access_code:string; title:string; status:string; notification_attempted_at:string|null };
type SendResponse = {receipt_id?:string;id?:string;message?:string;error?:string;success?:boolean;status?:string|number;code?:number;data?:{receipt_id?:string;id?:string;status?:string}};

const configuration = () => {
  const e = env as unknown as Record<string,string|undefined>;
  return {clientKey:e.BOOTPAY_CLIENT_KEY, secretKey:e.BOOTPAY_SECRET_KEY, templateCode:e.BOOTPAY_ALIMTALK_TEMPLATE_CODE};
};
export const alimtalkConfigured = () => Object.values(configuration()).every(Boolean);

async function record(id:string,status:string,messageId:string|null,error:string|null){
  await db().prepare('UPDATE bookings SET notification_status=?,notification_message_id=?,notification_error=? WHERE id=?').bind(status,messageId,error,id).run();
}

// A stable ref_id lets the provider reject duplicate requests after a timeout.
// An explicit retry after a rejected request gets a new reference.
export async function sendReservationAlimtalk(id:string, retry=false) {
  const c=configuration();
  const booking=await db().prepare('SELECT b.*,c.title FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=?').bind(id).first<Reservation>();
  if(!booking || booking.status!=='confirmed')return 'skipped';
  if(!c.clientKey||!c.secretKey||!c.templateCode){
    await db().prepare("UPDATE bookings SET notification_status='unconfigured',notification_error='부트페이 알림톡 설정 필요' WHERE id=? AND notification_status IN ('pending','unconfigured')").bind(id).run();
    return 'unconfigured';
  }
  const allowed=retry?"('failed','unconfigured')":"('pending')";
  const attemptedAt=new Date().toISOString();
  const claim=await db().prepare(`UPDATE bookings SET notification_status='sending',notification_error=NULL,notification_attempted_at=? WHERE id=? AND status='confirmed' AND notification_status IN ${allowed}`).bind(attemptedAt,id).run();
  if(!claim.meta.changes)return 'skipped';
  const refId=retry&&booking.notification_attempted_at?`${id}:retry:${attemptedAt}`:id;

  try{
    const response=await fetch('https://api.bootapi.com/v1/alimtalk/send',{
      method:'POST',headers:{Authorization:`Basic ${btoa(`${c.clientKey}:${c.secretKey}`)}`,'Content-Type':'application/json'},
      body:JSON.stringify({template_code:c.templateCode,to:booking.phone,ref_id:refId,variables:{
        학생명:booking.name,학교:booking.school,학년:booking.grade,수업명:booking.title,날짜:booking.date,시작시간:booking.time_start,종료시간:booking.time_end,조회코드:booking.access_code,
      }}),signal:AbortSignal.timeout(8000),
    });
    const result=await response.json() as SendResponse;
    if(response.ok&&result.success!==false&&!(typeof result.code==='number'&&result.code<0)&&result.status!=='failed'){
      await record(id,'accepted',String(result.receipt_id||result.data?.receipt_id||result.id||result.data?.id||refId),null);
      return 'accepted';
    }
    // A server error may follow a successfully accepted request; do not resend it.
    const status=response.status>=500?'unknown':'failed';
    await record(id,status,null,String(result.message||result.error||`알림톡 접수 실패 (${response.status})`).slice(0,200));
    return status;
  }catch{
    await record(id,'unknown',null,'접수 여부 불명: 부트페이 발송 내역에서 확인 필요');
    return 'unknown';
  }
}
