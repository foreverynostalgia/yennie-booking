// 수업 관리 회차 (manager-side classes) connected to booking features:
//  - a question paper distributed to one 회차 of one class (분반) as an exam link that
//    carries its own student roster, so the existing QR/OMR, grading and results apply;
//  - a published 회차 report card (성적표 + 수업자료) that the students in it can see.
import {db} from '@/lib/server';

export class SessionError extends Error{constructor(message:string,public status=400){super(message)}}
const ID=/^[A-Za-z0-9_-]{1,80}$/,UUID=/^[a-f0-9-]{36}$/,DATE=/^\d{4}-\d{2}-\d{2}$/;
const text=(v:unknown,max:number,label:string,required=true)=>{const s=String(v??'').trim();if(required&&!s||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw new SessionError(label+'을(를) 확인해 주세요.');return s};
const ids=(classId:unknown,sessionId:unknown)=>{const c=String(classId||''),s=String(sessionId||'');if(!ID.test(c)||!ID.test(s))throw new SessionError('수업·회차를 확인해 주세요.');return {classId:c,sessionId:s}};

async function validStudents(value:unknown){if(!Array.isArray(value)||value.length>300)throw new SessionError('대상 학생은 300명까지 지정할 수 있습니다.');const list=[...new Set(value.map(String))];if(list.some(x=>!ID.test(x)))throw new SessionError('대상 학생을 확인해 주세요.');
 for(let i=0;i<list.length;i+=90){const part=list.slice(i,i+90);const row=await db().prepare('SELECT count(*) AS n FROM students WHERE id IN ('+part.map(()=>'?').join(',')+')').bind(...part).first<{n:number}>();if(Number(row?.n)!==part.length)throw new SessionError('예약 시스템에 등록되지 않은 학생이 있습니다. 학생 관리에서 계정을 연결해 주세요.')}return list}

type Link={id:string;exam_id:string};
const sessionLink=(classId:string,sessionId:string)=>db().prepare('SELECT id,exam_id FROM learning_exam_links WHERE class_id=? AND session_id=?').bind(classId,sessionId).first<Link>();
const hasAttempts=async(linkId:string)=>!!await db().prepare('SELECT 1 FROM learning_attempts WHERE link_id=? LIMIT 1').bind(linkId).first();

export async function setSessionExam(x:Record<string,unknown>){const {classId,sessionId}=ids(x.classId,x.sessionId),examId=String(x.examId||'');if(!UUID.test(examId)||!await db().prepare('SELECT 1 FROM learning_exams WHERE id=?').bind(examId).first())throw new SessionError('문제지를 찾을 수 없습니다.',404);
 const label=text(x.label,120,'회차 이름'),students=await validStudents(x.studentIds),now=new Date().toISOString(),existing=await sessionLink(classId,sessionId);
 const nextNo=async()=>Number((await db().prepare("SELECT coalesce(max(lesson_no),0)+1 AS n FROM learning_exam_links WHERE exam_id=? AND course_id='class-sessions'").bind(examId).first<{n:number}>())?.n||1);
 let linkId:string;
 if(existing){linkId=existing.id;if(existing.exam_id!==examId){if(await hasAttempts(existing.id))throw new SessionError('이미 제출된 답안이 있어 이 회차의 시험지를 바꿀 수 없습니다.',409);await db().prepare('UPDATE learning_exam_links SET exam_id=?,lesson_no=? WHERE id=?').bind(examId,await nextNo(),existing.id).run()}
  await db().prepare('UPDATE learning_exam_links SET student_ids=?,label=? WHERE id=?').bind(JSON.stringify(students),label,existing.id).run()}
 else{linkId=crypto.randomUUID();await db().prepare("INSERT INTO learning_exam_links(id,exam_id,course_id,lesson_no,created_at,student_ids,label,class_id,session_id) VALUES(?,?,'class-sessions',?,?,?,?,?,?)").bind(linkId,examId,await nextNo(),now,JSON.stringify(students),label,classId,sessionId).run()}
 // A paper handed to a 회차 is live for the students in that 회차 only (access is per link).
 await db().prepare('UPDATE learning_exams SET published=1 WHERE id=?').bind(examId).run();
 return {linkId}}

export async function removeSessionExam(x:Record<string,unknown>){const {classId,sessionId}=ids(x.classId,x.sessionId),link=await sessionLink(classId,sessionId);if(!link)return {removed:false};if(await hasAttempts(link.id))throw new SessionError('이미 제출된 답안이 있어 연결을 해제할 수 없습니다.',409);await db().prepare('DELETE FROM learning_exam_links WHERE id=?').bind(link.id).run();return {removed:true}}

type Item={id:string;name:string;type:'score'|'list'|'text'};
type Material={title:string;url:string;kind:'video'|'link'};
function validMaterials(v:unknown){const m=(v&&typeof v==='object'?v:{}) as Record<string,unknown>,notes=text(m.notes??'',3000,'수업자료 안내',false);const list=Array.isArray(m.items)?m.items:[];if(list.length>20)throw new SessionError('수업자료는 20개까지 연결할 수 있습니다.');
 const items:Material[]=list.map(raw=>{const r=(raw||{}) as Record<string,unknown>,title=text(r.title,120,'자료 제목'),url=String(r.url||'');let u:URL;try{u=new URL(url)}catch{throw new SessionError('자료 주소를 확인해 주세요.')}if(u.protocol!=='https:'||url.length>500||u.username||u.password)throw new SessionError('자료 주소는 https 주소만 연결할 수 있습니다.');return {title,url:u.toString(),kind:r.kind==='video'?'video':'link'}});return {notes,items}}

export async function publishSessionReport(x:Record<string,unknown>){const {classId,sessionId}=ids(x.classId,x.sessionId),title=text(x.title,120,'회차 이름'),className=text(x.className,80,'수업 이름'),date=String(x.date||'');if(date&&!DATE.test(date))throw new SessionError('수업일을 확인해 주세요.');
 if(!Array.isArray(x.items)||x.items.length>50)throw new SessionError('평가 항목을 확인해 주세요.');const items:Item[]=x.items.map(raw=>{const r=(raw||{}) as Record<string,unknown>,id=String(r.id||'');if(!ID.test(id)||!['score','list','text'].includes(String(r.type)))throw new SessionError('평가 항목을 확인해 주세요.');return {id,name:text(r.name,80,'평가 항목 이름'),type:r.type as Item['type']}});const itemIds=new Set(items.map(i=>i.id));
 const rowsIn=(x.rows&&typeof x.rows==='object'&&!Array.isArray(x.rows)?x.rows:{}) as Record<string,unknown>,students=await validStudents(Object.keys(rowsIn));if(!students.length)throw new SessionError('공개할 학생이 없습니다. 예약 시스템 계정이 연결된 학생만 성적표를 볼 수 있습니다.');
 const rows:Record<string,Record<string,string>>={};for(const sid of students){const v=(rowsIn[sid]&&typeof rowsIn[sid]==='object'?rowsIn[sid]:{}) as Record<string,unknown>;rows[sid]={};for(const [k,val] of Object.entries(v)){if(!itemIds.has(k))continue;const s=String(val??'');if(s.length>2000)throw new SessionError('입력 내용이 너무 깁니다.');if(s)rows[sid][k]=s}}
 const payload=JSON.stringify({items,rows,materials:validMaterials(x.materials)});if(payload.length>900000)throw new SessionError('공개할 내용이 너무 큽니다.');const now=new Date().toISOString();
 await db().prepare('INSERT INTO learning_session_reports(id,class_id,session_id,title,class_name,date,student_ids,payload,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(class_id,session_id) DO UPDATE SET title=excluded.title,class_name=excluded.class_name,date=excluded.date,student_ids=excluded.student_ids,payload=excluded.payload,updated_at=excluded.updated_at').bind(crypto.randomUUID(),classId,sessionId,title,className,date||null,JSON.stringify(students),payload,now,now).run();
 return {publishedAt:now,students:students.length}}

export async function unpublishSessionReport(x:Record<string,unknown>){const {classId,sessionId}=ids(x.classId,x.sessionId);await db().prepare('DELETE FROM learning_session_reports WHERE class_id=? AND session_id=?').bind(classId,sessionId).run();return {ok:true}}

// What one student sees: only their own row of each published 회차.
export async function studentSessionReports(studentId:string){const rows=await db().prepare("SELECT id,title,class_name,date,student_ids,payload,updated_at FROM learning_session_reports WHERE student_ids LIKE ? ORDER BY coalesce(date,'') DESC,updated_at DESC LIMIT 200").bind('%"'+studentId.replace(/[%_]/g,'')+'"%').all<{id:string;title:string;class_name:string;date:string|null;student_ids:string;payload:string;updated_at:string}>();
 return rows.results.filter(r=>(JSON.parse(r.student_ids) as string[]).includes(studentId)).map(r=>{const p=JSON.parse(r.payload) as {items:Item[];rows:Record<string,Record<string,string>>;materials:{notes:string;items:Material[]}};return {id:r.id,title:r.title,className:r.class_name,date:r.date,updatedAt:r.updated_at,items:p.items.map(i=>({name:i.name,type:i.type,value:p.rows[studentId]?.[i.id]||''})).filter(i=>i.value),materials:p.materials}})}
