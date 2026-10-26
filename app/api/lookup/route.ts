import {getStudentSession} from '@/lib/students';
import {NextRequest} from 'next/server';
import {db,fail,json,sameOrigin} from '@/lib/server';
import {lookupIdentity,setLookupSession} from '@/lib/student-lookup';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{
  const student=await getStudentSession(req);
  if(student){
   const r=await db().prepare("SELECT b.id,b.course_id,b.date,b.grade,b.status,b.requested_date,b.requested_start,b.requested_end,c.title,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.student_id=? OR (b.student_id IS NULL AND b.name=? AND b.phone=?) ORDER BY b.date ASC,COALESCE(b.time_start,c.start) ASC,b.created_at ASC").bind(student.id,student.name,student.phone).all();
   const response=json(r.results);response.headers.set('Cache-Control','no-store');return response;
  }
  const x=await req.json() as Record<string,unknown>,identity=lookupIdentity(x.name,x.phone);
  if(!identity)return fail('학생 이름과 예약 시 입력한 연락처 전체를 확인해 주세요.');
  const enrolled=await db().prepare('SELECT id FROM students WHERE name=? AND phone=?').bind(identity.name,identity.phone).first();
  if(enrolled)return fail('학생관리에서 등록한 닉네임과 예약 PIN으로 접속해 주세요.',401);
  const r=await db().prepare('SELECT b.id,b.course_id,b.date,b.name,b.school,b.grade,b.status,b.requested_date,b.requested_start,b.requested_end,c.title,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.name=? AND b.phone=? ORDER BY b.date ASC,COALESCE(b.time_start,c.start) ASC,b.created_at ASC').bind(identity.name,identity.phone).all();
  return await setLookupSession(json(r.results),req,identity.name,identity.phone);
 }catch{return fail('예약 내역을 조회하지 못했습니다.',503)}
}
