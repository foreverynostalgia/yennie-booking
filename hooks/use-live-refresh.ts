'use client';
import {useEffect,useRef} from 'react';
export function announceBookingChange(){window.dispatchEvent(new Event('booking-change'));const channel=new BroadcastChannel('booking-updates');channel.postMessage('changed');channel.close()}
export function useLiveRefresh(refresh:()=>Promise<void>,enabled=true){
 const latest=useRef(refresh);latest.current=refresh;
 useEffect(()=>{if(!enabled)return;let running=false;
 const update=async()=>{if(running||document.hidden)return;running=true;try{await latest.current()}catch{}finally{running=false}};
 const timer=setInterval(update,15000),channel=new BroadcastChannel('booking-updates');
 channel.onmessage=update;window.addEventListener('focus',update);window.addEventListener('booking-change',update);document.addEventListener('visibilitychange',update);
 return()=>{clearInterval(timer);channel.close();window.removeEventListener('focus',update);window.removeEventListener('booking-change',update);document.removeEventListener('visibilitychange',update)};
 },[enabled]);
}
