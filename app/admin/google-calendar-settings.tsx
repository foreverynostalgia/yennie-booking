'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
type Data={configured:boolean;lastError:string|null;counts:{status:string;count:number}[]};
export default function GoogleCalendarSettings(){
 const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=async()=>{const response=await fetch('/api/admin/google-calendar');if(!response.ok)throw new Error('연동 상태를 불러오지 못했습니다.');setData(await response.json() as Data)};
 useEffect(()=>{load().catch(()=>setMessage('연동 상태를 불러오지 못했습니다.'))},[]);
 const sync=async()=>{setBusy(true);setMessage('');try{const response=await fetch('/api/admin/google-calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),result=await response.json() as {error?:string;processed:number;failed:number;hasMore:boolean};if(!response.ok)throw new Error(result.error||'동기화에 실패했습니다.');await load();setMessage(`${result.processed}건을 확인했습니다.${result.failed?` ${result.failed}건은 구글 연결을 확인해 주세요.`:''}${result.hasMore?' 남은 예약은 버튼을 다시 눌러 주세요.':''}`)}catch(error){setMessage(error instanceof Error?error.message:'동기화에 실패했습니다.')}finally{setBusy(false)}};
 const pending=data?.counts.filter(x=>x.status!=='synced').reduce((sum,x)=>sum+x.count,0)||0;
 return <section className="panel admin-panel google-calendar-settings"><div className="panel-heading"><div><p className="section-kicker">GOOGLE CALENDAR</p><h2>구글 캘린더 연동</h2></div><span className="panel-count">{data?.configured?'연결 정보 있음':'설정 필요'}</span></div><p className="helper">예약 확정·변경·취소와 출결을 구글 캘린더에 반영합니다. 구글 캘린더에서 직접 바꾼 일정은 예약 사이트에 반영되지 않습니다.</p>{data?.configured?<><p>앞으로 예약 중 동기화 확인이 필요한 일정: {pending}건</p><Button type="button" variant="outline" disabled={busy} onClick={sync}>{busy?'동기화 중…':'기존 예약 동기화 · 실패 건 재시도'}</Button></>:<p className="notice">연결 정보가 아직 없습니다. 서비스 계정 키와 캘린더 ID를 사이트의 서버 설정에 등록해야 자동 반영이 시작됩니다.</p>}{data?.lastError&&<p className="notice error" role="alert">최근 동기화 오류: {data.lastError}</p>}{message&&<p className="notice" role="status">{message}</p>}</section>
}
