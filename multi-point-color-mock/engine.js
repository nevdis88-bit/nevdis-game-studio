// Deterministic edge-colour renderer. No generative model or image blur.
// OKLab conversion: Björn Ottosson, https://bottosson.github.io/posts/oklab/
// OKLCH definitions: https://www.w3.org/TR/css-color-4/#ok-lab
export const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
const lin = x => x<=0.04045 ? x/12.92 : ((x+0.055)/1.055)**2.4;
const enc = x => x<=0.0031308 ? 12.92*x : 1.055*x**(1/2.4)-0.055;
export const hex = rgb => '#'+rgb.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('').toUpperCase();
export function rgbToLab(rgb) {
  const [r,g,b]=rgb.map(v=>lin(v/255));
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
export function labToRgb([L,a,b]) {
  const l=(L+.3963377774*a+.2158037573*b)**3;
  const m=(L-.1055613458*a-.0638541728*b)**3;
  const s=(L-.0894841775*a-1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(v=>enc(v)*255);
}
export function constrain(rgb,options) {
  const raw=rgbToLab(rgb), C=Math.hypot(raw[1],raw[2]);
  const L=clamp(raw[0],options.lmin,options.lmax), targetC=Math.min(C,options.cmax);
  const hue=C>1e-10?Math.atan2(raw[2],raw[1]):0;
  let finalC=targetC;
  const at=c=>[L,c*Math.cos(hue),c*Math.sin(hue)];
  const inGamut=c=>labToRgb(at(c)).every(v=>v>=-.001&&v<=255.001);
  if(!inGamut(finalC)) {let lo=0,hi=finalC; for(let i=0;i<22;i++){const mid=(lo+hi)/2;if(inGamut(mid))lo=mid;else hi=mid;}finalC=lo;}
  const lab=at(finalC);
  return {lab,rgb:labToRgb(lab).map(v=>clamp(v,0,255)),L,C:finalC,h:(hue*180/Math.PI+360)%360,rawL:raw[0],rawC:C};
}
export function pointsFor(rect,axis,inset=.02,depth=0) {
  const {x,y,w,h}=rect; const points=[];
  for(let side=0;side<2;side++) for(let i=0;i<6;i++) {
    const t=inset+(1-2*inset)*i/5;
    const dx=Math.min(depth,(w-1)/2),dy=Math.min(depth,(h-1)/2);
    points.push({id:side*6+i+1,side,index:i,x:Math.round(x+(axis==='lr'?dx+(w-1-2*dx)*side:(w-1)*t)),y:Math.round(y+(axis==='lr'?(h-1)*t:dy+(h-1-2*dy)*side))});
  }
  return points;
}
export function samplePixels(pixels,width,height,rect,axis,options) {
  const radius=Math.floor(options.patch/2);
  return pointsFor(rect,axis,options.inset,options.depth||0).map(p=>{
    let sums=[0,0,0], n=0;
    for(let y=Math.max(rect.y,p.y-radius);y<=Math.min(rect.y+rect.h-1,p.y+radius);y++) for(let x=Math.max(rect.x,p.x-radius);x<=Math.min(rect.x+rect.w-1,p.x+radius);x++){
      const i=(y*width+x)*4;const alpha=pixels[i+3]/255;
      for(let k=0;k<3;k++)sums[k]+=pixels[i+k]*alpha;n++;
    }
    const rgb=sums.map(v=>v/n);return {...p,raw:rgb,color:constrain(rgb,options)};
  });
}
export function fitRect(sw,sh,w,h) {
  const scale=Math.min(w/sw,h/sh);const rw=Math.min(w,Math.round(sw*scale)),rh=Math.min(h,Math.round(sh*scale));
  return {x:Math.floor((w-rw)/2),y:Math.floor((h-rh)/2),w:rw,h:rh};
}
// Each side uses six Gaussian-weighted OKLab samples. Two sides blend across
// the canvas. Positive normalized weights keep L/C within their constraints.
export function colorField(samples,sourceRect,targetRect,W,H,axis,spread) {
  const maxEdge=640, scale=Math.min(1,maxEdge/Math.max(W,H));
  const w=Math.max(1,Math.round(W*scale)), h=Math.max(1,Math.round(H*scale));
  const output=new Uint8ClampedArray(w*h*4);
  const mapped=samples.map(p=>({...p,tx:(targetRect.x+(p.x-sourceRect.x)/Math.max(1,sourceRect.w-1)*targetRect.w)/W,ty:(targetRect.y+(p.y-sourceRect.y)/Math.max(1,sourceRect.h-1)*targetRect.h)/H}));
  const sx=axis==='lr'?.42:spread,sy=axis==='lr'?spread:.42;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let L=0,a=0,b=0,sum=0;
    for(const p of mapped){const dx=(x+.5)/w-p.tx,dy=(y+.5)/h-p.ty;const weight=Math.exp(-.5*(dx*dx/(sx*sx)+dy*dy/(sy*sy)));sum+=weight;L+=weight*p.color.lab[0];a+=weight*p.color.lab[1];b+=weight*p.color.lab[2];}
    const rgb=labToRgb([L/sum,a/sum,b/sum]);const i=(y*w+x)*4;
    for(let k=0;k<3;k++)output[i+k]=clamp(rgb[k],0,255);output[i+3]=255;
  }
  return {pixels:output,width:w,height:h};
}
// Conservative detection of near-black letterboxing. Overlay text is tolerated.
export function detectMedia(pixels,w,h) {
  const dark=(x,y)=>{const i=(y*w+x)*4;return Math.max(pixels[i],pixels[i+1],pixels[i+2])<34;};
  const isBar=(axis,pos)=>{let n=0,black=0;const len=axis==='x'?h:w;for(let j=Math.floor(len*.04);j<len*.96;j+=Math.max(1,Math.floor(len/250))){n++;if(dark(axis==='x'?pos:j,axis==='x'?j:pos))black++;}return black/n>.88;};
  const bounds=axis=>{const len=axis==='x'?w:h;let l=0,r=len-1;while(l<len*.42&&isBar(axis,l))l++;while(r>len*.58&&isBar(axis,r))r--;return [l,r];};
  const [l,r]=bounds('x'),[t,b]=bounds('y');
  const scoreX=(l+w-1-r)/w,scoreY=(t+h-1-b)/h;
  if(scoreX>.07&&scoreX<.72&&l>w*.015&&w-1-r>w*.015)return {x:l,y:0,w:r-l+1,h};
  if(scoreY>.07&&scoreY<.72&&t>h*.015&&h-1-b>h*.015)return {x:0,y:t,w,h:b-t+1};
  return null;
}
