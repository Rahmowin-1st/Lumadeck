const nativeFetch=window.fetch.bind(window);
const getGender=()=>localStorage.getItem('lumadeck_gender')||'';
const showToast=(message)=>{const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('show'),2800)};

const style=document.createElement('style');
style.textContent=`
.notify-btn{width:42px;height:42px;border:0;border-radius:21px;display:grid;place-items:center;background:transparent;color:var(--ink,#10201b);flex:0 0 42px;padding:0;position:relative}
.notify-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.notify-btn.on::after{content:'';position:absolute;right:7px;top:7px;width:7px;height:7px;border-radius:50%;background:#0a9b78;box-shadow:0 0 0 3px rgba(10,155,120,.14)}
.gender-block{margin-top:14px;padding:14px 16px;border-radius:26px;background:color-mix(in srgb,var(--surface,#fff) 88%,transparent);border:1px solid rgba(70,100,90,.14)}.gender-block>small{display:block;font:700 11px/1.2 Manrope,sans-serif;letter-spacing:.16em;color:var(--muted,#6f7d77);margin:0 0 10px 3px}.gender-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gender-option{height:48px;border:0;border-radius:20px;background:rgba(120,150,140,.08);color:var(--muted,#60716a);font:750 15px/1 Manrope,sans-serif}.gender-option.active{background:#10201b;color:#fff;box-shadow:0 8px 24px rgba(16,32,27,.16)}[data-theme='dark'] .gender-option.active{background:#d8f5e9;color:#062018}.gender-note{margin-top:9px;font:600 12px/1.35 'DM Sans',sans-serif;color:var(--muted,#71817a)}
@media(max-width:430px){.brand-row{gap:8px}.account-btn{max-width:150px}.gender-block{border-radius:23px}}
`;
document.head.appendChild(style);

const brandRow=document.querySelector('.brand-row'),accountBtn=document.querySelector('#accountBtn');
if(brandRow&&accountBtn){
  const b=document.createElement('button');b.id='notifyBtn';b.className='notify-btn glass-host';b.dataset.glass='clear';b.dataset.radius='21';b.type='button';b.setAttribute('aria-label','Enable notifications');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';brandRow.insertBefore(b,accountBtn);
}

const buildBar=document.querySelector('.build-bar');
if(buildBar){
  const block=document.createElement('div');block.className='gender-block';block.innerHTML='<small>PEOPLE FILTER · REQUIRED</small><div class="gender-switch"><button type="button" class="gender-option" data-gender="male">Male</button><button type="button" class="gender-option" data-gender="female">Female</button></div><div class="gender-note">People, names and person-based examples follow this choice.</div>';buildBar.insertAdjacentElement('afterend',block);
  const paint=()=>block.querySelectorAll('[data-gender]').forEach(x=>x.classList.toggle('active',x.dataset.gender===getGender()));
  block.addEventListener('click',e=>{const btn=e.target.closest('[data-gender]');if(!btn)return;localStorage.setItem('lumadeck_gender',btn.dataset.gender);paint();navigator.vibrate?.(5)});paint();
}

window.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:input?.url||'';
  if(url==='/api/jobs'&&String(init?.method||'GET').toUpperCase()==='POST'&&init?.body){
    try{const b=JSON.parse(init.body);const g=getGender();if(g&&typeof b.prompt==='string'&&!/\[\[LUMADECK_GENDER=/i.test(b.prompt)){const marker=`[[LUMADECK_GENDER=${g.toUpperCase()}]]`;const nl=b.prompt.indexOf('\n');b.prompt=nl>=0?b.prompt.slice(0,nl+1)+marker+'\n'+b.prompt.slice(nl+1):marker+'\n'+b.prompt;init={...init,body:JSON.stringify(b)}}}catch{}
  }
  return nativeFetch(input,init);
};

let swReg=null,pushKey='';
const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
const keyBytes=s=>{const pad='='.repeat((4-s.length%4)%4),raw=atob((s+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))};
async function preparePush(){if(!supported())return null;try{swReg=swReg||await navigator.serviceWorker.register('/sw.js',{scope:'/'});if(!pushKey){const r=await nativeFetch('/api/push-config',{credentials:'include',cache:'no-store'});if(r.ok)pushKey=(await r.json()).publicKey||''}return swReg}catch{return null}}
async function currentSub(){const r=await preparePush();return r?await r.pushManager.getSubscription():null}
async function subscribePush(promptPermission=false){if(!supported())return false;if(!document.querySelector('#accountBtn')?.classList.contains('signed')){showToast('Sign in first to enable notifications.');return false}let p=Notification.permission;if(p==='default'&&promptPermission)p=await Notification.requestPermission();if(p!=='granted'){if(p==='denied')showToast('Notifications are blocked in browser settings.');updateNotify();return false}const reg=await preparePush();if(!reg||!pushKey){showToast('Notification service is unavailable.');return false}let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(pushKey)});const resp=await nativeFetch('/api/push-subscribe',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({subscription:sub.toJSON()})});if(!resp.ok){showToast('Could not enable notifications.');return false}showToast('Notifications on — we’ll alert you when it’s ready.');updateNotify();return true}
async function disablePush(){const sub=await currentSub();if(!sub)return;await nativeFetch('/api/push-unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});await sub.unsubscribe().catch(()=>{});showToast('Notifications off.');updateNotify()}
async function updateNotify(){const b=document.querySelector('#notifyBtn');if(!b||!supported())return;const sub=Notification.permission==='granted'?await currentSub().catch(()=>null):null;b.classList.toggle('on',!!sub);b.setAttribute('aria-label',sub?'Disable notifications':'Enable notifications')}

document.querySelector('#notifyBtn')?.addEventListener('click',async()=>{const s=await currentSub().catch(()=>null);if(s)await disablePush();else await subscribePush(true)});
document.addEventListener('click',e=>{const send=e.target.closest?.('#sendBtn');if(!send)return;const g=getGender();if(!g){e.preventDefault();e.stopImmediatePropagation();showToast('Choose Male or Female before sending.');return}if(document.querySelector('#accountBtn')?.classList.contains('signed')&&Notification.permission==='default')void subscribePush(true);else if(Notification.permission==='granted')void subscribePush(false)},true);

void preparePush().then(updateNotify);
