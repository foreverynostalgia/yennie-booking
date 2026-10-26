import {NextRequest} from 'next/server';
import {fail,json,sameOrigin} from '@/lib/server';
import {db} from '@/lib/server';
import {allowStudentLogin,clearStudentSession,getStudentSession,normalizeNickname,publicStudent,setStudentSession,verifyPin,type StudentRecord} from '@/lib/students';
export async function GET(req:NextRequest){try{const s=await getStudentSession(req);const r=json({student:s?publicStudent(s):null});r.headers.set('Cache-Control','no-store');return r}catch{return fail('학생 정보를 확인하지 못했습니다.',503)}}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{const x=await req.json() as any,nickname=normalizeNickname(x.nickname);
 if(!await allowStudentLogin(req,nickname))return fail('입력 시도가 많습니다. 15분 후 다시 시도하거나 관리자에게 문의해 주세요.',429);
 const s=await db().prepare('SELECT * FROM students WHERE nickname=? AND active=1').bind(nickname).first<StudentRecord>();
 const correct=await verifyPin(x.pin,s?.pin_hash||'dummy:0000000000000000000000000000000000000000000000000000000000000000');
 if(!s||!correct)return fail('닉네임 또는 예약 PIN을 확인해 주세요.',401);
 return setStudentSession(json({student:publicStudent(s)}),req,s,x.remember===true);
 }catch{return fail('접속하지 못했습니다. 잠시 후 다시 시도해 주세요.',503)}
}
export async function DELETE(req:NextRequest){if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);return clearStudentSession(json({ok:true}))}
