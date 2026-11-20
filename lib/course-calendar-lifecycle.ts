import {db} from './server';
import {getScriptConnection} from './script-calendar';
import {requestGoogleScript} from './google-script-http';
export async function syncCourseCalendarLifecycle(){
 const connection=await getScriptConnection();if(!connection)return;
 try{const {result}=await requestGoogleScript(connection.url,{token:connection.secret,action:'sync-courses'});if(!result.ok&&result.error)throw Error('Google Script 오류: '+String(result.error).slice(0,300));if(!result.ok||Number(result.version)<8)throw Error('수업 캘린더 자동 생성·숨김을 사용하려면 Google 연동 코드를 새로 복사해 새 버전으로 배포하세요.');await db().prepare("DELETE FROM calendar_settings WHERE id='google_course_lifecycle_error'").run()}
 catch(e){await db().prepare("INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) VALUES('google_course_lifecycle_error',?,?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at").bind(e instanceof Error?e.message:'수업 캘린더 연결 실패',new Date().toISOString()).run()}
}
