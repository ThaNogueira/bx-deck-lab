import {levelColor} from './mission-rules.mjs';
import {formatDuration} from './session-stats.mjs';
const number=n=>Math.round(n??0).toLocaleString('pt-BR');
const date=value=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
function text(c,value,x,y,size,color='#e8f5fc',width=900,weight=600) {
  c.save();c.fillStyle=color;c.textAlign='left';let fontSize=size;
  do{c.font=`${weight} ${fontSize}px Inter, sans-serif`;if(c.measureText(String(value)).width<=width)break;fontSize--;}while(fontSize>12);
  c.fillText(String(value),x,y);c.restore();
}
function panel(c,x,y,w,h,fill='#122536',border='#315268') {
  c.fillStyle=fill;c.strokeStyle=border;c.lineWidth=1.5;c.beginPath();c.roundRect(x,y,w,h,20);c.fill();c.stroke();
}
async function avatar(url) {
  if(!url)return null;
  return new Promise(resolve=>{const image=new Image(),timer=setTimeout(()=>resolve(null),3000);image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);resolve(null);};image.src=url;});
}
export async function createSessionImage(data) {
  await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]);
  const photo=await avatar(data.user.avatarUrl),canvas=document.createElement('canvas');canvas.width=canvas.height=2160;
  const c=canvas.getContext('2d');c.scale(2,2);c.fillStyle='#08131f';c.fillRect(0,0,1080,1080);
  const glow=c.createRadialGradient(1020,0,0,1020,0,900);glow.addColorStop(0,'#154e70');glow.addColorStop(1,'#08131f00');c.fillStyle=glow;c.fillRect(0,0,1080,1080);
  c.strokeStyle='#3a8aac22';c.lineWidth=2;for(let i=0;i<5;i++){c.beginPath();c.moveTo(600+i*90,0);c.lineTo(1080,420-i*65);c.stroke();}
  text(c,'BX LAB / BATTLE PASS',48,46,18,'#6edcf4');text(c,data.stats.source==='history'?'HISTÓRICO DO BATTLE PASS':'SESSÃO DE TREINO',48,102,38);
  text(c,date(data.session.startedAt),48,138,19,'#9cb8cc');
  c.save();c.beginPath();c.arc(105,217,53,0,Math.PI*2);c.clip();
  if(photo){const size=Math.min(photo.naturalWidth,photo.naturalHeight);c.drawImage(photo,(photo.naturalWidth-size)/2,(photo.naturalHeight-size)/2,size,size,52,164,106,106);}
  else{c.fillStyle='#254055';c.fillRect(52,164,106,106);text(c,(data.user.name||'Blader').slice(0,1).toUpperCase(),84,235,46);}
  c.restore();c.strokeStyle=levelColor(data.user.level||1);c.lineWidth=4;c.beginPath();c.arc(105,217,56,0,Math.PI*2);c.stroke();
  text(c,data.user.name||'Blader',184,210,34,'#f0f8fc',665);text(c,'NÍVEL '+(data.user.level||1),184,245,20,levelColor(data.user.level||1));
  const delta=data.comparison.change,trend=delta==null?'Seu treino em números':`${delta>=0?'+':''}${delta.toFixed(1).replace('.',',')}% na média`;
  text(c,trend,48,314,25,delta==null?'#9bc4da':delta>=0?'#92dfaf':'#ff9da4',650);
  if(data.record?.isNew)text(c,'NOVO RECORDE',765,314,22,'#f8d580',270);
  const stats=[['MÁXIMO',number(data.stats.best),'SP'],['MÉDIA',number(data.stats.average),'SP'],['LANÇAMENTOS',number(data.stats.count),''],[data.session.durationExact?'DURAÇÃO':'TEMPO REGISTRADO',formatDuration(data.session.durationMs),'']];
  stats.forEach(([label,value,unit],i)=>{const x=48+i*250;panel(c,x,342,236,126);text(c,label,x+18,374,15,'#9bb9cc',204);text(c,value,x+18,427,38,'#edf7fc',unit?160:201);if(unit)text(c,unit,x+177,427,17,'#83d3e7');});
  text(c,'EVOLUÇÃO DOS LANÇAMENTOS',48,514,17,'#b2cbdc');
  const values=data.launches.map(r=>r.sp),max=values.reduce((best,sp)=>Math.max(best,sp),1000),left=104,top=548,w=884,h=192;
  c.font='14px Inter, sans-serif';c.textAlign='right';c.fillStyle='#87aabd';
  for(const part of [0,.5,1]){const y=top+h-part*h;c.fillText(number(max*part),left-12,y+5);c.strokeStyle='#2d4657';c.setLineDash([5,6]);c.beginPath();c.moveTo(left,y);c.lineTo(left+w,y);c.stroke();}c.setLineDash([]);
  if(values.length){c.strokeStyle='#69d5f0';c.lineWidth=4;c.lineJoin='round';c.beginPath();values.forEach((sp,i)=>{const x=left+(values.length===1?.5:i/(values.length-1))*w,y=top+h-sp/max*h;if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();
    const last=values.at(-1),x=values.length===1?left+w/2:left+w;c.fillStyle='#b9ef86';c.beginPath();c.arc(x,top+h-last/max*h,6,0,Math.PI*2);c.fill();}
  const p=data.progression,known=p?.tracked||p?.events?.length||p?.rewards?.length;
  const gains=[['XP NA SESSÃO',known?'+'+number(p.xp):'—'],['MISSÕES',known?number(p.missions):'—'],['NÍVEIS GANHOS',known?'+'+number(p.levels.length):'—']];
  panel(c,48,787,984,112);gains.forEach(([label,value],i)=>{const x=72+i*330;if(i){c.strokeStyle='#335064';c.beginPath();c.moveTo(x-20,810);c.lineTo(x-20,879);c.stroke();}text(c,label,x,822,15,'#9bb9cc',280);text(c,value,x,870,34,i===0?'#a8e7b8':'#e8f5fc',280);});
  const badges=p?.rewards??[];text(c,badges.length?badges.slice(0,2).map(r=>r.title).join(' · ')+(badges.length>2?` · +${badges.length-2}`:''):data.stats.source==='history'?'Histórico importado do Battle Pass':'Cada treino conta.',48,947,19,'#b2cbdc',980);
  if(data.comparison.sessionCount)text(c,data.comparison.sessionCount===1?'Comparado ao treino anterior':`Comparado aos últimos ${data.comparison.sessionCount} treinos`,48,984,16,'#85a3b7');
  text(c,'beyxlab.com.br',48,1040,20,'#6edcf4');
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Não foi possível gerar a imagem.')),'image/png'));canvas.width=canvas.height=0;return blob;
}

export async function shareSession(data) {
  let dialog=document.querySelector('#sessionShareDialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='sessionShareDialog';dialog.className='bp-session-share-dialog';dialog.innerHTML='<form method="dialog" class="bp-picker-head"><h2>Compartilhar treino</h2><button aria-label="Fechar compartilhamento">×</button></form><p role="status">Preparando imagem…</p><img alt="Resumo quadrado da sessão de treino" hidden><div class="bp-actions"><button class="btn primary" data-native-share hidden>Compartilhar</button><a class="btn" data-download hidden>Baixar PNG</a></div>';document.body.appendChild(dialog);}
  dialog.querySelector('p').textContent='Preparando imagem…';dialog.querySelector('p').hidden=false;dialog.querySelector('img').hidden=true;dialog.querySelector('[data-native-share]').hidden=true;dialog.querySelector('[data-download]').hidden=true;
  if(dialog.dataset.url)URL.revokeObjectURL(dialog.dataset.url);
  const token=dialog.token=Symbol();dialog.showModal();
  try{
    const blob=await createSessionImage(data);if(dialog.token!==token || !dialog.open)return;
    const url=URL.createObjectURL(blob);dialog.dataset.url=url;
    const file=new File([blob],`bxlab-treino-${new Date(data.session.startedAt).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})}.png`,{type:'image/png'});
    const img=dialog.querySelector('img');img.src=url;img.hidden=false;dialog.querySelector('p').hidden=true;
    const download=dialog.querySelector('[data-download]');download.href=url;download.download=file.name;download.hidden=false;
    const native=dialog.querySelector('[data-native-share]');native.hidden=!(navigator.share && navigator.canShare?.({files:[file]}));
    native.onclick=()=>navigator.share({files:[file],title:'Meu treino no BX Lab',text:'Meu resumo de treino no BX Lab.'}).catch(error=>{if(error.name!=='AbortError'){dialog.querySelector('p').hidden=false;dialog.querySelector('p').textContent='Use Baixar PNG para salvar a imagem.';}});
  }catch(error){if(dialog.token===token)dialog.querySelector('p').textContent=error.message;}
}
