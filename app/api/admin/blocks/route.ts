import {NextRequest} from 'next/server';
import {admin,db,fail,json,protectedMutation} from '@/lib/server';
import {validDate} from '@/lib/course-period';
export async function GET(req:NextRequest){
 if(!await admin(req))return fail('관리자 로그인이 필요합니다.',401);
 try{return json((await db().prepare('SELECT * FROM reservation_blocks ORDER BY date DESC,start').all()).results)}catch{return fail('예약 차단 목록을 불러오지 못했습니다.',503)}
}
export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const x=await req.json() as Record<string,unknown>,date=String(x.date||''),start=String(x.start||''),end=String(x.end||''),courseId=x.courseId?String(x.courseId):null,reason=String(x.reason||'').trim();
  if(!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(end)||start>=end||reason.length>200)return fail('날짜와 시작·종료 시간을 확인해 주세요.');
  if(courseId&&!await db().prepare('SELECT id FROM courses WHERE id=?').bind(courseId).first())return fail('수업을 찾을 수 없습니다.',404);
  await db().prepare('INSERT INTO reservation_blocks (id,course_id,date,start,end,reason,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),courseId,date,start,end,reason,new Date().toISOString()).run();
  return json({ok:true},201);
 }catch{return fail('예약 차단을 저장하지 못했습니다.',503)}
}
export async function DELETE(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const id=new URL(req.url).searchParams.get('id');if(!id)return fail('차단 항목을 선택해 주세요.');const r=await db().prepare('DELETE FROM reservation_blocks WHERE id=?').bind(id).run();return r.meta.changes?json({ok:true}):fail('이미 해제된 항목입니다.',404)}catch{return fail('차단을 해제하지 못했습니다.',503)}
}
