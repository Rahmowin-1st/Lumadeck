const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const viewer=$('#viewer');if(viewer){
  const titleRow=$('.viewer-title-row',viewer),page=$('#viewerPage'),thumbStrip=$('#thumbStrip');
  const play=document.createElement('button');play.id='viewerPlay';play.className='viewer-play glass-host hidden';play.dataset.glass='interactive';play.dataset.radius='21';play.setAttribute('aria-label','Play presentation');play.innerHTML='<span class="viewer-play-icon">▶</span><span class="viewer-play-ring" aria-hidden="true"></span>';
  titleRow?.insertBefore(play,page);
  const status=document.createElement('div');status.className='viewer-playback-status';status.textContent='Presentation playback';viewer.appendChild(status);
  let timer=null,playing=false,lastActive=-1;
  const thumbs=()=>thumbStrip?$$('.thumb',thumbStrip):[];
  const isPdf=()=>($('#viewerKind')?.textContent||'').toUpperCase().includes('PDF');
  const activeIndex=()=>{const i=thumbs().findIndex(x=>x.classList.contains('active'));return i<0?0:i;};
  function setPlaying(v){playing=!!v;viewer.classList.toggle('playing',playing);play.classList.toggle('playing',playing);play.querySelector('.viewer-play-icon').textContent=playing?'Ⅱ':'▶';play.setAttribute('aria-label',playing?'Pause presentation':'Play presentation');status.classList.toggle('show',playing);if(!playing){clearTimeout(timer);timer=null;}}
  function animateCurrent(){
    const frame=$('#slideFrame'),img=$('#mainSlide');if(!frame||!img)return;
    frame.getAnimations().forEach(a=>a.cancel());img.getAnimations().forEach(a=>a.cancel());
    frame.animate([{opacity:.18,transform:'translate3d(0,18px,0) scale(.965)'},{opacity:1,transform:'translate3d(0,0,0) scale(1)'}],{duration:620,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
    img.animate([{transform:'scale(1.035)'},{transform:'scale(1)'}],{duration:2850,easing:'cubic-bezier(.2,.72,.25,1)',fill:'both'});
  }
  function schedule(){clearTimeout(timer);if(!playing)return;animateCurrent();timer=setTimeout(()=>{if(!playing)return;const list=thumbs(),i=activeIndex();if(!list.length){setPlaying(false);return;}if(i>=list.length-1){setPlaying(false);status.textContent='Finished';status.classList.add('show');setTimeout(()=>{status.classList.remove('show');status.textContent='Presentation playback';},1300);return;}list[i+1].click();setTimeout(schedule,80);},3200);}
  function start(){if(isPdf())return;const list=thumbs();if(!list.length)return;if(activeIndex()>=list.length-1)list[0].click();setPlaying(true);schedule();}
  play.addEventListener('click',()=>playing?setPlaying(false):start());
  $('#viewerClose')?.addEventListener('click',()=>setPlaying(false));
  thumbStrip?.addEventListener('click',()=>{if(playing)setTimeout(schedule,100);});
  $('#slideStage')?.addEventListener('pointerdown',()=>{if(playing){clearTimeout(timer);timer=null;}});
  $('#slideStage')?.addEventListener('pointerup',()=>{if(playing)setTimeout(schedule,120);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)setPlaying(false);});
  const obs=new MutationObserver(()=>{
    const open=viewer.classList.contains('open'),pdf=isPdf();play.classList.toggle('hidden',!open||pdf);if((!open||pdf)&&playing)setPlaying(false);
    const now=activeIndex();if(playing&&now!==lastActive)lastActive=now;
  });
  obs.observe(viewer,{attributes:true,subtree:true,childList:true,characterData:true,attributeFilter:['class']});
}
