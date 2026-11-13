'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {peakOccupancy} from '@/lib/booking-slots';
import {reservationBlocked,type ReservationBlock} from '@/lib/reservation-blocks';
import {acceptsGrade} from '@/lib/course-grades';
import {bulkBookingDates} from '@/lib/bulk-booking-dates';
type Student={id:string;name:string;nickname:string;school:string;grade:string;phone:string;active:number};
type Course={id:string;title:string;capacity:number;active:number;target_grades:string;start_date:string|null;end_date:string|null};
type Booking={id:string;course_id:string;name:string;phone:string;date:string;start:string;end:string;status:string};
type Row={student:Student;date:string;start:string;end:string;reason:string};
type Group={id:number;school:string;grade:string;students:Student[];from:string;until:string;repeat:boolean;weekday:number;start:string;end:string};
export default function CourseBulkBooking({courses,bookings,initialCourseId,onSaved,embedded=false,ensureCourse,initialSchedule,scheduleKey}:{courses:Course[];bookings:Booking[];initialCourseId:string;onSaved:()=>Promise<void>;embedded?:boolean;ensureCourse?:()=>Promise<string>;scheduleKey?:string;initialSchedule?:{from:string;until:string;repeat:boolean;weekday:number;start:string;end:string}}){
 const [students,setStudents]=useState<Student[]>([]),[blocks,setBlocks]=useState<ReservationBlock[]|null>(null),[error,setError]=useState('');
 const [courseId,setCourseId]=useState(initialCourseId),[school,setSchool]=useState(''),[grade,setGrade]=useState(''),[excluded,setExcluded]=useState<Set<string>>(new Set());
 const [from,setFrom]=useState(''),[until,setUntil]=useState(''),[repeat,setRepeat]=useState(false),[weekday,setWeekday]=useState(0),[start,setStart]=useState('17:00'),[end,setEnd]=useState('19:00');
 const [groups,setGroups]=useState<Group[]>([]);
 const [preview,setPreview]=useState<Row[]|null>(null),[busy,setBusy]=useState(false),[result,setResult]=useState(''),[progress,setProgress]=useState('');
 useEffect(()=>{if(initialCourseId){setCourseId(initialCourseId);setPreview(null)}},[initialCourseId]);
 useEffect(()=>{if(initialSchedule){setFrom(initialSchedule.from);setUntil(initialSchedule.until);setRepeat(initialSchedule.repeat);setWeekday(initialSchedule.weekday);setStart(initialSchedule.start);setEnd(initialSchedule.end);setPreview(null)}},[scheduleKey]);
 async function load(){setError('');try{const [sr,br]=await Promise.all([fetch('/api/admin/students',{cache:'no-store'}),fetch('/api/courses',{cache:'no-store'})]);if(!sr.ok||!br.ok)throw Error('학생 목록 또는 예약 차단 정보를 불러오지 못했습니다.');const [s,b]=await Promise.all([sr.json(),br.json()]) as [{students:Student[]},{blocks:ReservationBlock[]}];setStudents(s.students.filter((x:Student)=>x.active===1).sort((a:Student,b:Student)=>a.name.localeCompare(b.name,'ko')));setBlocks(b.blocks)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{setPreview(null);setResult('')},[JSON.stringify(courses),courseId,school,grade,excluded,from,until,repeat,weekday,start,end,groups,bookings,blocks]);
 const course=courses.find(c=>c.id===courseId),targets=students.filter(s=>s.school===school&&s.grade===grade),selected=targets.filter(s=>!excluded.has(s.id));
 const schools=[...new Set(students.map(s=>s.school))].sort((a,b)=>a.localeCompare(b,'ko'));
 const grades=[...new Set(students.filter(s=>s.school===school).map(s=>s.grade))].sort();
 function currentGroup():Group{
  if(!selected.length)throw Error('학교·학년을 선택하고 예약할 학생을 한 명 이상 남겨 주세요.');
  if(!/^\d{2}:(00|30)$/.test(start)||!/^\d{2}:(00|30)$/.test(end)||start<'09:00'||end>'22:00'||end<=start)throw Error('09:00~22:00 사이의 시작·종료 시간을 30분 단위로 입력하세요.');
  bulkBookingDates(from,repeat?until:from,repeat?weekday:undefined);
  return {id:Date.now(),school,grade,students:selected,from,until,repeat,weekday,start,end};
 }
 function addGroup(){setError('');try{const g=currentGroup();setGroups(p=>[...p,g]);setSchool('');setGrade('');setExcluded(new Set());setPreview(null)}catch(e){setError((e as Error).message)}}
 function check(){setError('');try{
  if(!course||course.active!==1)throw Error('수업 정보를 먼저 입력하세요.');
  if(blocks===null)throw Error('예약 차단 정보를 새로 불러와 주세요.');
  const plans=[...groups];if(school||grade)plans.push(currentGroup());
  if(!plans.length)throw Error('학교별 예약 그룹을 추가하세요.');
  const occupied=bookings.filter(b=>b.status!=='cancelled').map(b=>({...b,occupied:1}));const rows:Row[]=[];
  for(const group of plans){const {start,end}=group;const dates=bulkBookingDates(group.from,group.repeat?group.until:group.from,group.repeat?group.weekday:undefined);
   if(rows.length+dates.length*group.students.length>1000)throw Error('한 번에 최대 1,000건까지 가능합니다. 기간이나 대상을 나눠 주세요.');
   for(const date of dates)for(const s of group.students){let reason='';
    if(new Date(date+'T'+start+':00+09:00').getTime()<=Date.now())reason='지난 시간';
    else if(!acceptsGrade(course.target_grades,s.grade))reason='수업 대상 학년 아님';
    else if(occupied.some(b=>b.date===date&&b.name===s.name&&b.phone===s.phone&&b.start<end&&b.end>start))reason='기존·추가 예약과 시간 중복';
    else if(reservationBlocked(blocks,course.id,date,start,end))reason='예약 차단 시간';
    else if(peakOccupancy(occupied,course.id,date,start,end)>=course.capacity)reason='정원 초과';
    rows.push({student:s,date,start,end,reason});if(!reason)occupied.push({id:'planned',course_id:course.id,name:s.name,phone:s.phone,date,start,end,status:'confirmed',occupied:1});
   }
  }
  setPreview(rows);
 }catch(e){setError((e as Error).message)}}
 async function save(){if(!preview||!course)return;const valid=preview.filter(r=>!r.reason);if(!valid.length)return;if(!confirm(`${course.title}: 학생 ${new Set(valid.map(r=>r.student.id)).size}명, 예약 ${valid.length}건을 생성할까요? 충돌 ${preview.length-valid.length}건은 제외됩니다. 기존 알림 설정에 따라 예약 알림이 발송될 수 있습니다.`))return;
  setBusy(true);setError('');let saved=0;const failed:string[]=[],calendarFailed:string[]=[];
  try{const savedCourseId=ensureCourse?await ensureCourse():course.id;for(let i=0;i<valid.length;i++){const row=valid[i];setProgress(`${i+1} / ${valid.length}건 처리 중`);const r=await fetch('/api/admin/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:savedCourseId,name:row.student.name,school:row.student.school,grade:row.student.grade,phone:row.student.phone,date:row.date,start:row.start,end:row.end,overrideWeeklyLimit:false,memo:'학교·학년 일괄 예약',waitCalendar:true})});const x=await r.json() as {error?:string;calendar?:{status:string;error?:string}};if(r.ok){saved++;if(x.calendar&&!['synced','sent'].includes(x.calendar.status))calendarFailed.push(`${row.student.name}: ${x.calendar.error||'캘린더 연결 확인 필요'}`)}else failed.push(`${row.date} ${row.student.name}: ${x.error||'저장 실패'}`)}
   setPreview(null);setGroups([]);setSchool('');setGrade('');await onSaved();setResult(`예약 생성 ${saved}건 · 생성 실패 ${failed.length}건 · 캘린더 미반영 ${calendarFailed.length}건${calendarFailed.length?'\n'+calendarFailed.join('\n'):''}${failed.length?'\n'+failed.join('\n'):''}`);
  }catch(e){setPreview(null);setError(`생성 ${saved}건 이후 중단: ${(e as Error).message}. 새로고침 후 미리보기를 다시 확인하세요.`);await onSaved().catch(()=>{})}finally{setBusy(false);setProgress('')}}
 return <section className={embedded?"course-bulk course-bulk-embedded":"course-bulk panel admin-panel"} style={{marginTop:20}}><h3>학교·학년 대상 선택</h3><p className="helper">같은 수업에 학교별로 다른 날짜·시간을 추가할 수 있습니다. 모든 예약은 이 수업의 캘린더 하나에 저장됩니다. 체크를 해제한 학생은 제외됩니다. 현재 명단으로만 생성하며, 나중에 등록한 학생은 자동 추가하지 않습니다.</p><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><div className="fields">{!embedded&&<label>예약할 수업<NativeSelect value={courseId} onChange={e=>setCourseId(e.target.value)}><option value="">수업 선택</option>{courses.filter(c=>c.active===1).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</NativeSelect></label>}<div className="field-pair"><label>학교<NativeSelect value={school} onChange={e=>{setSchool(e.target.value);setGrade('');setExcluded(new Set())}}><option value="">학교 선택</option>{schools.map(s=><option key={s}>{s}</option>)}</NativeSelect></label><label>학년<NativeSelect value={grade} onChange={e=>{setGrade(e.target.value);setExcluded(new Set())}}><option value="">학년 선택</option>{grades.map(g=><option key={g}>{g}</option>)}</NativeSelect></label></div>
 {targets.length>0&&<div className="bulk-student-picker"><div className="bulk-student-toolbar"><p><strong>{selected.length}명 선택</strong><span>전체 {targets.length}명 · {targets.length-selected.length}명 제외</span></p><div className="row-actions"><Button type="button" variant="outline" onClick={()=>setExcluded(new Set())}>전체 선택</Button><Button type="button" variant="outline" onClick={()=>setExcluded(new Set(targets.map(s=>s.id)))}>전체 제외</Button></div></div><div className="bulk-student-list">{targets.map(s=><label key={s.id} className="bulk-student-option"><input type="checkbox" checked={!excluded.has(s.id)} onChange={e=>setExcluded(p=>{const n=new Set(p);if(e.target.checked)n.delete(s.id);else n.add(s.id);return n})}/><span className="bulk-student-identity"><strong>{s.name}</strong><small>{s.nickname}</small></span></label>)}</div></div>}
 {<><label>예약할 회차<NativeSelect value={repeat?'weekly':'once'} onChange={e=>setRepeat(e.target.value==='weekly')}><option value="once">특정 날짜 1회</option><option value="weekly">기간 내 매주 반복</option></NativeSelect></label><div className="field-pair"><label>{repeat?'시작일':'예약일'}<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>{repeat&&<label>종료일<Input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></label>}</div>{repeat&&<label>반복 요일<NativeSelect value={weekday} onChange={e=>setWeekday(Number(e.target.value))}>{['일','월','화','수','목','금','토'].map((d,i)=><option key={d} value={i}>{d}요일</option>)}</NativeSelect></label>}<div className="field-pair"><label>시작<Input type="time" step={1800} value={start} onChange={e=>setStart(e.target.value)}/></label><label>종료<Input type="time" step={1800} value={end} onChange={e=>setEnd(e.target.value)}/></label></div></>}<small>학교별 날짜·시간은 위의 학생 직접 예약 운영 범위와 별도로 지정할 수 있습니다. 학생별 주간 한도·선행 수업 조건은 저장 시 다시 검증합니다. 생성 성공한 예약은 학생 조회와 구글 캘린더에 연결됩니다.</small><Button type="button" variant="outline" onClick={addGroup}>+ 이 학교·학년 예약 추가</Button>
 {groups.length>0&&<div className="bulk-group-list"><h4>학교별 예약 그룹 · {groups.length}개</h4>{groups.map((g,i)=><div className="bulk-group-row" key={g.id}><div><strong>{g.school} · {g.grade} · {g.students.length}명</strong><small>{g.from}{g.repeat?' ~ '+g.until+' · 매주 '+['일','월','화','수','목','금','토'][g.weekday]+'요일':''} · {g.start}–{g.end}</small></div><Button type="button" variant="outline" aria-label={`${g.school} 예약 그룹 삭제`} onClick={()=>setGroups(p=>p.filter((_,n)=>n!==i))}>제외</Button></div>)}</div>}
 <Button type="button" variant="outline" onClick={check}>전체 학교 명단·예약 미리보기</Button></div>
 {preview&&<div className="bulk-preview"><p className="bulk-preview-summary"><strong>생성 가능 {preview.filter(r=>!r.reason).length}건</strong><span>제외 {preview.filter(r=>r.reason).length}건</span></p><div className="bulk-preview-scroll"><table><thead><tr><th>날짜</th><th>학교·학생</th><th>시간</th><th>처리</th></tr></thead><tbody>{preview.map((r,i)=><tr key={r.date+r.student.id+i}><td>{r.date}</td><td>{r.student.school} · {r.student.name}</td><td>{r.start}–{r.end}</td><td><span className={r.reason?"bulk-row-excluded":"bulk-row-ready"}>{r.reason||'생성 예정'}</span></td></tr>)}</tbody></table></div><Button className="bulk-create-button" type="button" disabled={!preview.some(r=>!r.reason)} onClick={save}>수업 저장 및 확인한 예약 생성</Button></div>}</fieldset>{busy&&<p role="status">{progress} · 완료될 때까지 화면을 유지하세요.</p>}{error&&<p role="alert" className="notice error">{error}</p>}{result&&<p role="status" className="notice" style={{whiteSpace:'pre-wrap'}}>{result}</p>}{blocks===null&&<Button type="button" onClick={load}>목록 다시 불러오기</Button>}</section>
}
