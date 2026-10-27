import {NextRequest} from 'next/server';
import {db,fail,json,sameOrigin} from '@/lib/server';
import {normalizeNickname,validNickname,allowStudentLogin,verifyPin,type StudentRecord} from '@/lib/students';
import {allowReservationVerification,setReservationScope,clearReservationScopes,reservationProfile} from '@/lib/reservation-session';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{const x=await req.json() as any,nickname=normalizeNickname(x.nickname),credential=typeof x.credential==='string'?x.credential.trim().toUpperCase():'';
 if(!validNickname(nickname))return fail('닉네임과 PIN 또는 등록된 전화번호 뒤 네 자리를 확인해 주세요.',401);
 if(!await allowStudentLogin(req,nickname)||!await allowReservationVerification(nickname))return fail('입력 시도가 많습니다. 15분 후 다시 시도하거나 선생님께 문의해 주세요.',429);
 const s=await db().prepare('SELECT * FROM students WHERE nickname=? AND active=1').bind(nickname).first<StudentRecord>();
 const suffix=/^\d{4}$/.test(credential),stored=s?.pin_hash||'dummy:0000000000000000000000000000000000000000000000000000000000000000';
 const pinCorrect=await verifyPin(suffix?'YE'+credential:credential,stored);
 let diff=0;const tail=s?.phone?.replace(/\D/g,'').slice(-4)||'';for(let i=0;i<4;i++)diff|=(tail.charCodeAt(i)||0)^(credential.charCodeAt(i)||0);
 const correct=suffix?!!s&&/^0\d{9,10}$/.test(s.phone.replace(/\D/g,''))&&tail.length===4&&diff===0:pinCorrect;
 if(!s||!correct)return fail('닉네임과 PIN 또는 등록된 전화번호 뒤 네 자리를 확인해 주세요.',401);
 let response=clearReservationScopes(json({student:reservationProfile(s,true)}));response=await setReservationScope(response,req,s,'booking');return setReservationScope(response,req,s,'reservation',x.remember===true);
 }catch{return fail('예약 조회 인증을 완료하지 못했습니다.',503)}
}
