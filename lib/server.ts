import { env } from 'cloudflare:workers';
import { NextRequest, NextResponse } from 'next/server';
export type Booking = {id:string;course_id:string;date:string;name:string;school:string;grade:string;phone:string;access_code:string;status:string;created_at:string;cancel_requested_at:string|null;cancelled_at:string|null;title?:string;start?:string;end?:string};
export const db = () => { if (!env.DB) throw new Error('예약 저장소에 연결할 수 없습니다.'); return env.DB; };
export const json = (data:unknown,status=200) => NextResponse.json(data,{status});
export const fail = (message:string,status=400) => json({error:message},status);
export const phone = (s:string) => s.replace(/\D/g,'');
export function endAt(date:string,end:string){return new Date(`${date}T${end}:00+09:00`).getTime()}
export function future(date:string,end:string){return endAt(date,end)>Date.now()}
export function sameOrigin(req:NextRequest){const origin=req.headers.get('origin');return !origin || origin===new URL(req.url).origin}
function secret(){return String((env as unknown as Record<string,string>).SESSION_SECRET||'')}
export function adminUsername(){return String((env as unknown as Record<string,string>).ADMIN_USERNAME||'')}
export function adminPassword(){return String((env as unknown as Record<string,string>).ADMIN_PASSWORD||'')}
export function adminAccounts(){
  const settings=env as unknown as Record<string,string>;
  return [
    {username:adminUsername(),password:adminPassword(),role:'owner' as const},
    {username:String(settings.ADMIN_SECONDARY_USERNAME||''),password:String(settings.ADMIN_SECONDARY_PASSWORD||''),role:'viewer' as const},
  ].filter(account=>account.username&&account.password);
}
export function matchesAdmin(account:{username:string;password:string},username:unknown,password:unknown){
  if(typeof username!=='string'||typeof password!=='string')return false;
  let mismatch=account.password.length^password.length;
  for(let i=0;i<account.password.length;i++)mismatch|=account.password.charCodeAt(i)^(password.charCodeAt(i)||0);
  return account.username===username&&mismatch===0;
}
async function sig(value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
export type AdminRole='owner'|'viewer';
export async function adminRoleForToken(token:string):Promise<AdminRole|null>{
 if(!secret())return null;
 const [version,encodedUsername,expiry,mac,...extra]=token.split('.');
 if(version!=='v2'||extra.length||!encodedUsername||!/^\d+$/.test(expiry)||Number(expiry)<=Date.now()||Number(expiry)>Date.now()+43200000||!mac)return null;
 let username:string;try{username=decodeURIComponent(encodedUsername)}catch{return null}
 const account=adminAccounts().find(a=>a.username===username);if(!account)return null;
 const expected=await sig(JSON.stringify(['admin-session-v2',account.username,account.role,account.password,expiry]));
 if(mac.length!==expected.length)return null;let mismatch=0;for(let i=0;i<mac.length;i++)mismatch|=mac.charCodeAt(i)^expected.charCodeAt(i);
 return mismatch?null:account.role;
}
export async function adminRole(req:NextRequest){return adminRoleForToken(req.cookies.get('admin_session')?.value||'')}
// Default administrator access remains full-control only. Viewer access is
// explicitly allowed on the calendar, planner and student-list read endpoints.
export async function admin(req:NextRequest){return await adminRole(req)==='owner'}
export async function canViewAdmin(req:NextRequest){return await adminRole(req)!==null}
export async function loginCookie(username=adminUsername()){
 const account=adminAccounts().find(a=>a.username===username);if(!account)throw new Error('관리자 계정을 확인해 주세요.');
 const expiry=String(Date.now()+43200000);
 return `v2.${encodeURIComponent(account.username)}.${expiry}.${await sig(JSON.stringify(['admin-session-v2',account.username,account.role,account.password,expiry]))}`;
}
export async function protectedMutation(req:NextRequest){return sameOrigin(req)&&await admin(req)}
