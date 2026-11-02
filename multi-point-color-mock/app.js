import {clamp,hex,pointsFor,samplePixels,fitRect,colorField,detectMedia} from './engine.js';
const $=id=>document.getElementById(id);
const FIXED_OPTIONS=Object.freeze({spread:.24,lmin:.28,lmax:.50,cmax:.12,inset:.02,depth:2,patch:1});
let source=null, sourceData=null, imageName='football-demo', samples=[], view='result', rect=null, renderTimer, uploadEpoch=0, toastTimer;
const background=document.createElement('canvas'), result=document.createElement('canvas'), original=document.createElement('canvas');
const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const toast=message=>{$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);};
function options(){return FIXED_OPTIONS;}
function setRect(r){rect={...r};for(const [id,k] of [['rx','x'],['ry','y'],['rw','w'],['rh','h']])$(id).value=rect[k];}
function autoDetect(){const detected=detectMedia(sourceData.data,source.width,source.height);setRect(detected||{x:0,y:0,w:source.width,h:source.height});$('mode').value=detected?'replace':'expand';updateMode();return !!detected;}
function updateMode(){$('rectDetails').hidden=$('mode').value!=='replace';$('modeHint').textContent=$('mode').value==='replace'?'按媒体边界取色，填充黑边并保留文字图标。识别不准时可校准边界。':'原图完整居中。若上传页面截图，请先裁掉页面外的标注画布。';}
async function loadImage(url,name,isDemo=false){
  const epoch=++uploadEpoch;
  try{
    const img=new Image();img.src=url;await img.decode();if(epoch!==uploadEpoch)return;
    if(img.naturalWidth*img.naturalHeight>36000000)throw new Error('图片过大，请使用 3600 万像素以内的图片。');
    const c=make(img.naturalWidth,img.naturalHeight),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);source=c;sourceData=ctx.getImageData(0,0,c.width,c.height);imageName=name.replace(/\.[^.]+$/,'');
    $('fileName').textContent=name;$('fileSize').textContent=`${c.width} × ${c.height}`;
    const detected=autoDetect();
    if(isDemo){setRect({x:295,y:0,w:731,h:939});$('mode').value='replace';updateMode();}
    render();if(!isDemo)toast(detected?'已识别黑边，自动生成完成':'图片已加载，自动生成完成');
  }catch(e){toast(e.message||'无法读取图片，请使用 PNG、JPG 或 WebP。');$('renderStatus').textContent=source?'保留上一张图片':'图片加载失败，请上传图片';}
  finally{if(url.startsWith('blob:'))URL.revokeObjectURL(url);}
}
function loadFile(file){if(!file)return;if(!file.type.startsWith('image/'))return toast('请上传图片文件。');if(file.type==='image/svg+xml')return toast('请将 SVG 导出为 PNG 后上传。');if(file.size>40*1024*1024)return toast('图片超过 40 MB，请压缩后上传。');loadImage(URL.createObjectURL(file),file.name);}
function readSize(){const W=Math.round(+$('width').value),H=Math.round(+$('height').value);if(!Number.isFinite(W)||!Number.isFinite(H)||W<64||H<64||W>4096||H>4096||W*H>8400000){toast('尺寸需为 64–4096 px，且总像素不超过 840 万。');return null;}return [W,H];}
function getAxis(r){return r.h>=r.w?'lr':'tb';}
let lastMeta=null;
function render(){
  if(!source)return;const size=readSize();if(!size)return;
  const [W,H]=size,opts=options(),replace=$('mode').value==='replace';
  const sourceRect=replace?rect:{x:0,y:0,w:source.width,h:source.height};
  const axis=getAxis(sourceRect),fit=fitRect(replace?source.width:sourceRect.w,replace?source.height:sourceRect.h,W,H);
  const targetRect=replace?{x:fit.x+sourceRect.x/source.width*fit.w,y:fit.y+sourceRect.y/source.height*fit.h,w:sourceRect.w/source.width*fit.w,h:sourceRect.h/source.height*fit.h}:fit;
  samples=samplePixels(sourceData.data,source.width,source.height,sourceRect,axis,opts);
  const field=colorField(samples,sourceRect,targetRect,W,H,axis,opts.spread);
  const fieldCanvas=make(field.width,field.height);fieldCanvas.getContext('2d').putImageData(new ImageData(field.pixels,field.width,field.height),0,0);
  for(const c of [background,result,original]){c.width=W;c.height=H;}
  const bg=background.getContext('2d');bg.imageSmoothingEnabled=true;bg.imageSmoothingQuality='high';bg.drawImage(fieldCanvas,0,0,W,H);
  const oc=original.getContext('2d',{willReadFrequently:true});oc.fillStyle='#000';oc.fillRect(0,0,W,H);oc.imageSmoothingQuality='high';
  if(replace)oc.drawImage(source,fit.x,fit.y,fit.w,fit.h);else oc.drawImage(source,sourceRect.x,sourceRect.y,sourceRect.w,sourceRect.h,fit.x,fit.y,fit.w,fit.h);
  const rc=result.getContext('2d');rc.imageSmoothingQuality='high';rc.drawImage(background,0,0);
  if(replace){
    const overlay=oc.getImageData(0,0,W,H),dest=bg.getImageData(0,0,W,H),p=overlay.data,b=dest.data;
    const x0=Math.round(targetRect.x),x1=Math.round(targetRect.x+targetRect.w),y0=Math.round(targetRect.y),y1=Math.round(targetRect.y+targetRect.h);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4;
      if(x>=x0&&x<x1&&y>=y0&&y<y1){b[i]=p[i];b[i+1]=p[i+1];b[i+2]=p[i+2];}
      else {const alpha=Math.max(p[i],p[i+1],p[i+2])/255;for(let k=0;k<3;k++)b[i+k]=p[i+k]+b[i+k]*(1-alpha);}
    }rc.putImageData(dest,0,0);
  } else rc.drawImage(source,sourceRect.x,sourceRect.y,sourceRect.w,sourceRect.h,fit.x,fit.y,fit.w,fit.h);
  lastMeta={version:'1.1-fixed-preset',image:imageName,output:{width:W,height:H},mode:replace?'replace-black-bars':'contain',axis,sourceRect,targetRect,options:opts,backgroundGrid:{width:field.width,height:field.height},algorithm:'12 edge samples; OKLCH L/C clamp; hue-preserving chroma gamut reduction; normalized Gaussian OKLab color field; unchanged foreground',referenceLimits:'Numerical constraints and Shader are not supplied in the reference. Parameters are fixed to the user-approved preset, not claimed original values.',samples:samples.map(p=>({id:p.id,x:p.x,y:p.y,rawHex:hex(p.raw),outputHex:hex(p.color.rgb),rawRgb:p.raw,oklch:{L:p.color.L,C:p.color.C,h:p.color.h}}))};
  $('dimensions').textContent=`${W} × ${H} PX`;$('renderStatus').textContent='已生成 · 12 个取色点';
  $('samplingHint').textContent=(axis==='lr'?'左侧 1–6 · 右侧 7–12':'上缘 1–6 · 下缘 7–12')+' · 上：原始色，下：约束后';
  document.querySelectorAll('[data-size]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.size===`${W},${H}`));
  updatePalette();drawPreview();
}
function drawPreview(){if(!lastMeta)return;const c=$('preview');c.width=result.width;c.height=result.height;const ctx=c.getContext('2d');ctx.drawImage(view==='background'?background:view==='original'?original:result,0,0);
  if($('showPoints').checked&&view!=='background'){
    const r=lastMeta.sourceRect,t=lastMeta.targetRect,scale=Math.max(c.width,c.height)/940,rad=9.5*scale;
    for(const p of samples){let x=t.x+(p.x-r.x)/Math.max(1,r.w-1)*(t.w-1),y=t.y+(p.y-r.y)/Math.max(1,r.h-1)*(t.h-1);
      x=clamp(x,rad+2,c.width-rad-2);y=clamp(y,rad+2,c.height-rad-2);
      ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fillStyle='#dbff57';ctx.fill();ctx.strokeStyle='#1c34296b';ctx.lineWidth=scale;ctx.stroke();ctx.fillStyle='#1e3325';ctx.font=`600 ${11*scale}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.id,x,y+.5*scale);
    }
  }
  $('showPoints').disabled=view==='background';
}
function updatePalette(){const el=$('palette');el.replaceChildren();for(const p of samples){const button=document.createElement('button');button.className='swatch';const value=hex(p.color.rgb);button.title=`取色点 ${p.id} · (${p.x}, ${p.y})\n原始 ${hex(p.raw)} → 输出 ${value}\nL ${p.color.L.toFixed(3)} · C ${p.color.C.toFixed(3)}\n点击复制颜色`;
    const num=document.createElement('span');num.className='swatch-num';num.textContent=String(p.id).padStart(2,'0');const colors=document.createElement('span');colors.className='swatch-colors';for(const color of [hex(p.raw),value]){const s=document.createElement('span');s.style.backgroundColor=color;colors.append(s);}const label=document.createElement('span');label.className='swatch-hex';label.textContent=value;button.append(num,colors,label);button.onclick=async()=>{try{await navigator.clipboard.writeText(value);toast(`取色点 ${p.id}：${value} 已复制`);}catch{toast(`取色点 ${p.id}：${value}`);}};el.append(button);}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function exportPng(){if(!lastMeta)return toast('请先上传图片。');if(!readSize())return;clearTimeout(renderTimer);render();const c=background;c.toBlob(blob=>{if(!blob)return toast('导出失败，请重试。');download(blob,`${imageName}-background-${c.width}x${c.height}.png`);toast(`已导出 ${c.width} × ${c.height} 纯背景 PNG`);},'image/png');}
function schedule(){clearTimeout(renderTimer);renderTimer=setTimeout(render,75);}
$('file').onchange=e=>{loadFile(e.target.files[0]);e.target.value='';};
$('dropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click();}};
for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('drag');});
for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('drag');if(event==='drop')loadFile(e.dataTransfer.files[0]);});
window.addEventListener('paste',e=>{const file=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();loadFile(file);}});
$('demoBtn').onclick=()=>loadImage('demo.png','football-demo.png',true);
$('mode').onchange=()=>{updateMode();if($('mode').value==='replace'&&rect.w===source.width&&rect.h===source.height){const found=detectMedia(sourceData.data,source.width,source.height);if(found)setRect(found);else{$('rectDetails').open=true;toast('未检测到黑边，请在“校准媒体边界”中填写媒体区域。');}}schedule();};
$('detectBtn').onclick=()=>{if(!source)return;const detected=autoDetect();toast(detected?'已重新识别媒体边界':'未检测到明显黑边，已使用完整图片。');schedule();};
for(const id of ['rx','ry','rw','rh'])$(id).onchange=()=>{if(!source)return;const x=clamp(Math.round(+$('rx').value)||0,0,source.width-1),y=clamp(Math.round(+$('ry').value)||0,0,source.height-1);setRect({x,y,w:clamp(Math.round(+$('rw').value)||1,1,source.width-x),h:clamp(Math.round(+$('rh').value)||1,1,source.height-y)});schedule();};
for(const id of ['width','height'])$(id).onchange=schedule;
document.querySelectorAll('[data-size]').forEach(btn=>btn.onclick=()=>{const [w,h]=btn.dataset.size.split(',');$('width').value=w;$('height').value=h;schedule();});
document.querySelectorAll('[data-view]').forEach(btn=>btn.onclick=()=>{view=btn.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',b===btn?'true':'false');});drawPreview();});
$('showPoints').onchange=drawPreview;
$('exportTop').onclick=exportPng;
$('jsonBtn').onclick=()=>{if(!lastMeta)return;clearTimeout(renderTimer);render();download(new Blob([JSON.stringify(lastMeta,null,2)],{type:'application/json'}),`${imageName}-samples.json`);toast('已导出 12 个取色点与生成参数。');};
$('rulesBtn').onclick=()=>$('rules').showModal();$('closeRules').onclick=()=>$('rules').close();$('rules').onclick=e=>{if(e.target===$('rules'))$('rules').close();};
loadImage('demo.png','football-demo.png',true);
