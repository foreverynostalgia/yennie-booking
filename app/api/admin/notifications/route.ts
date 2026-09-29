import {NextRequest} from 'next/server';
import {protectedMutation,fail,json} from '@/lib/server';
import {sendReservationAlimtalk} from '@/lib/alimtalk';

export async function POST(req:NextRequest){
  if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
  const {id}=await req.json() as {id?:string};
  if(!id||typeof id!=='string')return fail('예약을 선택해 주세요.');
  const status=await sendReservationAlimtalk(id,true);
  if(status==='skipped')return fail('재시도 가능한 예약이 아닙니다.',409);
  return json({notificationStatus:status});
}
