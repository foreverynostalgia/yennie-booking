import {prerequisiteError,prerequisiteMessage} from '@/lib/course-prerequisite';
import {queueGoogleCalendarSync} from '@/lib/google-calendar';
import {NextRequest} from 'next/server';
import {db,fail,json,protectedMutation} from '@/lib/server';
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const {id,ids}=await req.json() as {id?:string;ids?:unknown};
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
