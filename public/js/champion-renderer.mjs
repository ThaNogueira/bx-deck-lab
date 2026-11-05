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
  const metrics=ctx.measureText(text);ctx.fillText(text,x,centerY?y+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2:y);
}
export function cropPortrait(image){
  const canvas=document.createElement('canvas'),scale=Math.min(1,1800/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  let left=canvas.width,top=canvas.height,right=0,bottom=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>12){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(left>right||top>bottom)throw Error('Não foi possível encontrar a pessoa na foto.');
  const crop=document.createElement('canvas');crop.width=right-left+1;crop.height=bottom-top+1;crop.getContext('2d').drawImage(canvas,left,top,crop.width,crop.height,0,0,crop.width,crop.height);return crop;
}
export async function alreadyTransparent(blob){
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,128,128);bitmap.close();const data=ctx.getImageData(0,0,128,128).data;let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<200)transparent++;return transparent>128*128*.02;
}
export async function renderChampion(canvas,state,byId,{size=2160}={}){
  const [template,bs,tamer]=await Promise.all(['template.png','beystyle.png','tamer.png'].map(file=>imageAsset('/assets/champion/'+file)));
  canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');ctx.scale(size/1000,size/1000);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(template,0,0,1000,1000);
  if(state.portrait){
    const portrait=state.portrait,scale=Math.min(560/portrait.width,790/portrait.height)*(state.zoom||1),w=portrait.width*scale,h=portrait.height*scale,x=725-w/2+(state.offsetX||0),y=850-h+(state.offsetY||0);
    ctx.save();ctx.beginPath();ctx.rect(437,50,563,801);ctx.clip();ctx.shadowColor='#008dff';ctx.shadowBlur=16;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.drawImage(portrait,x,y,w,h);ctx.shadowBlur=7;ctx.shadowColor='#39e7ff';ctx.drawImage(portrait,x,y,w,h);ctx.shadowBlur=0;ctx.filter='saturate(1.18) contrast(1.06) brightness(1.025)';ctx.drawImage(portrait,x,y,w,h);ctx.restore();
  }
  const missing=[];
  for(let row=0;row<3;row++){
    const ids=state.beys?.[row]||[],layout=layoutChampionParts(ids,byId,row);
    for(const rect of layout){const part=byId.get(rect.id);try{contain(ctx,await imageAsset(`/api/admin/champion/parts/${encodeURIComponent(rect.id)}/image`),rect.x,rect.y,rect.w,rect.h);}catch{missing.push(part?.display||part?.name||rect.id);ctx.strokeStyle='#18dcff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(rect.x+rect.w/2,rect.y+rect.h/2,rect.w*.42,0,Math.PI*2);ctx.stroke();fitText(ctx,partAbbreviation(part),rect.x+rect.w/2,rect.y+rect.h*.55,rect.w*.8,20,'ChampionBlock','#c1edff');}}
    fitText(ctx,comboLabel(ids,byId),230,[477,662,837][row],370,ids.length>3?28:34,'ChampionBlock','#fff');
  }
  // Follow the cyan strip's rising edges, then center the actual letter shapes within it.
  ctx.save();ctx.translate(344,260);ctx.rotate(-Math.atan(48/450));ctx.transform(1,0,-.16,1,0,0);ctx.textBaseline='alphabetic';fitText(ctx,(state.name||'').toUpperCase(),0,0,310,51,'ChampionBlock','#02070a','center',true);ctx.restore();
  contain(ctx,bs,19,861,129,120);contain(ctx,tamer,205,859,147,122);ctx.strokeStyle='#0757e9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(175,875);ctx.lineTo(175,972);ctx.stroke();
  fitText(ctx,(state.eventName||'').toUpperCase(),983,909,395,52,'ChampionWide','#fff','right');
  const date=state.eventDate?.split('-'),label=date?.length===3?`${date[2]}/${date[1]}`:'';fitText(ctx,label,983,972,240,56,'ChampionWide','#fff','right');
  return {missing:[...new Set(missing)]};
}
