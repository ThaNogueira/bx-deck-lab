const compact=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const FIXED={sharkscale:'SSC',scaleshark:'SSC',suppresssuperion:'SPS',supresssuperion:'SPS',superionsuppress:'SPS',narrow:'NR',needle:'N'};
export function partAbbreviation(part){
  if(!part)return '?';
  for(const name of [part.name,part.display,part.displayName]){const key=compact(name);if(FIXED[key])return FIXED[key];}
  if(part.kind==='RATCHET')return (part.name||part.display||'').match(/\d+-\d+/)?.[0]||part.abbrev||part.name;
  if(part.abbrev)return part.abbrev;
  const words=String(part.name||part.display||'?').replace(/([a-z])([A-Z])/g,'$1 $2').match(/[A-Za-z0-9]+/g)||['?'];
  return words.map(word=>word[0]).join('').toUpperCase();
}
const orderedParts=(ids,byId)=>{
  const parts=ids.map(id=>byId.get(id)).filter(Boolean);
  const order=['LOCK_CHIP','BLADE','MAIN_BLADE','ASSIST_BLADE','OVER_BLADE','RATCHET','BIT'];
  return [...parts].sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
};
export function comboLabel(ids,byId){const parts=orderedParts(ids,byId),label=p=>partAbbreviation(p.parentId?{...byId.get(p.parentId),id:p.id}:p),lock=parts.find(p=>p.kind==='LOCK_CHIP'),main=parts.find(p=>p.kind==='MAIN_BLADE');return lock&&main?[label(lock)+label(main),...parts.filter(p=>p!==lock&&p!==main).map(label)].join(' '):parts.map(label).join(' ');}
export function layoutChampionParts(ids,byId,row){
  const parts=orderedParts(ids,byId),top=[317,502,677][row];
  if(parts.length<=3){const sizes=parts.map(p=>['BLADE','MAIN_BLADE'].includes(p.kind)?110:p.kind==='RATCHET'?90:80),gap=parts.length===2?36:20;let x=230-(sizes.reduce((sum,n)=>sum+n,0)+gap*(parts.length-1))/2;return parts.map((p,i)=>{const size=sizes[i],rect={id:p.id,x,y:top+70-size/2,w:size,h:size};x+=size+gap;return rect;});}
  const main=parts.find(p=>p.kind==='MAIN_BLADE'),lock=parts.find(p=>p.kind==='LOCK_CHIP'),assist=parts.find(p=>p.kind==='ASSIST_BLADE');
  const upper=[lock,main,assist].filter(Boolean),lower=parts.filter(p=>!upper.includes(p));
  const output=upper.map((p,i)=>{const size=p===main?80:58;return {id:p.id,x:[100,230,360][i]-size/2,y:top+48-size/2,w:size,h:size};});
  lower.forEach((p,i)=>{const centers=lower.length===2?[165,295]:lower.length===1?[230]:[100,230,360];output.push({id:p.id,x:centers[i]-24,y:top+113-24,w:48,h:48});});return output;
}
const cache=new Map();
export async function imageAsset(url){
  if(!cache.has(url))cache.set(url,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{cache.delete(url);reject(Error('Imagem indisponível.'));};image.src=url;}));
  return cache.get(url);
}
export async function loadChampionFonts(){
  await Promise.all([['ChampionBlock','RussoOne-Regular.ttf'],['ChampionWide','BarlowCondensed-BlackItalic.ttf']].map(async([name,file])=>{const face=new FontFace(name,`url(/assets/champion/${file})`);document.fonts.add(await face.load());}));
}
function contain(ctx,image,x,y,w,h){const scale=Math.min(w/image.width,h/image.height),iw=image.width*scale,ih=image.height*scale;ctx.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);}
function fitText(ctx,text,x,y,width,size,family,color,align='center',centerY=false){
  ctx.textAlign=align;ctx.fillStyle=color;let font=size;do{ctx.font=`${font}px ${family}`;if(ctx.measureText(text).width<=width)break;font-=1;}while(font>10);
  const metrics=ctx.measureText(text);ctx.fillText(text,centerY?x+(metrics.actualBoundingBoxLeft-metrics.actualBoundingBoxRight)/2:x,centerY?y+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2:y);
}
export function cropPortrait(image){
  const canvas=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  let left=canvas.width,top=canvas.height,right=0,bottom=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>12){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(left>right||top>bottom)throw Error('Não foi possível encontrar a pessoa na foto.');
  const crop=document.createElement('canvas');crop.width=right-left+1;crop.height=bottom-top+1;crop.getContext('2d').drawImage(canvas,left,top,crop.width,crop.height,0,0,crop.width,crop.height);return crop;
}
export async function alreadyTransparent(blob){
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,128,128);bitmap.close();const data=ctx.getImageData(0,0,128,128).data;let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<200)transparent++;return transparent>128*128*.02;
}
export const portraitLimits={zoom:[.3,2.5],offsetX:[-600,600],offsetY:[-600,600]};
export function portraitBounds(state){
  if(!state.portrait)return null;
  const p=state.portrait,scale=Math.min(560/p.width,790/p.height)*(state.zoom||1),w=p.width*scale,h=p.height*scale;
  return {x:725-w/2+(state.offsetX||0),y:850-h+(state.offsetY||0),w,h};
}
const foregroundCache=new WeakMap(),appearanceCache=new WeakMap();
function polygon(ctx,points,scale=1){ctx.moveTo(points[0][0]*scale,points[0][1]*scale);for(const [x,y] of points.slice(1))ctx.lineTo(x*scale,y*scale);ctx.closePath();}
function foreground(template){
  if(foregroundCache.has(template))return foregroundCache.get(template);
  const c=document.createElement('canvas');c.width=template.width;c.height=template.height;const ctx=c.getContext('2d',{willReadFrequently:true});
  // Trace the actual eight-sided frames and the nameplate in the original 1254px template.
  ctx.save();ctx.beginPath();const s=template.width/1254;
  for(const points of [
    [[67,397],[549,397],[567,417],[567,579],[527,619],[38,619],[21,602],[21,436]],
    [[39,629],[549,629],[567,647],[567,805],[528,837],[39,837],[20,819],[20,666]],
    [[39,848],[548,848],[567,866],[567,1009],[528,1053],[39,1053],[20,1034],[20,885]],
    [[224,313],[674,265],[638,343],[193,387]],
  ])polygon(ctx,points,s);
  ctx.rect(0,1066*s,c.width,c.height-1066*s);ctx.clip();ctx.drawImage(template,0,0);ctx.restore();
  // Preserve the white/cyan lettering and crown by their pixels, rather than a rectangular crop.
  const header=document.createElement('canvas');header.width=c.width;header.height=c.height;const h=header.getContext('2d',{willReadFrequently:true});h.drawImage(template,0,0);
  const pixels=h.getImageData(0,0,c.width,Math.ceil(355*s)),d=pixels.data;
  for(let y=0;y<pixels.height;y++)for(let x=0;x<c.width;x++){
    const i=(y*c.width+x)*4,nx=x/s,ny=y/s,logo=nx<350&&ny<132,crown=nx>640&&nx<770&&ny<98,title=nx<760&&ny>75&&ny<355-nx*.12;
    const light=Math.min(d[i+1],d[i+2]),letter=(d[i]>125&&light>145)||(d[i+1]>d[i]*1.4&&light>150);
    d[i+3]=(logo||crown||title)&&letter?Math.min(255,Math.max(0,(light-135)*6)):0;
  }
  h.clearRect(0,0,c.width,c.height);h.putImageData(pixels,0,0);ctx.drawImage(header,0,0);
  foregroundCache.set(template,c);return c;
}
export async function portraitHit(state,x,y){
  const r=portraitBounds(state);if(!r||x<r.x||x>r.x+r.w||y<r.y||y>r.y+r.h||y>=850)return false;
  const layer=foreground(await imageAsset('/assets/champion/template.png')),f=layer.getContext('2d',{willReadFrequently:true});
  if(f.getImageData(Math.floor(x/1000*layer.width),Math.floor(y/1000*layer.height),1,1).data[3]>80)return false;
  const px=Math.min(state.portrait.width-1,Math.max(0,Math.floor((x-r.x)/r.w*state.portrait.width))),py=Math.min(state.portrait.height-1,Math.max(0,Math.floor((y-r.y)/r.h*state.portrait.height)));
  return state.portrait.getContext('2d',{willReadFrequently:true}).getImageData(px,py,1,1).data[3]>24;
}
function portraitAppearance(portrait,state,exporting){
  const saturation=state.saturation??1.4,glow=state.glow??.75,shadow=state.shadow??.3,quality=exporting?'export':'preview',signature=[saturation,glow,shadow].join(':');
  let entries=appearanceCache.get(portrait);if(!entries){entries={};appearanceCache.set(portrait,entries);}if(entries[quality]?.signature===signature)return entries[quality];
  const scale=Math.min(1,(exporting?2400:1000)/Math.max(portrait.width,portrait.height)),w=Math.round(portrait.width*scale),h=Math.round(portrait.height*scale),unit=Math.max(w/560,h/790),pad=Math.ceil(90*unit);
  const layer=document.createElement('canvas');layer.width=w+pad*2;layer.height=h+pad*2;const ctx=layer.getContext('2d'),nativeFilters='filter' in ctx;ctx.imageSmoothingQuality='high';
  const mask=document.createElement('canvas');mask.width=w;mask.height=h;const m=mask.getContext('2d');m.drawImage(portrait,0,0,w,h);m.globalCompositeOperation='source-in';
  const effect=(color,alpha,blur,dx=0,dy=0)=>{m.fillStyle=color;m.fillRect(0,0,w,h);ctx.globalAlpha=alpha;if(nativeFilters){ctx.filter=`blur(${blur*unit}px)`;ctx.drawImage(mask,pad+dx*unit,pad+dy*unit);}else{ctx.shadowColor=color;ctx.shadowBlur=blur*unit;ctx.shadowOffsetX=dx*unit;ctx.shadowOffsetY=dy*unit;ctx.drawImage(mask,pad,pad);ctx.shadowBlur=ctx.shadowOffsetX=ctx.shadowOffsetY=0;}};
  if(shadow>0){effect('#000',Math.min(.7,shadow*.55),18,-6,11);effect('#000',Math.min(.3,shadow*.24),5,0,5);}
  if(glow>0){ctx.globalCompositeOperation='screen';effect('#008dff',Math.min(.85,glow*.6),22);effect('#21d7ff',Math.min(.65,glow*.4),4);}
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  if(nativeFilters){ctx.filter=`saturate(${saturation}) contrast(1.07) brightness(1.01)`;ctx.drawImage(portrait,pad,pad,w,h);ctx.filter='none';}
  else{
    // Older Safari canvases have no filter property; apply the same color matrix once per cached layer.
    const colored=document.createElement('canvas');colored.width=w;colored.height=h;const c=colored.getContext('2d',{willReadFrequently:true});c.drawImage(portrait,0,0,w,h);const image=c.getImageData(0,0,w,h),d=image.data;
    for(let i=0;i<d.length;i+=4){const lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];for(let channel=0;channel<3;channel++)d[i+channel]=((lum+(d[i+channel]-lum)*saturation-127.5)*1.07+127.5)*1.01;}
    c.putImageData(image,0,0);ctx.drawImage(colored,pad,pad);
  }
  return entries[quality]={signature,layer,pad,w,h};
}
export function championPhotoLayer(state){return state.portrait?portraitAppearance(state.portrait,state,false):null;}
export async function renderChampion(canvas,state,byId,{size=2160,foregroundOnly=false}={}){
  const [template,bs,tamer]=await Promise.all(['template.png','beystyle.png','tamer.png'].map(file=>imageAsset('/assets/champion/'+file)));
  if(canvas.width!==size)canvas.width=size;if(canvas.height!==size)canvas.height=size;const ctx=canvas.getContext('2d');ctx.setTransform(size/1000,0,0,size/1000,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.textBaseline='alphabetic';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(foregroundOnly)ctx.clearRect(0,0,1000,1000);else ctx.drawImage(template,0,0,1000,1000);
  if(state.portrait&&!foregroundOnly){
    const r=portraitBounds(state),a=portraitAppearance(state.portrait,state,size>1080);
    ctx.save();ctx.beginPath();ctx.rect(0,0,1000,850);ctx.clip();ctx.drawImage(a.layer,r.x-a.pad/a.w*r.w,r.y-a.pad/a.h*r.h,a.layer.width/a.w*r.w,a.layer.height/a.h*r.h);ctx.restore();
  }
  if(state.portrait||foregroundOnly)ctx.drawImage(foreground(template),0,0,1000,1000);
  const missing=[];
  for(let row=0;row<3;row++){
    const ids=state.beys?.[row]||[],layout=layoutChampionParts(ids,byId,row);
    for(const rect of layout){const part=byId.get(rect.id);try{contain(ctx,await imageAsset(`/api/admin/champion/parts/${encodeURIComponent(rect.id)}/image`),rect.x,rect.y,rect.w,rect.h);}catch{missing.push(part?.display||part?.name||rect.id);ctx.strokeStyle='#18dcff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(rect.x+rect.w/2,rect.y+rect.h/2,rect.w*.42,0,Math.PI*2);ctx.stroke();fitText(ctx,partAbbreviation(part),rect.x+rect.w/2,rect.y+rect.h*.55,rect.w*.8,20,'ChampionBlock','#c1edff');}}
    fitText(ctx,comboLabel(ids,byId),230,[477,662,837][row],370,ids.length>3?28:34,'ChampionBlock','#fff');
  }
  // Match both axes of the cyan parallelogram: rising baseline and slanted sides.
  // Rotation followed by skew counteracted the italic slant, so use one affine transform.
  ctx.save();ctx.translate(344.7,260.8);ctx.transform(1,-46/447.5,-33.5/76,1,0,0);ctx.textBaseline='alphabetic';fitText(ctx,(state.name||'').toUpperCase(),0,0,310,51,'ChampionBlock','#02070a','center',true);ctx.restore();
  contain(ctx,bs,19,861,129,120);contain(ctx,tamer,205,859,147,122);ctx.strokeStyle='#0757e9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(175,875);ctx.lineTo(175,972);ctx.stroke();
  fitText(ctx,(state.eventName||'').toUpperCase(),983,909,395,52,'ChampionWide','#fff','right');
  const date=state.eventDate?.split('-'),label=date?.length===3?`${date[2]}/${date[1]}`:'';fitText(ctx,label,983,972,240,56,'ChampionWide','#fff','right');
  return {missing:[...new Set(missing)]};
}
