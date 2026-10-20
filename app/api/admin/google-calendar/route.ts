import {NextRequest} from 'next/server';
import {admin,db,fail,json,protectedMutation} from '@/lib/server';
import {googleCalendarConfigured,syncGoogleCalendarBooking} from '@/lib/google-calendar';
export async function GET(req:NextRequest){
 if(!await admin(req))return fail('관리자 로그인이 필요합니다.',401);
 const rows=await db().prepare("SELECT calendar_sync_status AS status,COUNT(*) AS count FROM bookings WHERE status!='cancelled' AND date>=? GROUP BY calendar_sync_status").bind(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())).all<{status:string;count:number}>();
 const failed=await db().prepare("SELECT calendar_sync_error AS error FROM bookings WHERE calendar_sync_status='failed' AND calendar_sync_error IS NOT NULL ORDER BY date DESC LIMIT 1").first<{error:string}>();
 return json({configured:googleCalendarConfigured(),counts:rows.results,lastError:failed?.error||null});
}
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 if(!googleCalendarConfigured())return fail('구글 캘린더 연결 정보가 설정되지 않았습니다.',409);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const result=await db().prepare("SELECT id FROM bookings WHERE (status!='cancelled' AND date>=? AND calendar_sync_status!='synced') OR (status='cancelled' AND calendar_synced_at IS NOT NULL AND calendar_sync_status!='synced') ORDER BY CASE WHEN calendar_sync_status='failed' THEN 1 ELSE 0 END,date ASC LIMIT 20").bind(today).all<{id:string}>();
 for(const row of result.results)await syncGoogleCalendarBooking(row.id);
 const failures=await db().prepare("SELECT COUNT(*) AS count FROM bookings WHERE id IN (SELECT value FROM json_each(?)) AND calendar_sync_status='failed'").bind(JSON.stringify(result.results.map(x=>x.id))).first<{count:number}>();
 return json({processed:result.results.length,failed:failures?.count||0,hasMore:result.results.length===20});
}
