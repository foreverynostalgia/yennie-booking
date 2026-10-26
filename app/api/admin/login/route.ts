import { NextRequest } from 'next/server';
import {adminAccounts,matchesAdmin,fail,json,loginCookie,sameOrigin} from '@/lib/server';
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
  const accounts=adminAccounts();
  if(!accounts.length)return fail('관리자 설정이 완료되지 않았습니다.',503);
  const body=await req.json().catch(()=>null);
  if(!body||!accounts.some(account=>matchesAdmin(account,body.username,body.password)))return fail('아이디 또는 비밀번호가 올바르지 않습니다.',401);
  const res=json({ok:true});
  res.cookies.set('admin_session',await loginCookie(),{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:43200});
  return res;
}
