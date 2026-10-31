import {db} from '@/lib/server';
import {decryptSetting,encryptSetting} from '@/lib/make-calendar';

type ScriptSetting={secret:string;url:string};
const id='google_script';
const randomSecret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export function validScriptUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url.pathname)&&!url.search&&!url.hash}catch{return false}}
async function read(){const row=await db().prepare('SELECT webhook_encrypted FROM calendar_settings WHERE id=?').bind(id).first<{webhook_encrypted:string}>();return row?JSON.parse(await decryptSetting(row.webhook_encrypted)) as ScriptSetting:null}
async function write(value:ScriptSetting){await db().prepare('INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at').bind(id,await encryptSetting(JSON.stringify(value)),new Date().toISOString()).run()}
export async function getScriptConnection(){const data=await read();return data?.url?data:null}
export async function prepareScript(origin:string){let data=await read();if(!data){data={secret:randomSecret(),url:''};await write(data)}return scriptText(data.secret,origin)}
export async function saveScriptUrl(url:string){if(!validScriptUrl(url))throw new Error('Google Apps Script 배포 URL(/exec)을 입력해 주세요.');const data=await read();if(!data)throw new Error('먼저 스크립트 코드를 준비해 주세요.');await write({...data,url});await db().prepare("UPDATE bookings SET calendar_sync_status='pending',calendar_sync_error=NULL WHERE status!='cancelled' AND date>=date('now','+9 hours')").run()}
export async function removeScriptConnection(){await db().prepare('DELETE FROM calendar_settings WHERE id=?').bind(id).run()}

import {googleScriptTemplate} from './google-script-template';
export function scriptText(secret:string,origin:string){return googleScriptTemplate.replaceAll('__BOOKING_TOKEN__',secret).replaceAll('__BOOKING_SITE__',origin)}
