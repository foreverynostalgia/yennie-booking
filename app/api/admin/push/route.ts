import {NextRequest} from 'next/server';
import {admin,db,fail,json,protectedMutation} from '@/lib/server';
import {pushPublicKey,pushReady,validPushDevice} from '@/lib/admin-push';
export async function GET(req:NextRequest){
 if(!await admin(req))return fail('관리자 로그인이 필요합니다.',401);
 return json({publicKey:pushPublicKey(),configured:pushReady()});
}
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 if(!pushReady())return fail('알림 설정이 완료되지 않았습니다.',503);
 try{
  const x=await req.json() as {endpoint?:string;keys?:{p256dh?:string;auth?:string}};
  const device={endpoint:x.endpoint||'',p256dh:x.keys?.p256dh||'',auth:x.keys?.auth||''};
  if(!validPushDevice(device))return fail('알림 구독 정보를 확인해 주세요.');
  await db().prepare('INSERT INTO admin_push_subscriptions(endpoint,p256dh,auth,created_at) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth').bind(device.endpoint,device.p256dh,device.auth,new Date().toISOString()).run();
  return json({ok:true});
 }catch{return fail('알림 기기를 등록하지 못했습니다.',503)}
}
export async function DELETE(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const x=await req.json() as {endpoint?:string};if(!x.endpoint)return fail('등록된 기기를 찾을 수 없습니다.');await db().prepare('DELETE FROM admin_push_subscriptions WHERE endpoint=?').bind(x.endpoint).run();return json({ok:true})}catch{return fail('알림을 해제하지 못했습니다.',503)}
}
