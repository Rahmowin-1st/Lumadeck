import {createLumaGlass} from './glass.js';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const state = {
  theme: localStorage.getItem('lumadeck_theme') || 'system',
  outputFormat: localStorage.getItem('lumadeck_format') || 'pptx',
  session: null,
  jobs: [],
  selected: null,
  slide: 0,
  authMode: 'signin',
  polling: null,
  reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const glass=createLumaGlass({$, $$, state, getSlideFrame:()=>$('#slideFrame')});

const activeStatuses = new Set(['waiting','claimed','generating','rendering','packaging']);
const prettyStatus = s => ({waiting:'Waiting',claimed:'Claimed',generating:'Generating',rendering:'Rendering',packaging:'Packaging',ready:'Ready',failed:'Needs attention'}[s] || s);
const safeName = s => (s || 'presentation').replace(/[^a-z0-9-_ ]/gi,'').trim().replace(/\s+/g,'-').slice(0,70) || 'presentation';
const timeAgo = ms => { const m=Math.max(1,Math.floor((Date.now()-Number(ms))/60000)); return m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`; };

function toast(message){
  const el=$('#toast'); el.textContent=message; el.classList.add('show');
  requestAnimationFrame(()=>glass.refreshShapes());
  clearTimeout(toast.t); toast.t=setTimeout(()=>{el.classList.remove('show');requestAnimationFrame(()=>glass.refreshShapes());},2600);
}

async function api(path, options={}){
  const init={method:options.method||'GET',headers:{'Content-Type':'application/json'},credentials:'include'};
  if(options.body !== undefined) init.body=JSON.stringify(options.body);
  const r=await fetch(path,init);
  let data=null; try{ data=await r.json(); }catch{}
  if(!r.ok) throw new Error(data?.error || data?.message || 'Request failed');
  return data;
}

function resolvedTheme(){
  if(state.theme==='system') return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  return state.theme;
}
function applyTheme(){
  document.documentElement.dataset.theme=resolvedTheme();
  localStorage.setItem('lumadeck_theme',state.theme);
  $$('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===state.theme));
  moveThemeBubble(false);
  glass.setTheme(resolvedTheme());
}

// --- Theme switch: click + drag + spring-like liquid selection ---
const themeSwitch=$('#themeSwitch'), themeBubble=$('#themeBubble');
let themeDrag=false;
function themeIndex(){ return ['system','light','dark'].indexOf(state.theme); }
function moveThemeBubble(stretch=false, x=null){
  const r=themeSwitch.getBoundingClientRect(); if(!r.width) return;
  const w=r.width/3;
  const idx=themeIndex();
  let tx=idx*w;
  if(x!==null) tx=Math.max(0,Math.min(r.width-w,x-r.left-w/2));
  themeBubble.style.width=`${w-8}px`;
  themeBubble.style.transform=`translate3d(${tx+4}px,0,0) scaleX(${stretch?1.12:1})`;
  requestAnimationFrame(()=>glass.refreshShapes());
}
function chooseThemeAt(clientX){
  const r=themeSwitch.getBoundingClientRect();
  const idx=Math.max(0,Math.min(2,Math.floor(((clientX-r.left)/r.width)*3)));
  const next=['system','light','dark'][idx];
  if(next!==state.theme){state.theme=next; applyTheme(); if(navigator.vibrate) navigator.vibrate(5);}
}
themeSwitch.addEventListener('pointerdown',e=>{themeDrag=true; themeSwitch.setPointerCapture?.(e.pointerId); chooseThemeAt(e.clientX); moveThemeBubble(true,e.clientX); glass.press(themeBubble,true,e);});
themeSwitch.addEventListener('pointermove',e=>{if(themeDrag){chooseThemeAt(e.clientX); moveThemeBubble(true,e.clientX);}});
function endTheme(e){if(!themeDrag)return;themeDrag=false;try{themeSwitch.releasePointerCapture?.(e.pointerId)}catch{} moveThemeBubble(false);glass.press(themeBubble,false,e);}
themeSwitch.addEventListener('pointerup',endTheme); themeSwitch.addEventListener('pointercancel',endTheme);
$$('[data-theme]').forEach(b=>b.addEventListener('click',()=>{state.theme=b.dataset.theme;applyTheme();}));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>state.theme==='system'&&applyTheme());


// --- Output format: locked before creation, click + drag ---
const formatSwitch=$('#formatSwitch'), formatBubble=$('#formatBubble');
let formatDrag=false;
function formatIndex(){return state.outputFormat==='pdf'?1:0;}
function moveFormatBubble(stretch=false,x=null){
  const r=formatSwitch.getBoundingClientRect();if(!r.width)return;const w=r.width/2;let tx=formatIndex()*w;
  if(x!==null)tx=Math.max(0,Math.min(r.width-w,x-r.left-w/2));
  formatBubble.style.width=`${w-8}px`;formatBubble.style.transform=`translate3d(${tx+4}px,0,0) scaleX(${stretch?1.10:1})`;requestAnimationFrame(()=>glass.refreshShapes());
}
function applyFormat(){
  localStorage.setItem('lumadeck_format',state.outputFormat);$$('[data-format]').forEach(b=>b.classList.toggle('active',b.dataset.format===state.outputFormat));
  $('#formatHint').textContent=state.outputFormat.toUpperCase();$('#sendKicker').textContent=`BUILD ${state.outputFormat.toUpperCase()}`;$('#sendText').textContent=state.outputFormat==='pdf'?'Send PDF request':'Send presentation';moveFormatBubble(false);
}
function chooseFormatAt(clientX){const r=formatSwitch.getBoundingClientRect();const next=(clientX-r.left)<r.width/2?'pptx':'pdf';if(next!==state.outputFormat){state.outputFormat=next;applyFormat();if(navigator.vibrate)navigator.vibrate(5);}}
formatSwitch.addEventListener('pointerdown',e=>{formatDrag=true;formatSwitch.setPointerCapture?.(e.pointerId);chooseFormatAt(e.clientX);moveFormatBubble(true,e.clientX);glass.press(formatBubble,true,e);});
formatSwitch.addEventListener('pointermove',e=>{if(formatDrag){chooseFormatAt(e.clientX);moveFormatBubble(true,e.clientX);}});
function endFormat(e){if(!formatDrag)return;formatDrag=false;try{formatSwitch.releasePointerCapture?.(e.pointerId)}catch{}moveFormatBubble(false);glass.press(formatBubble,false,e);}
formatSwitch.addEventListener('pointerup',endFormat);formatSwitch.addEventListener('pointercancel',endFormat);
$$('[data-format]').forEach(b=>b.addEventListener('click',()=>{state.outputFormat=b.dataset.format;applyFormat();}));

// --- Auth ---
const authSheet=$('#authSheet'), authEmail=$('#authEmail'), authPassword=$('#authPassword'), authError=$('#authError');
function openAuth(){
  authSheet.classList.add('open'); authSheet.setAttribute('aria-hidden','false'); requestAnimationFrame(()=>glass.refreshShapes());
  if(state.session){
    $('#authTitle').textContent='Your account'; $('#authSub').textContent=state.session.email;
    $('.auth-tabs').classList.add('hidden'); $$(`#authSheet label`).forEach(x=>x.classList.add('hidden'));
    $('#authSubmit').classList.add('hidden'); $('#signoutBtn').classList.remove('hidden'); authError.textContent='';
  }else{
    $('.auth-tabs').classList.remove('hidden'); $$(`#authSheet label`).forEach(x=>x.classList.remove('hidden'));
    $('#authSubmit').classList.remove('hidden'); $('#signoutBtn').classList.add('hidden'); setAuthMode(state.authMode);
    setTimeout(()=>authEmail.focus(),180);
  }
}
function closeAuth(){authSheet.classList.remove('open');authSheet.setAttribute('aria-hidden','true');authError.textContent='';requestAnimationFrame(()=>glass.refreshShapes());}
function setAuthMode(mode){
  state.authMode=mode; const sign=mode==='signin';
  $('#signinTab').classList.toggle('active',sign); $('#signupTab').classList.toggle('active',!sign);
  $('#authTitle').textContent=sign?'Welcome back':'Create your account';
  $('#authSub').textContent=sign?'Open your private presentation history on this device.':'Create once. Your requests and finished decks stay with your account.';
  $('#authSubmit').innerHTML=`${sign?'Sign in':'Create account'} <span>↗</span>`;
  authPassword.autocomplete=sign?'current-password':'new-password'; authError.textContent='';
}
$('#accountBtn').addEventListener('click',openAuth); $('#authBackdrop').addEventListener('click',closeAuth);
$('#signinTab').addEventListener('click',()=>setAuthMode('signin')); $('#signupTab').addEventListener('click',()=>setAuthMode('signup'));
$('#authSubmit').addEventListener('click',submitAuth); authPassword.addEventListener('keydown',e=>e.key==='Enter'&&submitAuth());
async function submitAuth(){
  const email=authEmail.value.trim(),password=authPassword.value;
  if(!email||!password){authError.textContent='Enter email and password.';return;}
  const btn=$('#authSubmit'); btn.disabled=true; authError.textContent='';
  try{
    const data=await api(state.authMode==='signin'?'/api/auth-signin':'/api/auth-signup',{method:'POST',body:{email,password}});
    state.session=data.user; updateAccount(); closeAuth(); await loadJobs(); toast(state.authMode==='signin'?'Signed in.':'Account created.');
  }catch(e){authError.textContent=e.message;}
  finally{btn.disabled=false;}
}
$('#signoutBtn').addEventListener('click',async()=>{try{await api('/api/auth-signout',{method:'POST',body:{}});}catch{} state.session=null;state.jobs=[];updateAccount();renderHistory();closeAuth();toast('Signed out.');});
function updateAccount(){
  const l=$('#accountLabel');
  if(!state.session){l.textContent='Sign in';$('#accountBtn').classList.remove('signed');return;}
  l.textContent=state.session.email.split('@')[0]; $('#accountBtn').classList.add('signed');
}

