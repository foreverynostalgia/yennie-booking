'use client';
import {useEffect,useState} from 'react';
import BookingCalendar from './booking-calendar';
import BookingsManager from './bookings-manager';
import {useLiveRefresh,announceBookingChange} from '@/hooks/use-live-refresh';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';

type Slot={day:number;start:string;end:string};
type Course={id:string;title:string;day:number;start:string;end:string;schedules:string;capacity:number;active:number};
type Booking={id:string;course_id:string;date:string;name:string;school:string;grade:string;phone:string;status:string;title:string;start:string;end:string;notification_status:string;notification_error:string|null;notification_message_id:string|null};
type View='requests'|'bookings'|'calendar'|'courses';
const days=['월','화','수','목','금','토','일'];
const minutes=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3));
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const starts=Array.from({length:46},(_,i)=>clock(i*30));
const duration=(x:Slot)=>minutes(x.end)-minutes(x.start);
const statusText:Record<string,string>={confirmed:'예약 확정',cancel_pending:'취소 승인 대기',cancelled:'취소 완료'};
const notificationText:Record<string,string>={accepted:'발송 접수',failed:'접수 실패',unconfigured:'설정 필요',unknown:'접수 여부 확인 필요',sending:'발송 처리 중',pending:'발송 대기',not_requested:'해당 없음'};
async function call(url:string,method='GET',body?:unknown){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data:any=await r.json();
  if(!r.ok)throw new Error(data.error||'처리하지 못했습니다.');
  return data;
}
function BookingIdentity({booking:b}:{booking:Booking}){
  return <div className="booking-identity"><strong>{b.name}</strong><span>{b.school} · {b.grade}</span><span className="booking-phone">{b.phone}</span></div>;
}
export default function Admin(){
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [authorized,setAuthorized]=useState(false),[alimtalkConfigured,setAlimtalkConfigured]=useState(false);
  const [courses,setCourses]=useState<Course[]>([]),[bookings,setBookings]=useState<Booking[]>([]);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [edit,setEdit]=useState(''),[title,setTitle]=useState('');
  const [slots,setSlots]=useState<Slot[]>([{day:0,start:'18:00',end:'20:00'}]),[capacity,setCapacity]=useState(10);
  const [view,setView]=useState<View>('requests');
  async function load(){const d:any=await call('/api/admin/data');setAuthorized(true);setCourses(d.courses);setBookings(d.bookings);setAlimtalkConfigured(!!d.alimtalkConfigured)}
  useEffect(()=>{load().catch(()=>setAuthorized(false))},[]);
  useLiveRefresh(load,authorized&&!busy);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('tab')==='calendar')setView('calendar')},[]);
  async function run(f:()=>Promise<void>){setBusy(true);setMessage('');try{await f();announceBookingChange()}catch(e){setMessage(e instanceof Error?e.message:'처리하지 못했습니다.')}finally{setBusy(false)}}
  function reset(){setEdit('');setTitle('');setSlots([{day:0,start:'18:00',end:'20:00'}]);setCapacity(10)}
  const pending=bookings.filter(x=>x.status==='cancel_pending');
  const confirmed=bookings.filter(x=>x.status==='confirmed').length;
  const signIn=()=>run(async()=>{await call('/api/admin/login','POST',{username,password});await load()});
  return <main className="shell admin-shell">
    <header className="top"><div className="logo"><span className="logo-mark">S</span><div><strong>옌쌤 과학</strong><small>예약 관리자</small></div></div><a className="quiet-link" href="/">학생 페이지</a></header>
    {!authorized?<section className="panel login"><p className="eyebrow">ADMIN</p><h1>관리자 로그인</h1><label>관리자 아이디<Input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username"/></label><label>관리자 비밀번호<Input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e=>e.key==='Enter'&&signIn()}/></label><Button className="main-button" disabled={busy} onClick={signIn}>로그인</Button>{message&&<p className="notice error" role="alert">{message}</p>}</section>:<>
      <section className="admin-heading"><div><p className="eyebrow">옌쌤 과학 · 관리자</p><h1>예약 관리</h1><p>예약과 취소 요청을 한곳에서 확인하세요.</p></div><Button variant="outline" onClick={()=>run(async()=>{await call('/api/admin/logout','POST');setAuthorized(false);setPassword('')})}>로그아웃</Button></section>
      <div className="admin-overview" aria-label="예약 현황"><div className="overview-card"><span>예약 확정</span><strong>{confirmed}<small>건</small></strong></div><div className="overview-card attention"><span>취소 승인 대기</span><strong>{pending.length}<small>건</small></strong></div><div className="overview-card"><span>등록된 수업</span><strong>{courses.filter(x=>x.active).length}<small>개</small></strong></div></div>
      <nav className="tabs admin-tabs" aria-label="관리 메뉴"><button className={view==='requests'?'active':''} onClick={()=>setView('requests')}>취소 요청 <b>{pending.length}</b></button><button className={view==='bookings'?'active':''} onClick={()=>setView('bookings')}>전체 예약</button><button className={view==='calendar'?'active':''} onClick={()=>setView('calendar')}>예약 캘린더</button><button className={view==='courses'?'active':''} onClick={()=>setView('courses')}>수업 관리</button></nav>
      {message&&<div className="notice error" role="alert">{message}</div>}
      {view==='requests'&&<section className="panel admin-panel"><div className="panel-heading"><div><p className="section-kicker">CANCELLATIONS</p><h2>취소 승인 대기</h2></div><span className="panel-count">{pending.length}건</span></div>{!pending.length?<p className="admin-empty">대기 중인 취소 요청이 없습니다.</p>:<div className="admin-list">{pending.map(b=><article className="admin-booking-row" key={b.id}><BookingIdentity booking={b}/><div className="booking-schedule"><strong>{b.title}</strong><span>{b.date} · {b.start}–{b.end}</span></div><div className="row-actions"><Button disabled={busy} onClick={()=>run(async()=>{await call('/api/admin/cancellations','POST',{id:b.id,decision:'approve'});await load()})}>취소 승인</Button><Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await call('/api/admin/cancellations','POST',{id:b.id,decision:'reject'});await load()})}>요청 거절</Button></div></article>)}</div>}</section>}
      {view==='bookings'&&<BookingsManager bookings={bookings} configured={alimtalkConfigured} busy={busy} onCancel={async id=>{await call('/api/admin/bookings/cancel','POST',{id});await load();announceBookingChange()}} onRetry={id=>run(async()=>{await call('/api/admin/notifications','POST',{id});await load()})}/>}
      {view==='calendar'&&<div className="admin-calendar-view"><BookingCalendar/></div>}
      {view==='courses'&&<div className="layout admin-course-layout"><section className="panel admin-panel"><div className="panel-heading"><div><p className="section-kicker">CLASSES</p><h2>수업 목록</h2></div><span className="panel-count">{courses.length}개</span></div>{!courses.length?<p className="admin-empty">등록된 수업이 없습니다.</p>:<div className="admin-list">{courses.map(c=>{const parsed=JSON.parse(c.schedules||'[]') as Slot[];return <article className="course-admin-row" key={c.id}><div><strong>{c.title}</strong><span className={`course-state ${c.active?'':'inactive'}`}>{c.active?'예약 가능':'비공개'}</span><p>{parsed.length?parsed.map(x=>`${days[x.day]}요일 ${x.start}–${x.end}`).join(' · '):`${days[c.day]}요일 ${c.start}–${c.end}`}</p><small>회차별 정원 {c.capacity}명</small></div><div className="row-actions"><Button variant="outline" onClick={()=>{setEdit(c.id);setTitle(c.title);setSlots(parsed.length?parsed:[{day:c.day,start:c.start,end:c.end}]);setCapacity(c.capacity)}}>수정</Button>{!!c.active&&<Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await call(`/api/admin/courses?id=${encodeURIComponent(c.id)}`,'DELETE');await load()})}>예약 닫기</Button>}</div></article>})}</div>}</section>
        <section className="panel admin-panel course-editor"><div className="panel-heading"><div><p className="section-kicker">CLASS EDITOR</p><h2>{edit?'수업 수정':'수업 등록'}</h2></div></div><div className="fields"><label>수업명<Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="수업 이름을 입력하세요"/></label><div className="slot-editor"><span className="field-title">요일 · 시간 설정</span>{slots.map((slot,i)=>{const len=duration(slot);return <div className="slot-row" key={i}><label>요일<NativeSelect value={slot.day} onChange={e=>setSlots(slots.map((x,j)=>j===i?{...x,day:Number(e.target.value)}:x))}>{days.map((x,n)=><option value={n} key={x}>{x}요일</option>)}</NativeSelect></label><label>시작 시간<NativeSelect value={slot.start} onChange={e=>{const next=e.target.value;setSlots(slots.map((x,j)=>j===i?{...x,start:next,end:clock(minutes(next)+(minutes(next)+len<1440?len:60))}:x))}}>{starts.filter(x=>minutes(x)+len<1440).map(x=><option key={x}>{x}</option>)}</NativeSelect></label><label>수업 길이<NativeSelect value={len} onChange={e=>{const next=Number(e.target.value);setSlots(slots.map((x,j)=>j===i?{...x,end:clock(minutes(x.start)+next)}:x))}}><option value={60}>1시간</option><option value={120} disabled={minutes(slot.start)+120>=1440}>2시간</option></NativeSelect></label><Button type="button" variant="outline" disabled={slots.length===1} onClick={()=>setSlots(slots.filter((_,j)=>j!==i))}>삭제</Button></div>})}<Button type="button" variant="outline" onClick={()=>setSlots([...slots,{day:0,start:'18:00',end:'20:00'}])}>요일·시간 추가</Button></div><label>회차별 정원<Input type="number" min="1" max="100" value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label></div><div className="row-actions form-actions"><Button disabled={busy} onClick={()=>run(async()=>{await call('/api/admin/courses','POST',{id:edit||undefined,title,schedules:slots,capacity});reset();await load()})}>{edit?'변경 사항 저장':'수업 등록'}</Button>{edit&&<Button variant="outline" onClick={reset}>수정 취소</Button>}</div></section></div>}
    </>}
  </main>;
}
