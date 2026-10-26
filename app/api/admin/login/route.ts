import { NextRequest } from 'next/server';
import {adminAccounts,matchesAdmin,fail,json,loginCookie,sameOrigin} from '@/lib/server';
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
  const accounts=adminAccounts();
  if(!accounts.length)return fail('관리자 설정이 완료되지 않았습니다.',503);
  const body=await req.json().catch(()=>null) as {username?:unknown;password?:unknown}|null;
  const account=body?accounts.find(account=>matchesAdmin(account,body.username,body.password)):null;
  if(!account)return fail('아이디 또는 비밀번호가 올바르지 않습니다.',401);
  const res=json({ok:true,role:account.role});
  res.cookies.set('admin_session',await loginCookie(account.username),{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:43200});
  return res;
}
