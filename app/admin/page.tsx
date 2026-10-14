'use client';
import {useEffect,useState} from 'react';
import BookingCalendar from './booking-calendar';
import PushSettings from './push-settings';
import ReservationBlocks from './reservation-blocks';
import BookingsManager from './bookings-manager';
import BookingEditor from './booking-editor';
import {useLiveRefresh,announceBookingChange} from '@/hooks/use-live-refresh';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {isClinic} from '@/lib/booking-slots';
import {middleGrades,parseTargetGrades} from '@/lib/course-grades';
import {parseSchedules} from '@/lib/schedules';
import {CalendarDays} from 'lucide-react';

type Slot={day:number;start:string;end:string};
type Course={target_grades:string;id:string;title:string;day:number;start:string;end:string;schedules:string;capacity:number;weekly_limit:number;active:number;start_date:string|null;end_date:string|null};
type Booking={admin_memo?:string;id:string;course_id:string;date:string;name:string;school:string;grade:string;phone:string;attendance:string;status:string;title:string;start:string;end:string;notification_status:string;notification_error:string|null;notification_message_id:string|null;requested_date:string|null;requested_start:string|null;requested_end:string|null};
type View='requests'|'bookings'|'calendar'|'courses'|'blocks'|'cancelled'|'past'|'settings';
const days=['월','화','수','목','금','토','일'];
const minutes=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3));
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const starts=Array.from({length:48},(_,i)=>clock(i*30));
const duration=(x:Slot)=>minutes(x.end)-minutes(x.start);
const ends=Array.from({length:96},(_,i)=>clock(i*15));
const durationText=(n:number)=>`${Math.floor(n/60)?`${Math.floor(n/60)}시간`:''}${n%60?` ${n%60}분`:''}`.trim();
const statusText:Record<string,string>={confirmed:'예약 확정',cancel_pending:'취소 승인 대기',change_pending:'변경 승인 대기',cancelled:'취소 완료'};
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
  const [copiedCourse,setCopiedCourse]=useState('');
  const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
  const [slots,setSlots]=useState<Slot[]>([{day:0,start:'18:00',end:'20:00'}]),[capacity,setCapacity]=useState(10);
  const [weeklyLimit,setWeeklyLimit]=useState(0);
  const [targetGrades,setTargetGrades]=useState<string[]>([...middleGrades]);
  const [view,setView]=useState<View>('requests');
  const [bookingEditor,setBookingEditor]=useState<Booking|null|undefined>(undefined);
  const [bookingNotice,setBookingNotice]=useState('');
  async function load(){const d:any=await call('/api/admin/data');setAuthorized(true);setCourses(d.courses);setBookings(d.bookings);setAlimtalkConfigured(!!d.alimtalkConfigured)}
  useEffect(()=>{load().catch(()=>setAuthorized(false))},[]);
  useLiveRefresh(load,authorized&&!busy);
  useEffect(()=>{const tab=new URLSearchParams(window.location.search).get('tab');if(tab==='calendar'||tab==='bookings'||tab==='requests'||tab==='settings')setView(tab)},[]);
  async function run(f:()=>Promise<void>){setBusy(true);setMessage('');try{await f();announceBookingChange()}catch(e){setMessage(e instanceof Error?e.message:'처리하지 못했습니다.')}finally{setBusy(false)}}
  function reset(){setTargetGrades([...middleGrades]);setCopiedCourse('');setStartDate('');setEndDate('');setEdit('');setTitle('');setSlots([{day:0,start:'18:00',end:'20:00'}]);setCapacity(10);setWeeklyLimit(0)}
  function copyCourse(c:Course){
    setTargetGrades(parseTargetGrades(c.target_grades));setEdit('');setCopiedCourse(c.id);setTitle(`${c.title} (복사)`);setStartDate(c.start_date||'');setEndDate(c.end_date||'');
    setSlots(parseSchedules(c.schedules,{day:c.day,start:c.start,end:c.end}).map(slot=>({...slot})));setCapacity(c.capacity);setWeeklyLimit(c.weekly_limit||0);
    requestAnimationFrame(()=>{document.getElementById('course-editor')?.scrollIntoView({behavior:'smooth',block:'start'})});
  }
  const pending=bookings.filter(x=>x.status==='cancel_pending'||x.status==='change_pending');
  const confirmed=bookings.filter(x=>x.status==='confirmed').length;
  const signIn=()=>run(async()=>{await call('/api/admin/login','POST',{username,password});await load()});
  return <main className="shell admin-shell">
    <header className="top"><div className="logo"><span className="logo-mark">S</span><div><strong>옌쌤 과학</strong><small>예약 관리자</small></div></div><a className="quiet-link" href="/">학생 페이지</a></header>
    {!authorized?<section className="panel login"><p className="eyebrow">ADMIN</p><h1>관리자 로그인</h1><label>관리자 아이디<Input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username"/></label><label>관리자 비밀번호<Input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e=>e.key==='Enter'&&signIn()}/></label><Button className="main-button" disabled={busy} onClick={signIn}>로그인</Button>{message&&<p className="notice error" role="alert">{message}</p>}</section>:<>
      <section className="admin-heading"><div><p className="eyebrow">옌쌤 과학 · 관리자</p><h1>예약 관리</h1><p>예약과 취소 요청을 한곳에서 확인하세요.</p></div><Button variant="outline" onClick={()=>run(async()=>{await call('/api/admin/logout','POST');setAuthorized(false);setPassword('')})}>로그아웃</Button></section>
      <div className="admin-overview" aria-label="예약 현황"><div className="overview-card"><span>예약 확정</span><strong>{confirmed}<small>건</small></strong></div><div className="overview-card attention"><span>승인 대기</span><strong>{pending.length}<small>건</small></strong></div><div className="overview-card"><span>등록된 수업</span><strong>{courses.filter(x=>x.active).length}<small>개</small></strong></div></div>
      <nav className="tabs admin-tabs" aria-label="관리 메뉴"><button className={view==='requests'?'active':''} onClick={()=>setView('requests')}>승인 요청 <b>{pending.length}</b></button><button className={view==='bookings'?'active':''} onClick={()=>setView('bookings')}>전체 예약</button><button className={view==='past'?'active':''} onClick={()=>setView('past')}>지난 예약 <b>{bookings.filter(b=>b.status!=='cancelled'&&b.attendance&&b.attendance!=='unmarked').length}</b></button><button className={view==='cancelled'?'active':''} onClick={()=>setView('cancelled')}>취소 완료 <b>{bookings.filter(b=>b.status==='cancelled').length}</b></button><button className={view==='calendar'?'active':''} onClick={()=>setView('calendar')}>예약 캘린더</button><button className={view==='courses'?'active':''} onClick={()=>setView('courses')}>수업 관리</button><button className={view==='blocks'?'active':''} onClick={()=>setView('blocks')}>예약 차단</button><button className={view==='settings'?'active':''} onClick={()=>setView('settings')}>설정</button></nav>
      {message&&<div className="notice error" role="alert">{message}</div>}{bookingNotice&&<div className="notice success" role="status">{bookingNotice}</div>}
      {view==='requests'&&<section className="panel admin-panel"><div className="panel-heading"><div><p className="section-kicker">CANCELLATIONS</p><h2>학생 요청 승인</h2></div><span className="panel-count">{pending.length}건</span></div>{!pending.length?<p className="admin-empty">대기 중인 취소·변경 요청이 없습니다.</p>:<div className="admin-list">{pending.map(b=><article className="admin-booking-row" key={b.id}><BookingIdentity booking={b}/><div className="booking-schedule"><strong>{b.title}</strong><span>현재 예약 시간 · {b.date} {b.start}–{b.end}</span>{b.status==='change_pending'&&<strong className="requested-slot">변경 요청 · {b.requested_date} {b.requested_start}–{b.requested_end}</strong>}</div><div className="row-actions"><Button disabled={busy} onClick={()=>run(async()=>{await call(b.status==='change_pending'?'/api/admin/changes':'/api/admin/cancellations','POST',{id:b.id,decision:'approve'});await load()})}>{b.status==='change_pending'?'변경 승인':'취소 승인'}</Button><Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await call(b.status==='change_pending'?'/api/admin/changes':'/api/admin/cancellations','POST',{id:b.id,decision:'reject'});await load()})}>요청 거절</Button></div></article>)}</div>}</section>}
      {(view==='bookings'||view==='cancelled'||view==='past')&&<BookingsManager onAdd={()=>setBookingEditor(null)} onEdit={b=>setBookingEditor(b)} key={view} cancelledOnly={view==='cancelled'} pastOnly={view==='past'} onAttendance={(id,attendance)=>run(async()=>{await call('/api/admin/attendance','POST',{id,attendance});await load()})} bookings={bookings.filter(b=>view==='cancelled'?b.status==='cancelled':view==='past'?b.status!=='cancelled'&&!!b.attendance&&b.attendance!=='unmarked':b.status!=='cancelled'&&(!b.attendance||b.attendance==='unmarked'))} configured={alimtalkConfigured} busy={busy} onCancel={async id=>{await call('/api/admin/bookings/cancel','POST',{id});await load();announceBookingChange()}} onRetry={id=>run(async()=>{await call('/api/admin/notifications','POST',{id});await load()})}/>}
      {bookingEditor!==undefined&&<BookingEditor booking={bookingEditor} courses={courses} bookings={bookings} onClose={()=>setBookingEditor(undefined)} onSaved={async code=>{await load();announceBookingChange();setBookingNotice(`${bookingEditor?'예약을 수정했습니다.':'예약을 추가했습니다.'} 조회 코드: ${code}`)}}/>}
      {view==='blocks'&&<ReservationBlocks courses={courses}/>}
      {view==='settings'&&<PushSettings/>}
      {view==='calendar'&&<div className="admin-calendar-view"><BookingCalendar/></div>}
      {view==='courses'&&<div className="layout admin-course-layout"><section className="panel admin-panel"><div className="panel-heading"><div><p className="section-kicker">CLASSES</p><h2>수업 목록</h2></div><span className="panel-count">{courses.length}개</span></div>{!courses.length?<p className="admin-empty">등록된 수업이 없습니다.</p>:<div className="admin-list">{courses.map(c=>{const parsed=JSON.parse(c.schedules||'[]') as Slot[];return <article className="course-admin-row" key={c.id}><div><strong>{c.title}</strong><span className={`course-state ${c.active?'':'inactive'}`}>{c.active?'예약 가능':'비공개'}</span><p>{parsed.length?parsed.map(x=>`${days[x.day]}요일 ${x.start}–${x.end}`).join(' · '):`${days[c.day]}요일 ${c.start}–${c.end}`}</p><p className="course-period">{c.start_date&&c.end_date?`${c.start_date} – ${c.end_date}`:'기간 미설정'}</p><small>대상 {parseTargetGrades(c.target_grades).join(' · ')} · 회차별 정원 {c.capacity}명 · {c.weekly_limit?`학생당 주 ${c.weekly_limit}회`:'주간 횟수 제한 없음'}</small></div><div className="row-actions"><Button variant="outline" onClick={()=>{setTargetGrades(parseTargetGrades(c.target_grades));setCopiedCourse('');setEdit(c.id);setTitle(c.title);setStartDate(c.start_date||'');setEndDate(c.end_date||'');setSlots(parsed.length?parsed:[{day:c.day,start:c.start,end:c.end}]);setCapacity(c.capacity);setWeeklyLimit(c.weekly_limit||0)}}>수정</Button><Button variant="outline" disabled={busy} onClick={()=>copyCourse(c)}>복제</Button>{!!c.active&&<Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await call(`/api/admin/courses?id=${encodeURIComponent(c.id)}`,'DELETE');await load()})}>예약 닫기</Button>}</div></article>})}</div>}</section>
        <section id="course-editor" className="panel admin-panel course-editor"><div className="panel-heading"><div><p className="section-kicker">CLASS EDITOR</p><h2>{edit?'수업 수정':copiedCourse?'복제한 수업 등록':'수업 등록'}</h2></div></div><div className="fields">{!edit&&<label>기존 수업 복제<NativeSelect disabled={busy} value={copiedCourse} onChange={e=>{const c=courses.find(c=>c.id===e.target.value);if(c)copyCourse(c);else reset()}}><option value="">새로 작성</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}{!c.active?' (예약 닫힘)':''}</option>)}</NativeSelect>{copiedCourse&&<small>수업 설정을 불러왔습니다. 내용을 수정한 뒤 등록하면 새 수업으로 저장됩니다.</small>}</label>}<label>수업명<Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="수업 이름을 입력하세요"/></label><fieldset className="target-grade-field"><legend>대상 학년 · 복수 선택 가능</legend><div className="grade-options">{middleGrades.map(grade=><label key={grade}><input type="checkbox" checked={targetGrades.includes(grade)} onChange={e=>setTargetGrades(e.target.checked?[...targetGrades,grade]:targetGrades.filter(g=>g!==grade))}/>{grade}</label>)}</div></fieldset><div className="field-pair course-date-pair"><label className="date-field">개강일<span className="date-control"><span className={`date-value ${startDate?'':'placeholder'}`}>{startDate||'날짜 선택'}</span><CalendarDays size={19} aria-hidden="true"/><Input type="date" aria-label="개강일 선택" value={startDate} onChange={e=>setStartDate(e.target.value)}/></span></label><label className="date-field">종강일<span className="date-control"><span className={`date-value ${endDate?'':'placeholder'}`}>{endDate||'날짜 선택'}</span><CalendarDays size={19} aria-hidden="true"/><Input type="date" aria-label="종강일 선택" value={endDate} min={startDate||undefined} onChange={e=>setEndDate(e.target.value)}/></span></label></div><p className="period-helper">개강일과 종강일을 포함한 기간에만 아래 요일·시간이 반복됩니다.</p><div className="slot-editor"><span className="field-title">요일 · 시간 설정</span>{isClinic(title)&&<p className="helper">클리닉은 아래 시간 전체를 예약 가능 범위로 사용합니다. 학생은 범위 안에서 시작 시간을 골라 1시간만 예약합니다.</p>}{slots.map((slot,i)=>{const len=duration(slot);return <div className="slot-row" key={i}><label className="slot-weekday">요일<NativeSelect value={slot.day} onChange={e=>setSlots(slots.map((x,j)=>j===i?{...x,day:Number(e.target.value)}:x))}>{days.map((x,n)=><option value={n} key={x}>{x}요일</option>)}</NativeSelect></label><label className="slot-start">시작 시간<NativeSelect value={slot.start} onChange={e=>{const next=e.target.value;setSlots(slots.map((x,j)=>j===i?{...x,start:next,end:minutes(x.end)>minutes(next)&&minutes(x.end)-minutes(next)<=345?x.end:clock(Math.min(minutes(next)+30,1425))}:x))}}>{starts.map(x=><option key={x}>{x}</option>)}</NativeSelect></label><div className="slot-end"><label>종료 시간<NativeSelect aria-label={`종료 시간 ${i+1}`} value={slot.end} onChange={e=>setSlots(slots.map((x,j)=>j===i?{...x,end:e.target.value}:x))}>{ends.filter(x=>minutes(x)>minutes(slot.start)&&minutes(x)-minutes(slot.start)<=345).map(x=><option key={x}>{x}</option>)}</NativeSelect></label><span className="slot-duration-info" aria-live="polite">수업 길이 · {durationText(len)}</span></div><div className="slot-bottom"><small>{slot.start}–{slot.end}</small><Button type="button" variant="outline" disabled={slots.length===1} onClick={()=>setSlots(slots.filter((_,j)=>j!==i))}>삭제</Button></div></div>})}<Button type="button" variant="outline" onClick={()=>setSlots([...slots,{day:0,start:'18:00',end:'20:00'}])}>요일·시간 추가</Button></div><label>회차별 정원<Input type="number" min="1" max="100" value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label><label>학생당 주간 예약 횟수<NativeSelect value={weeklyLimit} onChange={e=>setWeeklyLimit(Number(e.target.value))}><option value={0}>제한 없음</option>{Array.from({length:30},(_,i)=><option value={i+1} key={i+1}>주 {i+1}회</option>)}</NativeSelect><small>월요일~일요일, 학생 이름과 연락처 기준으로 이 수업의 예약을 계산합니다.</small></label></div><div className="row-actions form-actions"><Button disabled={busy} onClick={()=>run(async()=>{await call('/api/admin/courses','POST',{id:edit||undefined,title,schedules:slots,capacity,startDate,endDate,weeklyLimit,targetGrades});reset();await load()})}>{edit?'변경 사항 저장':'수업 등록'}</Button>{(edit||copiedCourse)&&<Button variant="outline" disabled={busy} onClick={reset}>{edit?'수정 취소':'복제 취소'}</Button>}</div></section></div>}
    </>}
  </main>;
}
