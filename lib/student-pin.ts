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

// After a successful PIN login the server briefly knows the plaintext PIN.
// If the stored admin-viewable copy is missing or was encrypted with a
// previous server key (e.g. after moving hosts), re-encrypt it with the
// current key so "PIN 보기" works again. Best effort: never blocks login.
export async function refreshStudentPinCopy(student:{id:string;pin_encrypted:string|null},pin:unknown,database:D1Database){
 try{
  if(typeof pin!=='string')return false;
  const normalized=pin.trim().toUpperCase();
  if(student.pin_encrypted){try{if(await decryptStudentPin(student.pin_encrypted,student.id)===normalized)return false}catch{/* old key: re-encrypt below */}}
  const fresh=await encryptStudentPin(normalized,student.id);
  const result=await database.prepare('UPDATE students SET pin_encrypted=? WHERE id=? AND pin_encrypted IS ?').bind(fresh,student.id,student.pin_encrypted).run();
  return (result.meta?.changes??0)>0;
 }catch{return false}
}
