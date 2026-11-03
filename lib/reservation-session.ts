import {env} from 'cloudflare:workers';
import type {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/server';
import {getStudentSession,type StudentRecord} from '@/lib/students';
type Scope='booking'|'reservation';
const names={booking:'student_booking',reservation:'student_reservation'};
const maxLifetime=30*24*60*60*1000;
async function sign(scope:Scope,s:StudentRecord,expiry:string){
 const secret=String((env as unknown as Record<string,string>).SESSION_SECRET||'');if(!secret)throw Error('접속 설정을 확인해 주세요.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([scope==='reservation'?'reservation-pin-v2':'reservation-scope-v1',scope,s.id,s.pin_hash,s.phone,expiry]))))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function read(req:NextRequest,scope:Scope){
 const [id,expiry,mac,...extra]=(req.cookies.get(names[scope])?.value||'').split('.');
 if(extra.length||!id||!/^\d+$/.test(expiry)||Number(expiry)<=Date.now()||Number(expiry)>Date.now()+maxLifetime||!mac)return null;
 const s=await db().prepare('SELECT * FROM students WHERE id=? AND active=1').bind(id).first<StudentRecord>();if(!s)return null;
 const expected=await sign(scope,s,expiry);if(expected.length!==mac.length)return null;
 let diff=0;for(let i=0;i<mac.length;i++)diff|=mac.charCodeAt(i)^expected.charCodeAt(i);return diff?null:s;
}
export async function getReservationStudent(req:NextRequest){return await getStudentSession(req)||await read(req,'reservation')}
export async function getBookingStudent(req:NextRequest){return await read(req,'booking')||await getReservationStudent(req)}
export async function setReservationScope(res:NextResponse,req:NextRequest,s:StudentRecord,scope:Scope,remember=false){
 const lifetime=remember?maxLifetime:scope==='booking'?12*60*60*1000:60*60*1000,expiry=String(Date.now()+lifetime);
 res.cookies.set(names[scope],`${s.id}.${expiry}.${await sign(scope,s,expiry)}`,{httpOnly:true,secure:new URL(req.url).protocol==='https:',sameSite:'strict',path:'/',...(remember?{maxAge:lifetime/1000}:{})});return res;
}
export function clearReservationScopes(res:NextResponse){res.cookies.delete(names.booking);res.cookies.delete(names.reservation);res.cookies.delete('student_profile');res.cookies.delete('student_lookup');return res}
export function reservationProfile(s:StudentRecord,verified=false){return {nickname:s.nickname,grade:s.grade,verified}}

// Limit four-digit credential guesses across different networks as well.
export async function allowReservationVerification(nickname:string){
 const now=Date.now(),key='reservation-verification:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(nickname)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const row=await db().prepare(`INSERT INTO student_login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(key,now+15*60*1000,now,now).first<{attempts:number}>();return !!row&&row.attempts<=10;
}
