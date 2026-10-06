'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';

type Config={publicKey:string;configured:boolean};
function keyBytes(base64url:string){const string=atob(base64url.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-base64url.length%4)%4));return Uint8Array.from(string,c=>c.charCodeAt(0))}
async function api<T=unknown>(method:string,body?:unknown):Promise<T>{const r=await fetch('/api/admin/push',{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const x=await r.json() as T&{error?:string};if(!r.ok)throw new Error(x.error||'알림 설정에 실패했습니다.');return x}
export default function PushSettings(){
 const [config,setConfig]=useState<Config|null>(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const supported=typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 useEffect(()=>{let mounted=true;api<Config>('GET').then(async c=>{if(!mounted)return;setConfig(c);if(supported){const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});const sub=await reg.pushManager.getSubscription();if(sub&&c.configured)await api('POST',sub.toJSON());if(mounted)setEnabled(!!sub&&c.configured)}}).catch(e=>{if(mounted)setMessage(e instanceof Error?e.message:'알림 설정을 확인하지 못했습니다.')});return()=>{mounted=false}},[supported]);
 async function enable(){
  if(!config?.configured||!supported)return;
  setBusy(true);setMessage('');
  try{
   // iOS requires this request to start inside the button's user gesture.
   const permissionPromise=Notification.requestPermission();
   const permission=await permissionPromise;
   if(permission!=='granted')throw new Error('아이폰 설정에서 이 웹앱의 알림을 허용해 주세요.');
   const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
   const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey) as BufferSource});
   await api('POST',sub.toJSON());setEnabled(true);setMessage('이 기기의 예약 알림이 켜졌습니다.');
  }catch(e){setMessage(e instanceof Error?e.message:'알림을 켜지 못했습니다.')}finally{setBusy(false)}
 }
 async function disable(){setBusy(true);setMessage('');try{const sub=await(await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){await api('DELETE',{endpoint:sub.endpoint});await sub.unsubscribe()}setEnabled(false);setMessage('이 기기의 예약 알림을 껐습니다.')}catch(e){setMessage(e instanceof Error?e.message:'알림을 끄지 못했습니다.')}finally{setBusy(false)}}
 async function test(){setBusy(true);setMessage('');try{const sub=await(await navigator.serviceWorker.ready).pushManager.getSubscription();if(!sub)throw new Error('알림 기기를 찾을 수 없습니다.');const r=await fetch('/api/admin/push/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})});const x=await r.json() as {error?:string};if(!r.ok)throw new Error(x.error||'테스트 알림을 보내지 못했습니다.');setMessage('테스트 알림을 보냈습니다.')}catch(e){setMessage(e instanceof Error?e.message:'테스트 알림에 실패했습니다.')}finally{setBusy(false)}}
 return <section className="panel admin-panel push-settings"><div className="panel-heading"><div><p className="section-kicker">NOTIFICATIONS</p><h2>관리자 알림</h2></div><span className="panel-count">{enabled?'켜짐':'꺼짐'}</span></div><p className="helper">새 예약과 학생의 예약 취소 요청이 들어오면 이 기기에 알림을 보냅니다.</p>{!supported?<p className="notice">아이폰에서는 Safari에서 관리자 사이트를 홈 화면에 추가한 뒤, 새 아이콘으로 열어 주세요. 기존 브라우저 바로가기는 삭제하고 다시 추가해야 할 수 있습니다. iOS 16.4 이상에서 지원됩니다.</p>:!config?<p className="notice">서버 알림 설정을 확인하는 중입니다.</p>:!config.configured?<p className="notice">서버 알림 설정이 필요합니다.</p>:<div className="row-actions"><Button disabled={busy||enabled} onClick={enable}>이 기기에서 알림 켜기</Button>{enabled&&<><Button variant="outline" disabled={busy} onClick={test}>테스트 알림</Button><Button variant="outline" disabled={busy} onClick={disable}>알림 끄기</Button></>}</div>}{message&&<p className="notice" role="status">{message}</p>}</section>
}
