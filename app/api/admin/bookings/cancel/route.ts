import {NextRequest} from 'next/server';
import {db,fail,json,protectedMutation} from '@/lib/server';
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const {id}=await req.json() as {id?:string};
  if(typeof id!=='string'||!id)return fail('취소할 예약을 확인해 주세요.');
  const result=await db().prepare("UPDATE bookings SET status='cancelled',cancelled_at=?,requested_date=NULL,requested_start=NULL,requested_end=NULL,change_requested_at=NULL WHERE id=? AND status IN ('confirmed','cancel_pending','change_pending')").bind(new Date().toISOString(),id).run();
  if(!result.meta.changes)return fail('이미 취소되었거나 존재하지 않는 예약입니다.',409);
  return json({ok:true});
 }catch{return fail('예약을 취소하지 못했습니다. 다시 시도해 주세요.',503)}
}
