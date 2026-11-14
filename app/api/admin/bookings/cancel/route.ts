import {peakOccupancySql} from '@/lib/booking-slots';
import {blockAppliesSql} from '@/lib/reservation-blocks';
import {bookingWeek} from '@/lib/booking-week';
import {prerequisiteError,prerequisiteMessage} from '@/lib/course-prerequisite';
import {queueGoogleCalendarSync} from '@/lib/google-calendar';
import {NextRequest} from 'next/server';
import {db,fail,json,protectedMutation} from '@/lib/server';
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const {id,ids,action}=await req.json() as {id?:string;ids?:unknown;action?:string};
  if(action==='restore'||action==='hide'){
   if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(v=>typeof v!=='string'||!/^[a-f0-9-]{36}$/.test(v)))return fail('예약을 1~1,000건 선택해 주세요.');
   const processedIds:string[]=[],skippedIds:string[]=[];
   for(const bookingId of [...new Set(ids as string[])]){
    const b=await db().prepare("SELECT b.*,COALESCE(b.time_start,c.start) AS slot_start,COALESCE(b.time_end,c.end) AS slot_end FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=? AND b.status='cancelled'").bind(bookingId).first<any>();
    if(!b){skippedIds.push(bookingId);continue}
    if(action==='hide'){await db().prepare("INSERT OR REPLACE INTO calendar_settings(id,webhook_encrypted,updated_at) SELECT 'booking_hidden_'||id,'1',? FROM bookings WHERE id=? AND status='cancelled'").bind(new Date().toISOString(),bookingId).run();processedIds.push(bookingId);continue}
    const week=bookingWeek(b.date);
    try{
     const result=await db().prepare(`UPDATE bookings SET status='confirmed',cancelled_at=NULL,cancel_requested_at=NULL,requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL WHERE id=? AND status='cancelled'
      AND EXISTS(SELECT 1 FROM courses c WHERE c.id=bookings.course_id AND c.active=1 AND (c.start_date IS NULL OR c.start_date<=bookings.date) AND (c.end_date IS NULL OR c.end_date>=bookings.date) AND ${peakOccupancySql('bookings.course_id','bookings.date',"COALESCE(bookings.time_start,c.start)","COALESCE(bookings.time_end,c.end)",'bookings.id')}<c.capacity
      AND (c.weekly_limit=0 OR (SELECT COUNT(*) FROM bookings wb WHERE wb.course_id=c.id AND (wb.student_id=bookings.student_id OR (wb.name=bookings.name AND wb.phone=bookings.phone)) AND wb.date>=? AND wb.date<? AND wb.status IN ('confirmed','cancel_pending','change_pending'))<c.weekly_limit))
      AND (student_id IS NULL OR EXISTS(SELECT 1 FROM students s WHERE s.id=bookings.student_id AND s.active=1))
      AND NOT EXISTS(SELECT 1 FROM reservation_blocks rb WHERE rb.date=bookings.date AND ${blockAppliesSql('bookings.course_id')} AND rb.start<? AND rb.end>?)
      AND NOT EXISTS(SELECT 1 FROM bookings other WHERE other.id<>bookings.id AND other.course_id=bookings.course_id AND other.date=bookings.date AND (other.student_id=bookings.student_id OR (other.name=bookings.name AND other.phone=bookings.phone)) AND other.status IN ('confirmed','cancel_pending','change_pending') AND other.time_start<? AND other.time_end>?)`).bind(bookingId,week.start,week.end,b.slot_end,b.slot_start,b.slot_end,b.slot_start).run();
     if(result.meta.changes){await db().prepare("DELETE FROM calendar_settings WHERE id=?").bind('booking_hidden_'+bookingId).run();processedIds.push(bookingId)}else skippedIds.push(bookingId);
    }catch{skippedIds.push(bookingId)}
   }
   if(action==='restore')await queueGoogleCalendarSync(processedIds);
   return json({ok:true,processedIds,skippedIds});
  }
  if(ids!==undefined){
   if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(value=>typeof value!=='string'||!value||value.length>200))return fail('취소할 예약을 1~1,000건 선택해 주세요.');
   const requested=[...new Set(ids as string[])];
   const courses=await db().prepare('SELECT id,prerequisite_course_id FROM courses').all<{id:string;prerequisite_course_id:string|null}>();
   const rows=await db().prepare("SELECT id,course_id FROM bookings WHERE id IN (SELECT value FROM json_each(?)) AND attendance='unmarked' AND status IN ('confirmed','cancel_pending','change_pending')").bind(JSON.stringify(requested)).all<{id:string;course_id:string}>();
   const depth=(id:string)=>{let d=0;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);id=courses.results.find(c=>c.id===id)?.prerequisite_course_id||'';if(id)d++}return d};
   rows.results.sort((a,b)=>depth(b.course_id)-depth(a.course_id));
   const results=rows.results.length?await db().batch(rows.results.map(row=>db().prepare("UPDATE bookings SET status='cancelled',cancelled_at=?,requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL WHERE id=? AND attendance='unmarked' AND status IN ('confirmed','cancel_pending','change_pending') RETURNING id").bind(new Date().toISOString(),row.id))):[];
   const cancelledIds=results.flatMap(result=>(result.results as {id:string}[]).map(row=>row.id)),cancelled=new Set(cancelledIds);
   await queueGoogleCalendarSync(cancelledIds);return json({ok:true,cancelledIds,skippedIds:requested.filter(value=>!cancelled.has(value))});
  }
  if(typeof id!=='string'||!id)return fail('취소할 예약을 확인해 주세요.');
  const result=await db().prepare("UPDATE bookings SET status='cancelled',cancelled_at=?,requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL WHERE id=? AND attendance='unmarked' AND status IN ('confirmed','cancel_pending','change_pending')").bind(new Date().toISOString(),id).run();
  if(!result.meta.changes)return fail('출결이 입력되었거나 이미 취소된 예약입니다.',409);
  await queueGoogleCalendarSync([id]);return json({ok:true});
 }catch(e){if(prerequisiteError(e))return fail(prerequisiteMessage,409);return fail('예약을 취소하지 못했습니다. 다시 시도해 주세요.',503)}
}
