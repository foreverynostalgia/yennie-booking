import {db} from '@/lib/server';
import {decryptSetting,encryptSetting} from '@/lib/make-calendar';

type ScriptSetting={secret:string;url:string};
const id='google_script';
const randomSecret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export function validScriptUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url.pathname)&&!url.search&&!url.hash}catch{return false}}
async function read(){const row=await db().prepare('SELECT webhook_encrypted FROM calendar_settings WHERE id=?').bind(id).first<{webhook_encrypted:string}>();return row?JSON.parse(await decryptSetting(row.webhook_encrypted)) as ScriptSetting:null}
async function write(value:ScriptSetting){await db().prepare('INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at').bind(id,await encryptSetting(JSON.stringify(value)),new Date().toISOString()).run()}
export async function getScriptConnection(){const data=await read();return data?.url?data:null}
export async function prepareScript(){let data=await read();if(!data){data={secret:randomSecret(),url:''};await write(data)}return scriptText(data.secret)}
export async function saveScriptUrl(url:string){if(!validScriptUrl(url))throw new Error('Google Apps Script 배포 URL(/exec)을 입력해 주세요.');const data=await read();if(!data)throw new Error('먼저 스크립트 코드를 준비해 주세요.');await write({...data,url});await db().prepare("UPDATE bookings SET calendar_sync_status='pending',calendar_sync_error=NULL WHERE status!='cancelled' AND date>=date('now','+9 hours')").run()}
export async function removeScriptConnection(){await db().prepare('DELETE FROM calendar_settings WHERE id=?').bind(id).run()}

export function scriptText(secret:string){return `// 옌쌤 과학 예약 → 내 Google Calendar (이 코드 전체를 붙여넣으세요)
const BOOKING_TOKEN = '${secret}';

function authorizeCalendar() {
  return CalendarApp.getDefaultCalendar().getName();
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.token !== BOOKING_TOKEN) throw new Error('인증 코드가 일치하지 않습니다.');
    if (!/^[a-f0-9-]{36}$/.test(String(p.bookingId))) throw new Error('예약 ID 오류');
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      const cal = CalendarApp.getDefaultCalendar();
      const props = PropertiesService.getScriptProperties();
      const key = 'booking_' + p.bookingId;
      const eventId = props.getProperty(key);
      let event = eventId ? cal.getEventById(eventId) : null;
      if (p.action === 'delete') {
        if (event) event.deleteEvent();
        props.deleteProperty(key);
      } else if (p.action === 'upsert') {
        const start = new Date(p.date + 'T' + p.start + ':00+09:00');
        const end = new Date(p.date + 'T' + p.end + ':00+09:00');
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) throw new Error('예약 날짜·시간 오류');
        const title = p.name;
        const colors = [CalendarApp.EventColor.PALE_BLUE, CalendarApp.EventColor.PALE_GREEN, CalendarApp.EventColor.MAUVE, CalendarApp.EventColor.PALE_RED, CalendarApp.EventColor.YELLOW, CalendarApp.EventColor.ORANGE, CalendarApp.EventColor.CYAN, CalendarApp.EventColor.GRAY, CalendarApp.EventColor.BLUE, CalendarApp.EventColor.GREEN, CalendarApp.EventColor.RED];
        const description = ['학교: ' + p.school, '학년: ' + p.grade, '출결: ' + p.attendance,
          p.status === 'cancel_pending' ? '취소 승인 대기' : p.status === 'change_pending' ? '변경 승인 대기' : '',
          p.status === 'change_pending' && p.requestedDate ? '변경 요청: ' + p.requestedDate + ' ' + p.requestedStart + '–' + p.requestedEnd : '',
          p.bookingMarker].filter(Boolean).join('\\n');
        if (event) {
          event.setTitle(title);
          event.setTime(start, end);
          event.setDescription(description);
        } else {
          event = cal.createEvent(title, start, end, {description: description});
          props.setProperty(key, event.getId());
        }
        const colorIndex = Number(p.eventColor) - 1;
        if (Number.isInteger(colorIndex) && colors[colorIndex]) event.setColor(colors[colorIndex]);
      } else throw new Error('지원하지 않는 동작');
      return ContentService.createTextOutput(JSON.stringify({ok:true, version:2, bookingId:p.bookingId})).setMimeType(ContentService.MimeType.JSON);
    } finally { lock.releaseLock(); }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err.message || err)})).setMimeType(ContentService.MimeType.JSON);
  }
}`}
