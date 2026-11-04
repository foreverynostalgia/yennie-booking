import {sortedStudents} from '@/lib/student-order';
import {encryptStudentPin} from '@/lib/student-pin';
import {NextRequest} from 'next/server';
import {admin,canViewAdmin,db,fail,json,phone,protectedStudentMutation} from '@/lib/server';
import {generatePin,normalizeNickname,pinHash,verifyPin,validNickname,type StudentRecord} from '@/lib/students';
export async function GET(req:NextRequest){if(!await canViewAdmin(req))return fail('관리자 로그인이 필요합니다.',401);try{const r=await db().prepare("SELECT s.id,s.nickname,s.name,s.school,s.academy,s.grade,s.phone,COALESCE(c.parent_phone,'') AS parentPhone,s.active,s.created_at,s.updated_at FROM students s LEFT JOIN learning_contacts c ON c.student_id=s.id ORDER BY s.name,s.nickname").all();const response=json({students:sortedStudents(r.results as any[])});response.headers.set('Cache-Control','no-store');return response}catch{return fail('학생 목록을 불러오지 못했습니다.',503)}}
export async function POST(req:NextRequest){
 if(!await protectedStudentMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
 const x=await req.json() as any;
 if(x.action==='sync-student-contacts'){
  if(!await admin(req))return fail('전체 관리자 권한이 필요합니다.',403);
  if(!Array.isArray(x.studentIds)||!x.studentIds.length||x.studentIds.length>100||x.studentIds.some((id:unknown)=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id)))return fail('학생 목록을 확인해 주세요.');
  await db().batch([...new Set<string>(x.studentIds)].map(id=>db().prepare("INSERT INTO learning_contacts(student_id,student_phone,parent_phone,updated_at) SELECT id,phone,NULL,? FROM students WHERE id=? ON CONFLICT(student_id) DO UPDATE SET student_phone=excluded.student_phone,updated_at=excluded.updated_at WHERE learning_contacts.student_phone IS NULL OR learning_contacts.student_phone=''").bind(new Date().toISOString(),id)));
  return json({ok:true});
 }
 // A manager's local ID is the durable idempotency key. Retry never makes a second account.
 if(x.action==='manager-upsert'){
  if(typeof x.managerId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(x.managerId))return fail('학생 ID를 확인해 주세요.');
  const existing=await db().prepare('SELECT * FROM students WHERE id=? OR (name=? AND phone=?) LIMIT 1').bind(x.bookingStudentId||x.managerId,String(x.name||'').trim(),phone(String(x.phone||''))).first<StudentRecord>();
  if(x.bookingStudentId&&existing?.id!==x.bookingStudentId)return fail('연결된 학생을 찾을 수 없습니다.',404);
  x.id=existing?.id;x.active=x.active===undefined?(existing?!!existing.active:true):x.active;
  // Older managers omit nickname; explicit choices must reach normal validation unchanged.
  if(x.nickname===undefined)x.nickname=existing?.nickname||('학생'+crypto.randomUUID().replace(/-/g,'').slice(0,12));
 }
 const items=Array.isArray(x.students)?x.students:[x];
 if(!items.length||items.length>200)return fail('한 번에 1~200명을 등록해 주세요.');
 const rows:any[]=[],seen=new Set<string>(),identities=new Set<string>();
 for(let i=0;i<items.length;i++){
  const a=items[i],nickname=normalizeNickname(a.nickname),name=String(a.name||'').trim(),school=String(a.school||'').trim(),grade=String(a.grade||'').trim(),p=phone(String(a.phone||'')),id=String(a.id||''),identity=name+'|'+p;
  if(!validNickname(nickname)||name.length<2||name.length>40||!school||school.length>80||!['중1','중2','중3','고1','고2','고3'].includes(grade)||!/^0\d{9,10}$/.test(p))return fail(`${i+1}행: 닉네임(한글·영문·숫자·_- 2~24자), 이름, 학교, 학년, 연락처를 확인해 주세요.`);
  if(seen.has(nickname)||identities.has(identity))return fail(`${i+1}행: 닉네임 또는 이름·연락처가 중복됩니다.`);seen.add(nickname);identities.add(identity);
  if(id&&items.length>1)return fail('수정은 학생별로 진행해 주세요.');
  const old=id?await db().prepare('SELECT * FROM students WHERE id=?').bind(id).first<StudentRecord>():null;
  if(id&&!old)return fail('학생을 찾을 수 없습니다.',404);
  const academy=a.academy===undefined?old?.academy||'':typeof a.academy==='string'?a.academy.trim():null;if(academy===null||academy.length>80)return fail(`${i+1}행: 소속 학원은 80자 이내로 입력해 주세요.`);
  if(await db().prepare('SELECT id FROM students WHERE (nickname=? OR (name=? AND phone=?)) AND id<>?').bind(nickname,name,p,id).first())return fail(`${i+1}행: 이미 등록된 닉네임 또는 학생입니다. 기존 학생을 수정해 주세요.`,409);
  const oldContact=old?await db().prepare('SELECT parent_phone FROM learning_contacts WHERE student_id=?').bind(id).first<{parent_phone:string|null}>():null;
  const parentPhone=a.parentPhone===undefined?oldContact?.parent_phone||'':String(a.parentPhone||'').replace(/\D/g,'');if(parentPhone&&!/^0\d{9,10}$/.test(parentPhone))return fail(`${i+1}행: 학부모 연락처를 확인해 주세요.`);
  let pin=!old||a.resetPin===true?generatePin():'';
  if(old&&pin&&await verifyPin(pin,old.pin_hash))pin=`YE${String((Number(pin.slice(2))+1)%10000).padStart(4,'0')}`;
  const studentId=id||(x.action==='manager-upsert'?x.managerId:crypto.randomUUID());
  rows.push({id:studentId,nickname,name,school,academy,grade,phone:p,parentPhone,active:a.active===false||a.active===0?0:1,pin,pin_hash:pin?await pinHash(pin):old!.pin_hash,pin_encrypted:pin?await encryptStudentPin(pin,studentId):old?.pin_encrypted||null,old});
 }
 const now=new Date().toISOString(),statements=[];
 for(const r of rows){
  statements.push(db().prepare(`INSERT INTO students(id,nickname,name,school,academy,grade,phone,pin_hash,pin_encrypted,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname,name=excluded.name,school=excluded.school,academy=excluded.academy,grade=excluded.grade,phone=excluded.phone,pin_hash=excluded.pin_hash,pin_encrypted=excluded.pin_encrypted,active=excluded.active,updated_at=excluded.updated_at`).bind(r.id,r.nickname,r.name,r.school,r.academy,r.grade,r.phone,r.pin_hash,r.pin_encrypted,r.active,now,now));
  statements.push(db().prepare('INSERT INTO learning_contacts(student_id,student_phone,parent_phone,updated_at) VALUES(?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET student_phone=excluded.student_phone,parent_phone=excluded.parent_phone,updated_at=excluded.updated_at').bind(r.id,r.phone,r.parentPhone||null,now));
  // Link matching legacy reservations without changing their history or creating duplicates.
  statements.push(db().prepare('UPDATE bookings SET student_id=? WHERE student_id IS NULL AND name=? AND phone=?').bind(r.id,r.name,r.phone));
 }
 await db().batch(statements);
 const response=json({saved:rows.length,students:sortedStudents(rows).map(r=>({id:r.id,nickname:r.nickname,name:r.name,school:r.school,academy:r.academy,grade:r.grade,phone:r.phone,parentPhone:r.parentPhone,active:r.active})),credentials:sortedStudents(rows).filter(r=>r.pin).map(r=>({nickname:r.nickname,pin:r.pin})),linked:true});response.headers.set('Cache-Control','no-store');return response;
 }catch(e){return fail('학생 정보를 저장하지 못했습니다. 중복 닉네임과 파일 내용을 확인해 주세요.',409)}
}
