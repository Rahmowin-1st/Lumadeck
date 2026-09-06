export const GLASS_VERT=`#version 300 es
in vec2 aPos;
void main(){gl_Position=vec4(aPos,0.0,1.0);}`;

export const GLASS_FRAG=`#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uBackdrop;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uTier;
uniform float uDark;
uniform float uViewer;
uniform int uCount;
uniform vec4 uShape[16];
uniform float uRadius[16];
uniform float uPress[16];
uniform vec2 uPressPoint[16];
uniform float uMode[16];
float sdRound(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;}
float lensMap(float x){x=clamp(x,0.0,1.0);return 1.0-sqrt(max(1.0-x*x,0.0));}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 sat(vec3 c,float s){float l=lum(c);return mix(vec3(l),c,s);}
vec3 bg(vec2 p){vec2 uv=vec2(p.x/uResolution.x,1.0-p.y/uResolution.y);return texture(uBackdrop,clamp(uv,vec2(.0015),vec2(.9985))).rgb;}
vec3 scatter3(vec2 p,vec2 tangent,float radius){if(uTier<.5||radius<.15)return bg(p);vec3 a=bg(p-tangent*radius),b=bg(p),c=bg(p+tangent*radius);return a*.22+b*.56+c*.22;}
vec3 spectral(vec2 p,vec2 n,vec2 tangent,float scatter,float shift){
 if(uTier<.5||shift<.05)return scatter3(p,tangent,scatter);
 if(uTier<1.5){vec3 mid=scatter3(p,tangent,scatter);return vec3(scatter3(p-n*shift,tangent,scatter).r,mid.g,scatter3(p+n*shift,tangent,scatter).b);}
 vec3 s0=scatter3(p-n*shift*1.50,tangent,scatter),s1=scatter3(p-n*shift*1.00,tangent,scatter),s2=scatter3(p-n*shift*.50,tangent,scatter),s3=scatter3(p,tangent,scatter),s4=scatter3(p+n*shift*.50,tangent,scatter),s5=scatter3(p+n*shift*1.00,tangent,scatter),s6=scatter3(p+n*shift*1.50,tangent,scatter);
 return vec3(s0.r*.45+s1.r*.35+s2.r*.20,s2.g*.20+s3.g*.60+s4.g*.20,s4.b*.20+s5.b*.35+s6.b*.45);
}
void main(){
 vec2 p=gl_FragCoord.xy;float best=-1e9,bestArea=1e30;int bi=-1;
 // Small nested lenses win over their parent material and still sample original backdrop.
 for(int i=0;i<16;i++){if(i>=uCount)break;vec4 s=uShape[i];float d=sdRound(p-s.xy,s.zw,uRadius[i]);float area=s.z*s.w;if(d<=0.0&&area<bestArea){bestArea=area;best=d;bi=i;}}
 if(bi<0){if(uViewer>.5)outColor=vec4(0.0);else outColor=vec4(bg(p),1.0);return;}
 vec4 s=uShape[bi];float mode=uMode[bi],press=uPress[bi],minDim=max(2.0,min(s.z,s.w)*2.0),eps=max(.75,uDpr*.60);
 float dx=sdRound((p+vec2(eps,0.0))-s.xy,s.zw,uRadius[bi])-sdRound((p-vec2(eps,0.0))-s.xy,s.zw,uRadius[bi]);
 float dy=sdRound((p+vec2(0.0,eps))-s.xy,s.zw,uRadius[bi])-sdRound((p-vec2(0.0,eps))-s.xy,s.zw,uRadius[bi]);
 vec2 n=normalize(vec2(dx,dy)+vec2(.0001)),tangent=vec2(-n.y,n.x);float edgeDepth=max(-best,0.0);
 float isClear=step(.5,mode)*step(mode,1.5),isInteractive=step(1.5,mode)*step(mode,2.5),isThick=step(2.5,mode);
 // Guide-based V4: stronger lens, less fog. Refraction stays rim-local.
 float refrH=mix(.23,.30,isClear);refrH=mix(refrH,.25,isInteractive);refrH=mix(refrH,.36,isThick);
 float refrA=mix(.52,.78,isClear);refrA=mix(refrA,.64,isInteractive);refrA=mix(refrA,.90,isThick);
 float depthE=mix(.58,.82,isClear);depthE=mix(depthE,.68,isInteractive);depthE=mix(depthE,.98,isThick);
 float chroma=mix(.32,.58,isClear);chroma=mix(chroma,.38,isInteractive);chroma=mix(chroma,.36,isThick);
 float scatter=mix(1.00,.18,isClear);scatter=mix(scatter,.75,isInteractive);scatter=mix(scatter,1.40,isThick);
 float saturation=mix(1.10,1.16,isClear);saturation=mix(saturation,1.12,isInteractive);saturation=mix(saturation,1.07,isThick);
 float tintAlpha=mix(.035,.015,isClear);tintAlpha=mix(tintAlpha,.030,isInteractive);tintAlpha=mix(tintAlpha,.055,isThick);
 float rimAlpha=mix(.48,.44,isClear);rimAlpha=mix(rimAlpha,.56,isInteractive);rimAlpha=mix(rimAlpha,.60,isThick);
 float lens=0.0,h=max(3.0,minDim*refrH);if(edgeDepth<h)lens=lensMap(1.0-edgeDepth/h);
 vec2 radial=normalize((p-s.xy)+vec2(.0001)),depthDir=normalize(n+radial*depthE);float pressBoost=1.0+press*(isInteractive>.5?.16:.08);vec2 sampleP=p-depthDir*(minDim*refrA*lens*pressBoost);
 vec2 pp=uPressPoint[bi],toP=p-pp;float bulge=exp(-dot(toP,toP)/max(minDim*minDim*.15,1.0));sampleP-=toP*press*.075*bulge;
 float scatterPx=scatter*uDpr*(uTier<.5?.32:1.0),chromaPx=minDim*.0048*chroma*lens*(uTier<.5?0.0:1.0);vec3 col=spectral(sampleP,n,tangent,scatterPx,chromaPx);col=sat(col,saturation);
 float L=lum(col),bright=smoothstep(.55,.78,L),darkBackdrop=1.0-smoothstep(.20,.48,L);vec3 lightTint=vec3(.955,.986,.969),darkTint=vec3(.018,.030,.025);float adaptive=tintAlpha+(uDark>.5?bright*.055:darkBackdrop*.028);col=mix(col,uDark>.5?darkTint:lightTint,adaptive);
 float rim=1.0-smoothstep(0.0,max(3.5*uDpr,minDim*.044),edgeDepth);vec2 baseLight=normalize(vec2(-.62,.78)),pointerDir=normalize((pp-p)+vec2(.001)),lightDir=normalize(mix(baseLight,pointerDir,min(.28,press*.28)));float facing=pow(max(dot(n,lightDir)*.5+.5,0.0),4.4),opposite=pow(max(dot(n,-lightDir)*.5+.5,0.0),3.0);col+=vec3(rim*facing*rimAlpha*(1.0+press*.55));col-=vec3(rim*opposite*.050);col+=vec3(rim*.018*(1.0-bright));
 outColor=vec4(col,uViewer>.5?.965:1.0);
}`;
