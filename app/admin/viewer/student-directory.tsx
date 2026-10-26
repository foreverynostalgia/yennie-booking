'use client';
import {useEffect,useState} from 'react';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {useLiveRefresh} from '@/hooks/use-live-refresh';
type Student={id:string;nickname:string;name:string;school:string;grade:string;phone:string;active:number};
export default function StudentDirectory(){
 const [students,setStudents]=useState<Student[]>([]),[search,setSearch]=useState(''),[school,setSchool]=useState(''),[grade,setGrade]=useState(''),[status,setStatus]=useState('all'),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){
  const response=await fetch('/api/admin/students',{cache:'no-store'});const result=await response.json() as any;
  if(response.status===401||response.status===403){window.location.replace('/admin');return}
  if(!response.ok)throw new Error(result.error||'학생 목록을 불러오지 못했습니다.');
  setStudents(result.students);setError('');
 }
 useEffect(()=>{load().catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 useLiveRefresh(async()=>{try{await load()}catch(e){setError(e instanceof Error?e.message:'목록을 새로고침하지 못했습니다.')}});
 const query=search.trim().toLowerCase(),shown=students.filter(s=>(!school||s.school===school)&&(!grade||s.grade===grade)&&(status==='all'||!!s.active===(status==='active'))&&(!query||[s.name,s.nickname,s.school,s.phone].some(value=>value.toLowerCase().includes(query))));
 return <section className="panel admin-panel"><div className="panel-heading"><div><p className="section-kicker">STUDENT DIRECTORY</p><h2>학생 정보 조회</h2></div><span className="panel-count">{shown.length}명</span></div><p className="helper">학생 정보를 검색하고 확인할 수 있습니다. 이 화면에서는 학생 정보를 변경할 수 없습니다.</p>{error&&<p className="notice error" role="alert">{error}</p>}<div className="student-filters fields"><label>검색<Input value={search} placeholder="본명·닉네임·학교·연락처" onChange={e=>setSearch(e.target.value)}/></label><label>학교<NativeSelect value={school} onChange={e=>setSchool(e.target.value)}><option value="">전체 학교</option>{[...new Set(students.map(s=>s.school))].sort().map(value=><option key={value}>{value}</option>)}</NativeSelect></label><label>학년<NativeSelect value={grade} onChange={e=>setGrade(e.target.value)}><option value="">전체 학년</option>{['중1','중2','중3','고1','고2','고3'].map(value=><option key={value}>{value}</option>)}</NativeSelect></label><label>상태<NativeSelect value={status} onChange={e=>setStatus(e.target.value)}><option value="all">전체</option><option value="active">예약 허용</option><option value="inactive">예약 중지</option></NativeSelect></label></div>{loading?<p className="empty" role="status">학생 목록을 불러오는 중입니다.</p>:!shown.length?<p className="empty">조건에 맞는 학생이 없습니다.</p>:shown.map(s=><article className="student-admin-row" key={s.id}><div><strong>{s.name}</strong><p>닉네임 {s.nickname} · {s.school} · {s.grade}</p><small>{s.phone} · {s.active?'예약 허용':'예약 중지'}</small></div></article>)}</section>;
}
