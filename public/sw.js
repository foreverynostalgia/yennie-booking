self.addEventListener('push',event=>{
 let message={title:'YENNIE SENSE 예약 알림',body:'새 예약 내역을 확인해 주세요.',url:'/admin'};
 try{if(event.data)message={...message,...event.data.json()}}catch{}
 const url=new URL(message.url||'/admin',self.location.origin);
 if(url.origin!==self.location.origin)url.pathname='/admin';
 event.waitUntil(self.registration.showNotification(message.title,{body:message.body,icon:'/yennie-icon.png?v=1',badge:'/yennie-icon.png?v=1',tag:message.tag||undefined,data:{url:url.pathname+url.search}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const path=event.notification.data?.url||'/admin';
 event.waitUntil((async()=>{const windows=await clients.matchAll({type:'window',includeUncontrolled:true});const target=windows.find(w=>new URL(w.url).origin===self.location.origin);if(target){await target.focus();if('navigate' in target)await target.navigate(path)}else await clients.openWindow(path)})());
});
