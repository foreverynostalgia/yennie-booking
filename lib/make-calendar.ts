import {env} from 'cloudflare:workers';
import {db} from '@/lib/server';

const encoder=new TextEncoder();
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(){const secret=String((env as unknown as Record<string,string>).SESSION_SECRET||'');if(secret.length<32)throw new Error('서버 암호화 설정이 필요합니다.');const digest=await crypto.subtle.digest('SHA-256',encoder.encode(secret));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function encryptSetting(value:string){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),encoder.encode(value));return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`}
export async function decryptSetting(value:string){const [iv,cipher]=value.split('.');const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},await key(),unbase64(cipher));return new TextDecoder().decode(raw)}
export function validMakeWebhook(value:string){try{const url=new URL(value);return url.protocol==='https:'&&/^hook(?:\.[a-z0-9-]+)?\.make\.com$/.test(url.hostname)&&url.username===''&&url.password===''&&url.pathname.length>10&&url.search===''&&url.hash===''}catch{return false}}
export async function storeMakeWebhook(url:string){if(!validMakeWebhook(url))throw new Error('Make에서 만든 Custom webhook 주소를 입력해 주세요.');await db().prepare('INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at').bind('make',await encryptSetting(url),new Date().toISOString()).run()}
export async function getMakeWebhook(){const row=await db().prepare("SELECT webhook_encrypted FROM calendar_settings WHERE id='make'").first<{webhook_encrypted:string}>();if(!row)return null;let url:string;try{url=await decryptSetting(row.webhook_encrypted)}catch{return null}if(!validMakeWebhook(url))throw new Error('저장된 Make 연결 주소를 확인해 주세요.');return url}
export async function removeMakeWebhook(){await db().prepare("DELETE FROM calendar_settings WHERE id='make'").run()}
