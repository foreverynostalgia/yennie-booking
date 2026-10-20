import {queueGoogleCalendarSync} from '@/lib/google-calendar';
import {NextRequest} from 'next/server';
import {db,fail,json,protectedMutation} from '@/lib/server';
import {attendanceText} from '@/lib/attendance';
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const {id,attendance}=await req.json() as {id?:string;attendance?:string};if(!id||!attendance||!Object.hasOwn(attendanceText,attendance))return fail('출결을 선택해 주세요.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const r=await db().prepare("UPDATE bookings SET attendance=?,attendance_updated_at=? WHERE id=? AND status='confirmed' AND date<=?").bind(attendance,new Date().toISOString(),id,today).run();
 if(r.meta.changes)await queueGoogleCalendarSync([id]);return r.meta.changes?json({ok:true}):fail('오늘 또는 지난 확정 예약만 출결을 입력할 수 있습니다. 승인 대기 상태도 확인해 주세요.',409);
 }catch{return fail('출결을 저장하지 못했습니다.',503)}
}
