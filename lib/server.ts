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
async function sig(value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function admin(req:NextRequest){if(!secret()||!adminPassword())return false;const token=req.cookies.get('admin_session')?.value||'';const [expiry,mac]=token.split('.');return !!expiry&&Number(expiry)>Date.now()&&mac===await sig(expiry)}
export async function loginCookie(){const expiry=String(Date.now()+12*60*60*1000);return `${expiry}.${await sig(expiry)}`}
export async function protectedMutation(req:NextRequest){return sameOrigin(req)&&await admin(req)}
