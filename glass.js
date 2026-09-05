export function createLumaGlass({$, $$, state, getSlideFrame}){
  return(()=>{
  const canvas=$('#glassCanvas');
  let gl,program,texture,backdrop,ctx,loc={},shapes=[],running=false,viewerMode=false,currentSlideImg=null,theme='light';
  let geometryDirty=true,backdropDirty=true,lastTs=0;
  const pressMap=new WeakMap();
  const mobile=matchMedia('(max-width: 760px)').matches;
  const memory=Number(navigator.deviceMemory||4),cores=Number(navigator.hardwareConcurrency||4);
  const tier=(!mobile&&memory>=8&&cores>=8)?2:(memory<=3||cores<=4?0:1);
  const MAX=tier===2?16:tier===1?12:8;
  const modeCode={regular:0,clear:1,interactive:2,thick:3};

  const vert=`#version 300 es
  in vec2 aPos;
  void main(){ gl_Position=vec4(aPos,0.,1.); }`;

  const frag=`#version 300 es
  precision highp float;
  out vec4 outColor;
  uniform sampler2D uBackdrop;
  uniform vec2 uResolution;
  uniform float uDpr;
  uniform float uTier;
  uniform float uDark;
  uniform int uCount;
  uniform vec4 uShape[16];
  uniform float uRadius[16];
  uniform float uPress[16];
  uniform vec2 uPressPoint[16];
  uniform float uMode[16];

  float sdRound(vec2 p, vec2 b, float r){
    vec2 q=abs(p)-b+r;
    return min(max(q.x,q.y),0.)+length(max(q,0.))-r;
  }
  float lensMap(float x){ x=clamp(x,0.,1.); return 1.-sqrt(max(1.-x*x,0.)); }
  float lum(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }
  vec3 sat(vec3 c,float s){ float l=lum(c); return mix(vec3(l),c,s); }
  vec3 bg(vec2 p){ vec2 uv=vec2(p.x/uResolution.x,1.-p.y/uResolution.y); return texture(uBackdrop,clamp(uv,vec2(.002),vec2(.998))).rgb; }
  vec3 scatterSample(vec2 p,vec2 tangent,float scatter){
    if(uTier<.5 || scatter<.2) return bg(p);
    vec3 a=bg(p-tangent*scatter), b=bg(p), c=bg(p+tangent*scatter);
    return (a+b+c)/3.;
  }

  void main(){
    vec2 p=gl_FragCoord.xy;
    float best=1e9; int bi=-1;
    for(int i=0;i<16;i++){
      if(i>=uCount) break;
      vec4 s=uShape[i];
      float d=sdRound(p-s.xy,s.zw,uRadius[i]);
      if(d<best){best=d;bi=i;}
    }
    if(bi<0 || best>0.){outColor=vec4(0.);return;}

    vec4 s=uShape[bi];
    float mode=uMode[bi], press=uPress[bi];
    float minDim=max(2.,min(s.z,s.w)*2.);
    float e=max(.7,uDpr*.65);
    float dpx=sdRound((p+vec2(e,0.))-s.xy,s.zw,uRadius[bi])-sdRound((p-vec2(e,0.))-s.xy,s.zw,uRadius[bi]);
    float dpy=sdRound((p+vec2(0.,e))-s.xy,s.zw,uRadius[bi])-sdRound((p-vec2(0.,e))-s.xy,s.zw,uRadius[bi]);
    vec2 n=normalize(vec2(dpx,dpy)+vec2(.0001));
    vec2 tangent=vec2(-n.y,n.x);
    float edgeDepth=max(-best,0.);

    float clearStep=step(.5,mode)*step(mode,1.5);
    float interactiveStep=step(1.5,mode)*step(mode,2.5);
    float thickStep=step(2.5,mode);
    float refrH=mix(.24,.28,clearStep);
    refrH=mix(refrH,.24,interactiveStep);
    refrH=mix(refrH,.38,thickStep);
    float refrA=mix(.42,.65,clearStep);
    refrA=mix(refrA,.52,interactiveStep);
    refrA=mix(refrA,.82,thickStep);
    float chroma=mix(.28,.48,clearStep);
    chroma=mix(chroma,.34,interactiveStep);
    chroma=mix(chroma,.32,thickStep);
    float scatter=mix(1.4,.30,clearStep);
    scatter=mix(scatter,1.15,interactiveStep);
    scatter=mix(scatter,2.0,thickStep);
    float saturation=mix(1.08,1.12,clearStep);
    saturation=mix(saturation,1.09,interactiveStep);
    saturation=mix(saturation,1.05,thickStep);
    float tintAlpha=mix(.06,.025,clearStep);
    tintAlpha=mix(tintAlpha,.055,interactiveStep);
    tintAlpha=mix(tintAlpha,.08,thickStep);
    float rimAlpha=mix(.42,.38,clearStep);
    rimAlpha=mix(rimAlpha,.46,interactiveStep);
    rimAlpha=mix(rimAlpha,.52,thickStep);

    float lens=0.;
    float h=max(3.,minDim*refrH);
    if(edgeDepth<h) lens=lensMap(1.-edgeDepth/h);

    vec2 radial=normalize((p-s.xy)+vec2(.0001));
    vec2 depthDir=normalize(n+radial*.48);
    float pressBoost=1.+press*(interactiveStep>.5?0.12:0.06);
    vec2 sampleP=p-depthDir*(minDim*refrA*lens*pressBoost);

    vec2 pp=uPressPoint[bi], toP=p-pp;
    float bulge=exp(-dot(toP,toP)/max(minDim*minDim*.15,1.));
    sampleP-=toP*press*.055*bulge;

    float sPx=scatter*uDpr*(uTier<.5?.35:1.);
    float cPx=minDim*.0046*chroma*lens*(uTier<.5?0.:1.);
    vec3 base=scatterSample(sampleP,tangent,sPx);
    vec3 col;
    col.r=scatterSample(sampleP-n*cPx,tangent,sPx).r;
    col.g=base.g;
    col.b=scatterSample(sampleP+n*cPx,tangent,sPx).b;
    col=sat(col,saturation);

    float L=lum(col);
    float bright=smoothstep(.55,.78,L);
    float darkBackdrop=1.-smoothstep(.20,.48,L);
    vec3 lightTint=vec3(.955,.985,.968);
    vec3 darkTint=vec3(.018,.030,.026);
    float adaptive=tintAlpha + (uDark>.5?bright*.08:darkBackdrop*.045);
    col=mix(col,uDark>.5?darkTint:lightTint,adaptive);

    float rim=1.-smoothstep(0.,max(4.*uDpr,minDim*.052),edgeDepth);
    vec2 baseLight=normalize(vec2(-.62,.78));
    vec2 pointerDir=normalize((pp-p)+vec2(.001));
    vec2 lightDir=normalize(mix(baseLight,pointerDir,min(.24,press*.24)));
    float facing=pow(max(dot(n,lightDir)*.5+.5,0.),4.2);
    float opposite=pow(max(dot(n,-lightDir)*.5+.5,0.),3.2);
    col+=vec3(rim*facing*rimAlpha*(1.+press*.42));
    col-=vec3(rim*opposite*.052);
    col+=vec3(rim*.025*(1.-bright));

    float alpha=mix(.94,.90,clearStep);
    alpha=mix(alpha,.95,thickStep);
    outColor=vec4(col,alpha);
  }`;

  function compile(type,src){
    const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)||'shader compile');
    return sh;
  }

  function init(){
    try{
      gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:tier>0,preserveDrawingBuffer:false});
      if(!gl) throw new Error('no webgl2');
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vert));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||'link');
      gl.useProgram(program);
      const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const a=gl.getAttribLocation(program,'aPos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      ['uResolution','uDpr','uTier','uCount','uDark','uBackdrop'].forEach(n=>loc[n]=gl.getUniformLocation(program,n));
      loc.shape=gl.getUniformLocation(program,'uShape[0]');loc.radius=gl.getUniformLocation(program,'uRadius[0]');loc.press=gl.getUniformLocation(program,'uPress[0]');loc.pressPoint=gl.getUniformLocation(program,'uPressPoint[0]');loc.mode=gl.getUniformLocation(program,'uMode[0]');
      backdrop=document.createElement('canvas');ctx=backdrop.getContext('2d',{alpha:false});
      resize();bindInteractions();
      running=true;requestAnimationFrame(frame);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!running){running=true;lastTs=0;requestAnimationFrame(frame)}});
      window.addEventListener('resize',()=>{resize();markBackdrop();},{passive:true});
      window.addEventListener('scroll',()=>{geometryDirty=true;},{passive:true});
      new ResizeObserver(()=>{geometryDirty=true;}).observe(document.documentElement);
      $$('.ambient-card').forEach(el=>{if(el.tagName==='IMG')el.addEventListener('load',markBackdrop,{once:true});});
    }catch{
      document.documentElement.classList.add('no-webgl');
      canvas.style.display='none';
    }
  }

  function bindInteractions(){
    $$('[data-glass]').forEach(el=>{
      if(el.dataset.glassBound) return;el.dataset.glassBound='1';
      el.addEventListener('pointerdown',e=>press(el,true,e));
      el.addEventListener('pointerup',e=>press(el,false,e));
      el.addEventListener('pointercancel',e=>press(el,false,e));
    });
  }

  function resize(){
    if(!gl)return;
    const cap=tier===2?1.75:tier===1?1.5:1.0;
    const dpr=Math.min(window.devicePixelRatio||1,cap);
    const w=Math.max(1,Math.min(innerWidth,560)),h=Math.max(1,innerHeight);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);backdrop.width=canvas.width;backdrop.height=canvas.height;
    canvas.style.width=w+'px';canvas.style.height=h+'px';gl.viewport(0,0,canvas.width,canvas.height);
    geometryDirty=true;backdropDirty=true;
  }

  function refreshShapes(){ geometryDirty=true; bindInteractions(); }
  function updateGeometry(){
    if(!gl)return;
    const cr=canvas.getBoundingClientRect(),sx=canvas.width/cr.width,sy=canvas.height/cr.height;
    shapes=$$('[data-glass]').filter(el=>{
      const st=getComputedStyle(el),r=el.getBoundingClientRect();
      return st.display!=='none'&&st.visibility!=='hidden'&&Number(st.opacity)!==0&&r.width>2&&r.height>2&&r.bottom>0&&r.top<innerHeight;
    }).slice(0,MAX).map(el=>{
      const r=el.getBoundingClientRect(),rad=parseFloat(el.dataset.radius||'24');
      let p=pressMap.get(el);if(!p){p={value:0,target:0,v:0,x:r.width/2,y:r.height/2};pressMap.set(el,p);}
      return {el,cx:(r.left+r.width/2-cr.left)*sx,cy:(canvas.clientHeight-(r.top+r.height/2-cr.top))*sy,hw:r.width/2*sx,hh:r.height/2*sy,r:rad*((sx+sy)/2),p,px:(r.left+p.x-cr.left)*sx,py:(canvas.clientHeight-(r.top+p.y-cr.top))*sy,mode:modeCode[el.dataset.glass]??0};
    });
    geometryDirty=false;
  }

  function drawBackdrop(){
    if(!ctx)return;
    const w=backdrop.width,h=backdrop.height,dpr=w/Math.max(1,Math.min(innerWidth,560));
    const dark=theme==='dark'||viewerMode;
    ctx.clearRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,0,h);
    if(viewerMode){g.addColorStop(0,'#101813');g.addColorStop(1,'#050807');}
    else if(dark){g.addColorStop(0,'#0b120f');g.addColorStop(.5,'#111a16');g.addColorStop(1,'#0a0f0d');}
    else{g.addColorStop(0,'#f6f8f4');g.addColorStop(.55,'#edf1eb');g.addColorStop(1,'#e8ede7');}
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);

    ctx.globalAlpha=dark?.075:.055;ctx.strokeStyle=dark?'#cbeee1':'#245840';ctx.lineWidth=Math.max(1,dpr*.65);const grid=44*dpr;
    for(let x=0;x<w;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.globalAlpha=1;
    const lights=[
      [w*.88,h*.08,w*.46,dark?'rgba(77,211,165,.22)':'rgba(105,223,185,.46)'],
      [w*.02,h*.56,w*.42,dark?'rgba(150,120,220,.12)':'rgba(190,166,233,.26)'],
      [w*.95,h*.82,w*.34,dark?'rgba(225,160,95,.08)':'rgba(240,194,132,.20)']
    ];
    for(const [x,y,r,c] of lights){const rg=ctx.createRadialGradient(x,y,0,x,y,r);rg.addColorStop(0,c);rg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,w,h);}

    if(viewerMode&&currentSlideImg?.complete){
      const r=getSlideFrame().getBoundingClientRect();ctx.globalAlpha=.24;ctx.drawImage(currentSlideImg,r.left*dpr,r.top*dpr,r.width*dpr,r.height*dpr);ctx.globalAlpha=1;
    }else{
      const fills=dark?['rgba(46,121,94,.25)','rgba(102,78,150,.18)','rgba(151,104,46,.14)']:['rgba(185,235,218,.58)','rgba(222,207,248,.50)','rgba(247,221,179,.48)'];
      $$('.ambient-card').forEach((el,i)=>{const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return;ctx.save();ctx.globalAlpha=dark?.42:.62;ctx.fillStyle=fills[i%fills.length];const x=r.left*dpr,y=r.top*dpr,w=r.width*dpr,h=r.height*dpr,rad=Math.min(22*dpr,w*.18,h*.18);ctx.beginPath();ctx.roundRect(x,y,w,h,rad);ctx.fill();ctx.globalAlpha=dark?.20:.34;ctx.fillStyle=i===1?'#9a7fd3':i===2?'#c78b42':'#2ba783';ctx.beginPath();ctx.roundRect(x+w*.10,y+h*.68,w*.34,Math.max(2,dpr*2.4),dpr*3);ctx.fill();ctx.restore();});
    }
    backdropDirty=false;
  }

  function uploadBackdrop(){
    if(backdropDirty)drawBackdrop();
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,backdrop);
  }

  function frame(ts){
    if(document.visibilityState==='hidden'){running=false;return;}
    const minFrame=tier===0?33:16;
    if(ts-lastTs<minFrame){requestAnimationFrame(frame);return;}lastTs=ts;
    if(geometryDirty)updateGeometry();
    const dt=Math.min(.034,1/(tier===0?30:60));
    for(const s of shapes){const p=s.p;const stiffness=state.reduceMotion?900:420,damping=state.reduceMotion?60:27;const acc=(p.target-p.value)*stiffness-p.v*damping;p.v+=acc*dt;p.value+=p.v*dt;}
    uploadBackdrop();
    gl.useProgram(program);gl.uniform1i(loc.uBackdrop,0);gl.uniform2f(loc.uResolution,canvas.width,canvas.height);gl.uniform1f(loc.uDpr,canvas.width/Math.max(1,canvas.clientWidth));gl.uniform1f(loc.uTier,tier);gl.uniform1i(loc.uCount,shapes.length);gl.uniform1f(loc.uDark,(theme==='dark'||viewerMode)?1:0);
    const sv=new Float32Array(16*4),rv=new Float32Array(16),pv=new Float32Array(16),pp=new Float32Array(16*2),mv=new Float32Array(16);
    shapes.forEach((s,i)=>{sv.set([s.cx,s.cy,s.hw,s.hh],i*4);rv[i]=s.r;pv[i]=Math.max(0,Math.min(1.2,s.p.value));pp.set([s.px,s.py],i*2);mv[i]=s.mode;});
    gl.uniform4fv(loc.shape,sv);gl.uniform1fv(loc.radius,rv);gl.uniform1fv(loc.press,pv);gl.uniform2fv(loc.pressPoint,pp);gl.uniform1fv(loc.mode,mv);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,6);
    requestAnimationFrame(frame);
  }

  function press(el,on,e){
    const r=el.getBoundingClientRect();let p=pressMap.get(el);if(!p){p={value:0,target:0,v:0,x:r.width/2,y:r.height/2};pressMap.set(el,p);}
    p.target=on?1:0;if(e){p.x=Math.max(0,Math.min(r.width,e.clientX-r.left));p.y=Math.max(0,Math.min(r.height,e.clientY-r.top));}
    geometryDirty=true;
  }
  function markBackdrop(){backdropDirty=true;}
  function setSlide(url){currentSlideImg=new Image();currentSlideImg.onload=markBackdrop;currentSlideImg.src=url;}
  function setViewer(v){viewerMode=v;canvas.classList.toggle('viewer-canvas',v);geometryDirty=true;backdropDirty=true;}
  function setTheme(t){theme=t;backdropDirty=true;}
  return{init,refreshShapes,press,setViewer,setSlide,setTheme,markBackdrop,tier};
})();
}
