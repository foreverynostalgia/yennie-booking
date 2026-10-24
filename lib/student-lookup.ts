import {env} from 'cloudflare:workers';
import type {NextRequest,NextResponse} from 'next/server';

const cookieName='student_lookup';
const lifetime=60*60;
export function lookupIdentity(name:unknown,number:unknown){
 const student=String(name||'').trim(),phone=String(number||'').replace(/\D/g,'');
 return student.length>=2&&student.length<=80&&/^0\d{9,10}$/.test(phone)?{name:student,phone}:null;
}
async function signature(name:string,phone:string,expiry:string){
 const secret=String((env as unknown as Record<string,string>).SESSION_SECRET||'');
 if(!secret)throw new Error('조회 세션을 설정할 수 없습니다.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['student-lookup',name,phone,expiry]))))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function setLookupSession(response:NextResponse,req:NextRequest,name:string,phone:string){
 const expiry=String(Date.now()+lifetime*1000);
 response.cookies.set(cookieName,`${expiry}.${await signature(name,phone,expiry)}`,{httpOnly:true,secure:new URL(req.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:lifetime});
 response.headers.set('Cache-Control','no-store');
 return response;
}
export async function studentLookupAuthorized(req:NextRequest,name:string,phone:string){
 if(!lookupIdentity(name,phone))return false;
 const [expiry,mac,...extra]=(req.cookies.get(cookieName)?.value||'').split('.');
 if(extra.length||!/^\d+$/.test(expiry)||Number(expiry)<=Date.now()||Number(expiry)>Date.now()+lifetime*1000||!mac)return false;
 const expected=await signature(name,phone,expiry);
 if(mac.length!==expected.length)return false;
 let difference=0;for(let i=0;i<mac.length;i++)difference|=mac.charCodeAt(i)^expected.charCodeAt(i);
 return difference===0;
}