// --- Jobs ---
const prompt=$('#prompt'),sendBtn=$('#sendBtn');
function autoGrow(){prompt.style.height='auto';prompt.style.height=`${Math.min(Math.max(prompt.scrollHeight,240),Math.round(innerHeight*.64))}px`;sendBtn.disabled=!prompt.value.trim();}
prompt.addEventListener('input',autoGrow);autoGrow();
sendBtn.addEventListener('click',sendJob);
async function sendJob(){
  const text=prompt.value.trim(); if(!text)return;
  if(!state.session){openAuth();return;}
  sendBtn.disabled=true;$('#sendText').textContent='Sending…';
  try{
    const wirePrompt=`[[LUMADECK_OUTPUT=${state.outputFormat.toUpperCase()}]]\n${text}`;
    const data=await api('/api/jobs',{method:'POST',body:{prompt:wirePrompt}});
    prompt.value='';autoGrow();state.jobs=[data.job,...state.jobs];renderHistory();toast(`${state.outputFormat.toUpperCase()} request saved. You can close the site.`);startPolling();
  }catch(e){toast(e.message);}finally{$('#sendText').textContent='Send presentation';sendBtn.disabled=!prompt.value.trim();}
}
async function loadSession(){
  try{const data=await api('/api/auth-session');state.session=data.user;updateAccount();await loadJobs();}catch{state.session=null;updateAccount();renderHistory();}
}
async function loadJobs(){
  if(!state.session){renderHistory();return;}
  try{const data=await api('/api/jobs');state.jobs=data.jobs||[];renderHistory();if(state.selected){const j=state.jobs.find(x=>x.id===state.selected.id);if(j){state.selected=j;if($('#viewer').classList.contains('open'))syncViewerData();}}startPolling();}catch(e){if(/unauthorized/i.test(e.message)){state.session=null;updateAccount();}renderHistory();}
}
function renderHistory(){
  $('#historyCount').textContent=state.jobs.length;
  const list=$('#historyList');
  if(!state.session){list.innerHTML=`<button class="empty-state sign-empty"><span class="empty-symbol">○</span><b>Sign in to start.</b><p>Your requests and finished presentations stay private.</p></button>`;$('.sign-empty')?.addEventListener('click',openAuth);return;}
  if(!state.jobs.length){list.innerHTML=`<div class="empty-state"><span class="empty-symbol">↗</span><b>Your presentations will appear here.</b><p>Write what you need above, then tap Send presentation.</p></div>`;return;}
  list.innerHTML='';
  state.jobs.forEach(job=>{
    const b=document.createElement('button');b.className='job-card';
    const ready=job.status==='ready',active=activeStatuses.has(job.status);
    b.innerHTML=`<span class="job-status ${ready?'ready':active?'active':''}">${ready?'✓':Math.max(0,job.progress||0)+'%'}</span><span class="job-copy"><b>${escapeHtml(job.title||job.promptPreview||'Presentation')}</b><small>${prettyStatus(job.status)} · ${(job.outputFormat||'pptx').toUpperCase()} · ${timeAgo(job.createdAt)}</small></span><span class="job-chevron">›</span>`;
    b.addEventListener('click',()=>{if(ready&&job.previewUrls?.length)openViewer(job);else{state.selected=job;toast(`${prettyStatus(job.status)} · ${job.progress||0}%`);}}); list.appendChild(b);
  });
}
function startPolling(){
  clearInterval(state.polling);state.polling=null;
  if(state.session&&state.jobs.some(j=>activeStatuses.has(j.status))) state.polling=setInterval(loadJobs,6500);
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

// --- Full-screen viewer ---
const viewer=$('#viewer'),mainSlide=$('#mainSlide'),thumbStrip=$('#thumbStrip'),slideFrame=$('#slideFrame');
function openViewer(job){
  state.selected=job;state.slide=0;viewer.classList.add('open');viewer.setAttribute('aria-hidden','false');document.body.classList.add('viewer-open');
  syncViewerData(true);glass.setViewer(true);requestAnimationFrame(()=>glass.refreshShapes());
}
function closeViewer(){viewer.classList.remove('open');viewer.setAttribute('aria-hidden','true');document.body.classList.remove('viewer-open');state.selected=null;glass.setViewer(false);requestAnimationFrame(()=>glass.refreshShapes());}
$('#viewerClose').addEventListener('click',closeViewer);
function syncViewerData(reset=false){
  const j=state.selected;if(!j)return;const urls=j.previewUrls||[];if(reset)state.slide=0;state.slide=Math.max(0,Math.min(urls.length-1,state.slide));
  const format=(j.outputFormat||'pptx').toLowerCase(),pdfMode=format==='pdf';
  $('#viewerTitle').textContent=j.title||'Presentation';$('#viewerKind').textContent=pdfMode?'PDF DOCUMENT':'PRESENTATION';$('#viewerPage').textContent=`${state.slide+1}/${urls.length||10}`;
  if(thumbStrip.children.length!==urls.length){thumbStrip.innerHTML='';urls.forEach((u,i)=>{const b=document.createElement('button');b.className='thumb';b.innerHTML=`<img src="${u}" alt="${pdfMode?'Page':'Slide'} ${i+1}">`;b.addEventListener('click',()=>showSlide(i,i>state.slide?1:-1));thumbStrip.appendChild(b);});}
  if(urls.length)showSlide(state.slide,0,true);
  $('#viewerActions').classList.toggle('pdf-mode',pdfMode);$('#pptxBtn').classList.toggle('hidden',pdfMode);$('#pdfBtn').classList.remove('hidden');
  $('#pdfLabel').textContent='PDF';$('#shareLabel').textContent=pdfMode?'Share PDF':'Share PPTX';
  $('#pptxBtn').disabled=!j.pptxUrl;$('#pdfBtn').disabled=!j.pdfUrl;$('#shareBtn').disabled=pdfMode?!j.pdfUrl:!j.pptxUrl;
  requestAnimationFrame(()=>glass.refreshShapes());
}
function transitionName(i){
  const arr=state.selected?.animationManifest?.transitions;
  return Array.isArray(arr)&&arr[i]?arr[i]:['fade','push','zoom','wipe'][i%4];
}
function showSlide(index,dir=1,immediate=false){
  const urls=state.selected?.previewUrls||[];if(!urls[index])return;
  state.slide=index;mainSlide.src=urls[index];$('#viewerPage').textContent=`${index+1}/${urls.length}`;
  $$('.thumb',thumbStrip).forEach((b,i)=>b.classList.toggle('active',i===index));
  const active=$$('.thumb',thumbStrip)[index];active?.scrollIntoView({behavior:state.reduceMotion?'auto':'smooth',inline:'center',block:'nearest'});
  glass.setSlide(urls[index]);
  if(immediate||state.reduceMotion||(state.selected?.outputFormat||'pptx')==='pdf')return;
  const name=transitionName(index); const duration=Math.min(700,Math.max(260,state.selected?.animationManifest?.duration||520));
  slideFrame.getAnimations().forEach(a=>a.cancel());
  let kf;
  if(name==='zoom') kf=[{opacity:.35,transform:'scale(.92)'},{opacity:1,transform:'scale(1)'}];
  else if(name==='wipe') kf=[{clipPath:dir>=0?'inset(0 100% 0 0 round 10px)':'inset(0 0 0 100% round 10px)',opacity:.65},{clipPath:'inset(0 0 0 0 round 10px)',opacity:1}];
  else if(name==='push') kf=[{opacity:.3,transform:`translate3d(${dir>=0?22:-22}%,0,0) scale(.985)`},{opacity:1,transform:'translate3d(0,0,0) scale(1)'}];
  else kf=[{opacity:.1,transform:'scale(.99)'},{opacity:1,transform:'scale(1)'}];
  slideFrame.animate(kf,{duration,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
}
let swipe={active:false,x:0,y:0,lastX:0};
slideStagePointer('#slideStage');
function slideStagePointer(sel){const el=$(sel);el.addEventListener('pointerdown',e=>{swipe={active:true,x:e.clientX,y:e.clientY,lastX:e.clientX};el.setPointerCapture?.(e.pointerId);});el.addEventListener('pointermove',e=>{if(!swipe.active)return;swipe.lastX=e.clientX;const dx=e.clientX-swipe.x;slideFrame.style.transform=`translate3d(${dx*.22}px,0,0) scale(${1-Math.min(.018,Math.abs(dx)/9000)})`;});const end=e=>{if(!swipe.active)return;const dx=(swipe.lastX||e.clientX)-swipe.x;swipe.active=false;slideFrame.style.transform='';if(Math.abs(dx)>45){const next=state.slide+(dx<0?1:-1);if(next>=0&&next<(state.selected?.previewUrls?.length||0))showSlide(next,dx<0?1:-1);}};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);}

async function artifactBlob(job,type){
  const r=await fetch(`/api/artifact?id=${encodeURIComponent(job.id)}&type=${type}`,{credentials:'include'});if(!r.ok)throw new Error('File download failed');return r.blob();
}
async function forceDownload(job,type,filename){const blob=await artifactBlob(job,type);const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),15000);return blob;}
$('#pptxBtn').addEventListener('click',async()=>{try{await forceDownload(state.selected,'pptx',`${safeName(state.selected.title)}.pptx`);toast('PPTX downloaded.');}catch(e){toast(e.message);}});
$('#pdfBtn').addEventListener('click',async()=>{try{await forceDownload(state.selected,'pdf',`${safeName(state.selected.title)}.pdf`);toast('PDF downloaded.');}catch(e){toast(e.message);}});
$('#shareBtn').addEventListener('click',async()=>{
  const j=state.selected;if(!j)return;const type=(j.outputFormat||'pptx')==='pdf'?'pdf':'pptx';const raw=type==='pdf'?j.pdfUrl:j.pptxUrl;if(!raw)return;
  try{
    const blob=await artifactBlob(j,type);const mime=type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const file=new File([blob],`${safeName(j.title)}.${type}`,{type:mime});
    if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:j.title||'Presentation'});}
    else{const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),15000);toast(`${type.toUpperCase()} downloaded — share it from Downloads.`);}
  }catch(e){if(e?.name!=='AbortError')toast(e.message||'Share failed');}
});

glass.init();applyTheme();applyFormat();loadSession();
