import {NextRequest} from 'next/server';
import {db,fail,json,protectedMutation} from '@/lib/server';
import {makePushRequest} from '@/lib/admin-push';

export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const {endpoint}=await req.json() as {endpoint?:string};
  if(!endpoint)return fail('등록된 기기를 찾을 수 없습니다.');
  const device=await db().prepare('SELECT endpoint,p256dh,auth FROM admin_push_subscriptions WHERE endpoint=?').bind(endpoint).first<{endpoint:string;p256dh:string;auth:string}>();
  if(!device)return fail('알림을 다시 켜서 기기를 등록해 주세요.',404);
  const request=await makePushRequest(device,{title:'알림 테스트',body:'새 예약과 취소 요청 알림을 받을 준비가 되었습니다.',url:'/admin?tab=bookings'});
  const response=await fetch(request.endpoint,request.init);
  if(response.status===404||response.status===410){await db().prepare('DELETE FROM admin_push_subscriptions WHERE endpoint=?').bind(endpoint).run();return fail('구독이 만료되었습니다. 알림을 다시 켜 주세요.',410)}
  if(!response.ok)return fail(`푸시 서비스 응답: ${response.status}`,502);
  return json({ok:true});
 }catch(e){console.error('Push test failed',e);return fail('테스트 알림을 전송하지 못했습니다.',503)}
}
