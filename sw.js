self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json?.()||{}}catch{data={body:event.data?.text?.()||'Your presentation is ready✅'}}
  const title=data.title||'LumaDeck';
  const options={body:data.body||'Your presentation is ready✅',icon:data.icon||'/lumadeck-icon.svg',badge:data.badge||'/lumadeck-icon.svg',tag:data.tag||'lumadeck-ready',renotify:true,data:{url:data.url||'/',jobId:data.jobId||null},vibrate:[120,60,120]};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
    for(const c of list){if('focus'in c){try{await c.navigate(target)}catch{}return c.focus()}}
    return clients.openWindow?clients.openWindow(target):undefined;
  }));
});
