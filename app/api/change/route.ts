import {NextRequest} from 'next/server';
import {db,fail,future,json,phone,sameOrigin} from '@/lib/server';
import {validDate,withinCoursePeriod} from '@/lib/course-period';
import {parseSchedules} from '@/lib/schedules';

export async function POST(req:NextRequest){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{
  const x=await req.json() as Record<string,unknown>,id=String(x.id||''),name=String(x.name||'').trim(),p=phone(String(x.phone||'')),code=String(x.accessCode||'').trim().replace(/^ye/i,'YE'),date=String(x.date||''),start=String(x.start||''),end=String(x.end||'');
  if(!id||!name||!p||!code||!validDate(date))return fail('예약 정보와 변경할 날짜를 확인해 주세요.');
  const b=await db().prepare('SELECT b.course_id,b.date,b.status,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end,c.day,c.start AS course_start,c.end AS course_end,c.schedules,c.start_date,c.end_date,c.capacity,c.active FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.id=? AND b.name=? AND b.phone=? AND b.access_code=?').bind(id,name,p,code.startsWith('YE')?code.toUpperCase():code.toLowerCase()).first<{course_id:string;date:string;status:string;start:string;end:string;day:number;course_start:string;course_end:string;schedules:string;start_date:string|null;end_date:string|null;capacity:number;active:number}>();
  if(!b)return fail('예약을 찾을 수 없습니다.',404);
  if(b.status!=='confirmed'||!future(b.date,b.end))return fail('이 예약은 변경 요청할 수 없습니다.',409);
  const weekday=(new Date(date+'T12:00:00+09:00').getUTCDay()+6)%7;
  if(!b.active||!withinCoursePeriod(date,b.start_date,b.end_date)||!future(date,end)||!parseSchedules(b.schedules,{day:b.day,start:b.course_start,end:b.course_end}).some(s=>s.day===weekday&&s.start===start&&s.end===end))return fail('변경 가능한 날짜와 시간이 아닙니다.');
  if(date===b.date&&start===b.start&&end===b.end)return fail('현재 예약과 다른 날짜 또는 시간을 선택해 주세요.');
  const result=await db().prepare("UPDATE bookings SET status='change_pending',requested_date=?,requested_start=?,requested_end=?,change_requested_at=? WHERE id=? AND status='confirmed'").bind(date,start,end,new Date().toISOString(),id).run();
  if(!result.meta.changes)return fail('이미 처리 중인 요청입니다.',409);
  return json({status:'change_pending'});
 }catch{return fail('변경 요청을 저장하지 못했습니다.',503)}
}
