import {db} from '@/lib/server';
const prefix='google_course_calendar_';
export function validCourseCalendarId(value:string){return /^[A-Za-z0-9._+-]+@group\.calendar\.google\.com$/.test(value)&&value.length<=300}
export async function courseCalendarId(courseId:string){return (await db().prepare('SELECT webhook_encrypted AS calendarId FROM calendar_settings WHERE id=?').bind(prefix+courseId).first<{calendarId:string}>())?.calendarId||''}
export async function saveCourseCalendar(courseId:string,calendarId:string){
 if(calendarId&&!validCourseCalendarId(calendarId))throw Error('별도 구글 캘린더의 캘린더 ID(@group.calendar.google.com)를 입력하세요.');
 if(!calendarId){await db().prepare('DELETE FROM calendar_settings WHERE id=?').bind(prefix+courseId).run();return}
 const result=await db().prepare(`INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM calendar_settings cs JOIN courses c ON cs.id='google_course_calendar_'||c.id WHERE c.active>=0 AND cs.id<>? AND cs.webhook_encrypted=?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at`).bind(prefix+courseId,calendarId,new Date().toISOString(),prefix+courseId,calendarId).run();
 if(!result.meta.changes)throw Error('이 캘린더는 다른 수업에 연결되어 있습니다. 수업별로 다른 캘린더를 선택하세요.');
}
