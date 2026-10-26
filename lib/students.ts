import {env} from 'cloudflare:workers';
import type {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/server';
export type StudentRecord={id:string;nickname:string;name:string;school:string;grade:string;phone:string;pin_hash:string;active:number;created_at:string;updated_at:string};
const cookie='student_profile',lifetime=30*24*60*60;
export const normalizeNickname=(value:unknown)=>String(value||'').normalize('NFKC').trim().toLowerCase();
export const validNickname=(value:string)=>/^[가-힣a-z0-9_-]{2,24}$/.test(value);
export const generatePin=()=>`YE${String(crypto.getRandomValues(new Uint32Array(1))[0]%100).padStart(2,'0')}`;
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function pinHash(pin:string,salt=crypto.randomUUID()){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));
}
export async function verifyPin(pin:unknown,stored:string){if(typeof pin!=='string')return false;pin=pin.trim().toUpperCase();if(!/^(YE\d{2}|\d{6})$/.test(pin as string))return false;const calculated=await pinHash(pin as string,stored.split(':')[0]);if(calculated.length!==stored.length)return false;let difference=0;for(let i=0;i<stored.length;i++)difference|=stored.charCodeAt(i)^calculated.charCodeAt(i);return difference===0}
async function signature(s:StudentRecord,expiry:string){const secret=String((env as unknown as Record<string,string>).SESSION_SECRET||'');if(!secret)throw new Error('학생 접속 설정이 필요합니다.');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['student-profile',s.id,s.pin_hash,expiry]))))}
export async function getStudentSession(req:NextRequest){
 const [id,expiry,mac,...extra]=(req.cookies.get(cookie)?.value||'').split('.');
 if(extra.length||!id||!/^\d+$/.test(expiry)||Number(expiry)<=Date.now()||Number(expiry)>Date.now()+lifetime*1000||!mac)return null;
 const s=await db().prepare('SELECT * FROM students WHERE id=? AND active=1').bind(id).first<StudentRecord>();if(!s)return null;
 const expected=await signature(s,expiry);if(mac.length!==expected.length)return null;let diff=0;for(let i=0;i<mac.length;i++)diff|=mac.charCodeAt(i)^expected.charCodeAt(i);return diff?null:s;
}
export async function setStudentSession(response:NextResponse,req:NextRequest,s:StudentRecord,remember:boolean){const expiry=String(Date.now()+lifetime*1000);response.cookies.set(cookie,`${s.id}.${expiry}.${await signature(s,expiry)}`,{httpOnly:true,secure:new URL(req.url).protocol==='https:',sameSite:'strict',path:'/',...(remember?{maxAge:lifetime}:{})});response.headers.set('Cache-Control','no-store');return response}
export function clearStudentSession(response:NextResponse){response.cookies.delete(cookie);response.headers.set('Cache-Control','no-store');return response}
export const publicStudent=(s:StudentRecord)=>({nickname:s.nickname,grade:s.grade});
export async function allowStudentLogin(req:NextRequest,nickname:string){
 const ip=req.headers.get('cf-connecting-ip')||'unknown',now=Date.now();
 async function increment(label:string){
  const key=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(label)));
  return db().prepare(`INSERT INTO student_login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(key,now+15*60*1000,now,now).first<{attempts:number}>();
 }
 // Students sharing academy Wi-Fi have individual limits; the larger IP limit
 // also bounds attempts across different nicknames.
 const [individual,network]=await Promise.all([increment('student:'+ip+':'+nickname),increment('network:'+ip)]);
 await db().prepare('DELETE FROM student_login_attempts WHERE expires_at<?').bind(now).run();
 return !!individual&&individual.attempts<=5&&!!network&&network.attempts<=200;
}
