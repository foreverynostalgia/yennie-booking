import {env} from 'cloudflare:workers';
const encoder=new TextEncoder();
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const unbase64=(value:string)=>Uint8Array.from(atob(value),ch=>ch.charCodeAt(0));
async function key(){
 const secret=String((env as unknown as Record<string,string>).SESSION_SECRET||'');
 if(!secret)throw new Error('서버 암호화 설정이 필요합니다.');
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode('student-pin-v1:'+secret));
 return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptStudentPin(pin:string,studentId:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(studentId)},await key(),encoder.encode(pin));
 return `v1.${base64(iv)}.${base64(new Uint8Array(cipher))}`;
}
export async function decryptStudentPin(value:string,studentId:string){
 const [version,iv,cipher,...extra]=value.split('.');
 if(version!=='v1'||extra.length||!iv||!cipher)throw new Error('PIN 저장 형식을 확인해 주세요.');
 const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv),additionalData:encoder.encode(studentId)},await key(),unbase64(cipher));
 return new TextDecoder().decode(raw);
}
