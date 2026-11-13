import {googleEventColor} from '@/lib/course-colors';
import {requestGoogleScript} from '@/lib/google-script-http';
import {NextRequest} from 'next/server';
import {admin,db,fail,json,protectedMutation} from '@/lib/server';
import {googleCalendarConfigured,syncGoogleCalendarBooking} from '@/lib/google-calendar';
import {getMakeWebhook,storeMakeWebhook,removeMakeWebhook} from '@/lib/make-calendar';
import {getScriptConnection} from '@/lib/script-calendar';
export async function GET(req:NextRequest){
 if(!await admin(req))return fail('관리자 로그인이 필요합니다.',401);
 const rows=await db().prepare("SELECT calendar_sync_status AS status,COUNT(*) AS count FROM bookings WHERE status!='cancelled' AND date>=? GROUP BY calendar_sync_status").bind(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())).all<{status:string;count:number}>();
 const failed=await db().prepare("SELECT calendar_sync_error AS error FROM bookings WHERE calendar_sync_status='failed' AND calendar_sync_error IS NOT NULL ORDER BY date DESC LIMIT 1").first<{error:string}>();
 const courses=await db().prepare('SELECT id,title,color FROM courses WHERE active=1 ORDER BY title').all<{id:string;title:string;color:string}>();
 const inbound=await db().prepare("SELECT MAX(updated_at) AS at FROM calendar_settings WHERE id LIKE 'google_event_%' OR id='google_inbound_health'").first<{at:string|null}>();
 const protocol=await db().prepare("SELECT webhook_encrypted AS version FROM calendar_settings WHERE id='google_script_version'").first<{version:string}>();
 const lifecycle=await db().prepare("SELECT webhook_encrypted AS error FROM calendar_settings WHERE id='google_course_lifecycle_error'").first<{error:string}>();
 const script=!!await getScriptConnection(),make=script?false:!!await getMakeWebhook();return json({courseColors:courses.results.map(c=>({title:c.title,colorId:googleEventColor(c.color,c.id)})),scriptVersion:protocol?Number(protocol.version):null,lastInboundAt:inbound?.at||null,configured:script||make||googleCalendarConfigured(),mode:script?'script':make?'make':googleCalendarConfigured()?'service':'none',counts:rows.results,lastError:lifecycle?.error||failed?.error||null});
}
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 const connection=await getScriptConnection(),script=!!connection;
 const body=await req.json().catch(()=>({})) as {refresh?:boolean;diagnose?:boolean;bookingId?:string;preserveColor?:boolean};
 if(body.bookingId!==undefined){if(!/^[a-f0-9-]{36}$/.test(body.bookingId))return fail('예약 ID를 확인하세요.');const exists=await db().prepare('SELECT id FROM bookings WHERE id=?').bind(body.bookingId).first();if(!exists)return fail('예약을 찾을 수 없습니다.',404);await syncGoogleCalendarBooking(body.bookingId,{preserveColor:body.preserveColor===true});const row=await db().prepare('SELECT calendar_sync_status AS status,calendar_sync_error AS error FROM bookings WHERE id=?').bind(body.bookingId).first();return json({bookingId:body.bookingId,...row})}
 if(body.diagnose===true){if(!connection)return fail('Google Script 연결 주소가 없습니다.',409);try{const {result,diagnostics}=await requestGoogleScript(connection.url,{token:connection.secret,action:'diagnose',bookingId:'diagnostic-not-a-booking'});return json({diagnostics,scriptResponse:result.error||null,version:result.version||null});}catch(e){return fail(e instanceof Error?e.message:'Google 연결 확인 실패',502)}}
 if(!script&&!await getMakeWebhook()&&!googleCalendarConfigured())return fail('구글 캘린더 연결 정보가 설정되지 않았습니다.',409);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(body.refresh===true)await db().prepare("UPDATE bookings SET calendar_sync_status='pending',calendar_sync_error=NULL WHERE status!='cancelled' AND date>=?").bind(today).run();
 const result=await db().prepare(script?"SELECT id FROM bookings WHERE (status!='cancelled' AND (date>=? OR calendar_synced_at IS NOT NULL OR attendance_updated_at IS NOT NULL) AND calendar_sync_status!='synced') OR (status='cancelled' AND calendar_synced_at IS NOT NULL AND calendar_sync_status!='synced') ORDER BY CASE WHEN calendar_sync_status='failed' THEN 1 ELSE 0 END,date ASC LIMIT 1":"SELECT id FROM bookings WHERE (status!='cancelled' AND (date>=? OR calendar_synced_at IS NOT NULL OR attendance_updated_at IS NOT NULL) AND calendar_sync_status NOT IN ('synced','sent')) OR (status='cancelled' AND calendar_synced_at IS NOT NULL AND calendar_sync_status NOT IN ('synced','sent')) ORDER BY CASE WHEN calendar_sync_status='failed' THEN 1 ELSE 0 END,date ASC LIMIT 1").bind(today).all<{id:string}>();
 for(const row of result.results)await syncGoogleCalendarBooking(row.id);
 const failures=await db().prepare("SELECT COUNT(*) AS count FROM bookings WHERE id IN (SELECT value FROM json_each(?)) AND calendar_sync_status='failed'").bind(JSON.stringify(result.results.map(x=>x.id))).first<{count:number}>();
 return json({processed:result.results.length,failed:failures?.count||0,hasMore:result.results.length===1 && !(failures?.count)});
}

export async function PUT(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const {url}=await req.json() as {url?:string};await storeMakeWebhook(String(url||''));return json({ok:true})}catch(error){return fail(error instanceof Error?error.message:'Make 주소를 저장하지 못했습니다.')}
}
export async function DELETE(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);await removeMakeWebhook();return json({ok:true})
}
