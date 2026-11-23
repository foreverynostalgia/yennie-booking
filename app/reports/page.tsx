'use client';
import {useEffect,useState} from 'react';import StudentNav from '../components/student-nav';
type Report={id:string;title:string;className:string;date:string|null;items:{name:string;type:string;value:string}[];materials:{notes:string;items:{title:string;url:string;kind:string}[]}};
async function api(path:string,body?:unknown,method?:string){const r=await fetch(path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'}),d=await r.json() as {error?:string}&Record<string,any>;if(!r.ok)throw Error(d.error||'요청을 완료하지 못했습니다.');return d}
const dateText=(v:string|null)=>v?new Date(v+'T00:00:00+09:00').toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}):'수업일 미지정';
export default function ReportsPage(){const [verified,setVerified]=useState(false),[reports,setReports]=useState<Report[]>([]),[nickname,setNickname]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[tab,setTab]=useState<'grades'|'materials'>('grades');
 async function load(){const d=await api('/api/student/reports');setReports(d.reports);setNickname(d.nickname);setVerified(true);setSelected(s=>d.reports.some((r:Report)=>r.id===s)?s:d.reports[0]?.id||'')}
 useEffect(()=>{load().catch(()=>{})},[]);
 async function verify(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);const form=e.currentTarget,f=new FormData(form);try{await api('/api/student/session',{nickname:f.get('nickname'),pin:f.get('pin'),remember:true});await load();setMessage('')}catch(e){setMessage((e as Error).message)}finally{(form.elements.namedItem('pin') as HTMLInputElement).value='';setBusy(false)}}
 const r=reports.find(x=>x.id===selected);
 return <main className="homework-shell"><StudentNav active="reports"/><p className="hub-kicker">YE SCI · REPORT</p><h1>내 성적표</h1><p>선생님이 공개한 회차의 성적과 수업자료를 확인할 수 있어요.</p><p className="notice" role="status" aria-live="polite">{message}</p>
 {!verified?<form className="hw-card" onSubmit={verify}><h2>학생 확인</h2><p>예약에 사용하는 닉네임과 PIN을 입력하세요.</p><label>닉네임<input required name="nickname" autoComplete="username"/></label><label>PIN<input required name="pin" type="password" autoComplete="current-password"/></label><button disabled={busy}>내 성적표 보기</button></form>
 :<><section className="hw-card"><div className="hw-heading"><h2>{nickname} 학생</h2><button disabled={busy} onClick={async()=>{await api('/api/student/session',{},'DELETE');setVerified(false);setReports([])}}>학생 변경</button></div>
  {reports.length?<label>회차 선택<select value={selected} onChange={e=>setSelected(e.target.value)}>{reports.map(x=><option key={x.id} value={x.id}>{x.className} · {x.title} ({x.date||'날짜 미정'})</option>)}</select></label>:<p>아직 공개된 성적표가 없습니다.</p>}</section>
  {r&&<section className="hw-card report-card"><div className="report-tabs" role="tablist"><button role="tab" aria-selected={tab==='grades'} className={tab==='grades'?'selected':''} onClick={()=>setTab('grades')}>성적표</button><button role="tab" aria-selected={tab==='materials'} className={tab==='materials'?'selected':''} onClick={()=>setTab('materials')}>수업자료{r.materials.items.length?' '+r.materials.items.length:''}</button></div>
   <p className="report-meta">{r.className} · {r.title} · {dateText(r.date)}</p>
   {tab==='grades'?(r.items.length?<dl className="report-items">{r.items.map(i=><div key={i.name} className={'report-item '+i.type}><dt>{i.name}</dt><dd>{i.type==='score'?<><b>{i.value}</b>점</>:i.value}</dd></div>)}</dl>:<p>이 회차에 입력된 기록이 없습니다.</p>)
   :<div className="report-materials">{r.materials.notes&&<p style={{whiteSpace:'pre-wrap'}}>{r.materials.notes}</p>}{r.materials.items.length?<ul>{r.materials.items.map(m=><li key={m.url}><a href={m.url} target="_blank" rel="noopener noreferrer">{m.kind==='video'?'▶ ':'📎 '}{m.title}</a></li>)}</ul>:!r.materials.notes&&<p>연결된 수업자료가 없습니다.</p>}</div>}
  </section>}</>}
 </main>}
