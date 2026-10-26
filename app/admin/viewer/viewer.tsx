'use client';
import {useEffect,useState} from 'react';
import BookingCalendar from '../booking-calendar';
import StudentDirectory from './student-directory';
import {Button} from '@/components/ui/button';
export default function Viewer(){
 const [tab,setTab]=useState<'calendar'|'students'>('calendar'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const query=new URLSearchParams(window.location.search);setTab(query.get('tab')==='students'?'students':'calendar')},[]);
 function navigate(next:'calendar'|'students'){setTab(next);window.history.replaceState(null,'',next==='students'?'/admin/viewer?tab=students':'/admin/viewer')}
 async function signOut(){setBusy(true);setError('');try{const response=await fetch('/api/admin/logout',{method:'POST'});if(!response.ok)throw new Error('로그아웃하지 못했습니다.');window.location.replace('/admin')}catch(e){setError(e instanceof Error?e.message:'다시 시도해 주세요.');setBusy(false)}}
 return <main className="shell admin-shell viewer-shell"><header className="top"><div className="logo"><span className="logo-mark">S</span><div><strong>옌쌤 과학</strong><small>관리자 · 조회 전용</small></div></div><Button variant="outline" disabled={busy} onClick={signOut}>로그아웃</Button></header><section className="admin-heading"><div><p className="eyebrow">VIEW ONLY</p><h1>캘린더 · 학생 조회</h1><p>예약 일정과 학생 정보를 확인할 수 있습니다.</p></div><span className="viewer-badge">조회 전용</span></section>{error&&<p className="notice error" role="alert">{error}</p>}<nav className="tabs admin-tabs" aria-label="조회 전용 메뉴"><button className={tab==='calendar'?'active':''} onClick={()=>navigate('calendar')}>예약 캘린더</button><button className={tab==='students'?'active':''} onClick={()=>navigate('students')}>학생 정보 조회</button></nav>{tab==='calendar'?<BookingCalendar/>:<StudentDirectory/>}</main>;
}
