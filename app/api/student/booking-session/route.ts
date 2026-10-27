import {NextRequest} from 'next/server';
import {db,fail,json,sameOrigin} from '@/lib/server';
import {normalizeNickname,validNickname,allowStudentLogin,type StudentRecord} from '@/lib/students';
import {getBookingStudent,getReservationStudent,setReservationScope,clearReservationScopes,reservationProfile} from '@/lib/reservation-session';
export async function GET(req:NextRequest){try{const s=await getBookingStudent(req),verified=s?await getReservationStudent(req):null;return json({student:s?reservationProfile(s,s.id===verified?.id):null})}catch{return fail('학생 접속을 확인하지 못했습니다.',503)}}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{const x=await req.json() as any,nickname=normalizeNickname(x.nickname);if(!validNickname(nickname))return fail('선생님에게 받은 닉네임을 확인해 주세요.');
 if(!await allowStudentLogin(req,'booking:'+nickname))return fail('입력 시도가 많습니다. 15분 후 다시 시도해 주세요.',429);
 const s=await db().prepare('SELECT * FROM students WHERE nickname=? AND active=1').bind(nickname).first<StudentRecord>();if(!s)return fail('선생님에게 받은 닉네임을 확인해 주세요.',401);
 const response=clearReservationScopes(json({student:reservationProfile(s)}));return setReservationScope(response,req,s,'booking');
 }catch{return fail('학생 접속을 확인하지 못했습니다.',503)}
}
export async function DELETE(req:NextRequest){if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);return clearReservationScopes(json({ok:true}))}
