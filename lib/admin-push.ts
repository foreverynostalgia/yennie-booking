import {env} from 'cloudflare:workers';
import {db} from '@/lib/server';

type PushConfig={VAPID_PUBLIC_KEY?:string;VAPID_PRIVATE_JWK?:string;VAPID_SUBJECT?:string};
type PushDevice={endpoint:string;p256dh:string;auth:string};
const enc=new TextEncoder();
const config=()=>env as unknown as PushConfig;
export const pushPublicKey=()=>config().VAPID_PUBLIC_KEY||'';
export const pushReady=()=>!!(pushPublicKey()&&config().VAPID_PRIVATE_JWK&&config().VAPID_SUBJECT);
const b64=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const bytes=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const join=(...values:Uint8Array[])=>{const result=new Uint8Array(values.reduce((n,v)=>n+v.length,0));let i=0;for(const value of values){result.set(value,i);i+=value.length}return result};
const data=(value:string)=>enc.encode(value);
const hkdf=async(salt:Uint8Array,ikm:Uint8Array,info:Uint8Array,length:number)=>{
 const key=await crypto.subtle.importKey('raw',ikm as BufferSource,'HKDF',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:salt as BufferSource,info:info as BufferSource},key,length*8));
};
const validEndpoint=(endpoint:string)=>{try{const url=new URL(endpoint);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(
 url.hostname.endsWith('.push.apple.com')||url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.notify.windows.com')
 )}catch{return false}};
export function validPushDevice(device:PushDevice){try{return validEndpoint(device.endpoint)&&bytes(device.p256dh).length===65&&bytes(device.p256dh)[0]===4&&bytes(device.auth).length===16}catch{return false}}

export async function makePushRequest(device:PushDevice,message:object){
 const conf=config();if(!pushReady()||!validPushDevice(device))throw new Error('푸시 설정 또는 구독 정보를 확인해 주세요.');
 const jwk=JSON.parse(conf.VAPID_PRIVATE_JWK!) as JsonWebKey;
 const signing=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const tokenStart=b64(data(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+b64(data(JSON.stringify({aud:new URL(device.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:conf.VAPID_SUBJECT})));
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signing,data(tokenStart)));
 const jwt=tokenStart+'.'+b64(signature);
 const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const serverKey=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
 const clientKey=bytes(device.p256dh);
 const clientPublic=await crypto.subtle.importKey('raw',clientKey as BufferSource,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:clientPublic},ephemeral.privateKey,256));
 const ikm=await hkdf(bytes(device.auth),shared,join(data('WebPush: info'),new Uint8Array([0]),clientKey,serverKey),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await hkdf(salt,ikm,join(data('Content-Encoding: aes128gcm'),new Uint8Array([0])),16);
 const nonce=await hkdf(salt,ikm,join(data('Content-Encoding: nonce'),new Uint8Array([0])),12);
 const plain=join(data(JSON.stringify(message)),new Uint8Array([2]));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce as BufferSource},await crypto.subtle.importKey('raw',cek as BufferSource,'AES-GCM',false,['encrypt']),plain as BufferSource));
 if(cipher.length>4096)throw new Error('푸시 메시지가 너무 깁니다.');
 const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096);header[20]=65;
 return {endpoint:device.endpoint,init:{method:'POST',headers:{Authorization:`vapid t=${jwt}, k=${pushPublicKey()}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'86400'},body:join(header,serverKey,cipher)} as RequestInit};
}

export async function notifyAdminPush(kind:'reservation'|'cancellation',booking:{name:string;title:string;date:string;start:string;end:string}){
 if(!pushReady())return;
 const devices=await db().prepare('SELECT endpoint,p256dh,auth FROM admin_push_subscriptions LIMIT 20').all<PushDevice>();
 const message={title:kind==='reservation'?'새 수업 예약':'예약 취소 요청',body:`${booking.name} · ${booking.title} · ${booking.date} ${booking.start}–${booking.end}`,url:'/admin?tab='+ (kind==='reservation'?'bookings':'requests'),tag:crypto.randomUUID()};
 const results=await Promise.allSettled(devices.results.map(async device=>{
  const {endpoint,init}=await makePushRequest(device,message);
  const response=await fetch(endpoint,init);
  if(response.status===404||response.status===410)await db().prepare('DELETE FROM admin_push_subscriptions WHERE endpoint=?').bind(endpoint).run();
  else if(!response.ok)throw new Error(`푸시 전송 실패: ${response.status}`);
 }));
 for(const result of results)if(result.status==='rejected')console.error('관리자 푸시 전송 실패',result.reason);
}
