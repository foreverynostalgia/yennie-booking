import {encryptStudentPin} from '@/lib/student-pin';
import {NextRequest} from 'next/server';
import {canViewAdmin,db,fail,json,phone,protectedStudentMutation} from '@/lib/server';
import {generatePin,normalizeNickname,pinHash,verifyPin,validNickname,type StudentRecord} from '@/lib/students';
export async function GET(req:NextRequest){if(!await canViewAdmin(req))return fail('관리자 로그인이 필요합니다.',401);try{const r=await db().prepare('SELECT id,nickname,name,school,grade,phone,active,created_at,updated_at FROM students ORDER BY name,nickname').all();const response=json({students:r.results});response.headers.set('Cache-Control','no-store');return response}catch{return fail('학생 목록을 불러오지 못했습니다.',503)}}
export async function POST(req:NextRequest){
 if(!await protectedStudentMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
 const x=await req.json() as any,items=Array.isArray(x.students)?x.students:[x];
 if(!items.length||items.length>200)return fail('한 번에 1~200명을 등록해 주세요.');
 const rows:any[]=[],seen=new Set<string>(),identities=new Set<string>();
 for(let i=0;i<items.length;i++){
  const a=items[i],nickname=normalizeNickname(a.nickname),name=String(a.name||'').trim(),school=String(a.school||'').trim(),grade=String(a.grade||'').trim(),p=phone(String(a.phone||'')),id=String(a.id||''),identity=name+'|'+p;
  if(!validNickname(nickname)||name.length<2||name.length>40||!school||school.length>80||!['중1','중2','중3','고1','고2','고3'].includes(grade)||!/^0\d{9,10}$/.test(p))return fail(`${i+1}행: 닉네임(한글·영문·숫자·_- 2~24자), 이름, 학교, 학년, 연락처를 확인해 주세요.`);
  if(seen.has(nickname)||identities.has(identity))return fail(`${i+1}행: 닉네임 또는 이름·연락처가 중복됩니다.`);seen.add(nickname);identities.add(identity);
  if(id&&items.length>1)return fail('수정은 학생별로 진행해 주세요.');
  const old=id?await db().prepare('SELECT * FROM students WHERE id=?').bind(id).first<StudentRecord>():null;
  if(id&&!old)return fail('학생을 찾을 수 없습니다.',404);
  if(await db().prepare('SELECT id FROM students WHERE (nickname=? OR (name=? AND phone=?)) AND id<>?').bind(nickname,name,p,id).first())return fail(`${i+1}행: 이미 등록된 닉네임 또는 학생입니다. 기존 학생을 수정해 주세요.`,409);
  let pin=!old||a.resetPin===true?generatePin():'';
  if(old&&pin&&await verifyPin(pin,old.pin_hash))pin=`YE${String((Number(pin.slice(2))+1)%10000).padStart(4,'0')}`;
  const studentId=id||crypto.randomUUID();
  rows.push({id:studentId,nickname,name,school,grade,phone:p,active:a.active===false||a.active===0?0:1,pin,pin_hash:pin?await pinHash(pin):old!.pin_hash,pin_encrypted:pin?await encryptStudentPin(pin,studentId):old?.pin_encrypted||null,old});
 }
 const now=new Date().toISOString(),statements=[];
 for(const r of rows){
  statements.push(db().prepare(`INSERT INTO students(id,nickname,name,school,grade,phone,pin_hash,pin_encrypted,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname,name=excluded.name,school=excluded.school,grade=excluded.grade,phone=excluded.phone,pin_hash=excluded.pin_hash,pin_encrypted=excluded.pin_encrypted,active=excluded.active,updated_at=excluded.updated_at`).bind(r.id,r.nickname,r.name,r.school,r.grade,r.phone,r.pin_hash,r.pin_encrypted,r.active,now,now));
  // Link matching legacy reservations without changing their history or creating duplicates.
  statements.push(db().prepare('UPDATE bookings SET student_id=? WHERE student_id IS NULL AND name=? AND phone=?').bind(r.id,r.name,r.phone));
 }
 await db().batch(statements);
 const response=json({saved:rows.length,credentials:rows.filter(r=>r.pin).map(r=>({nickname:r.nickname,pin:r.pin})),linked:true});response.headers.set('Cache-Control','no-store');return response;
 }catch(e){return fail('학생 정보를 저장하지 못했습니다. 중복 닉네임과 파일 내용을 확인해 주세요.',409)}
}
