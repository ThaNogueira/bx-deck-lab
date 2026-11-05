import {imageAsset,loadChampionFonts} from './champion-renderer.mjs?v=photo-editor-4';
const cyan='#37e7ff',white='#effaff',muted='#8faebb';
function text(c,s,x,y,size=24,color=white,width=930,align='left',font='ChampionBlock',centerY=false){
  c.save();c.fillStyle=color===cyan?(c.artTheme?.accent||cyan):color;c.textAlign=align;let n=size;do{c.font=`${n}px ${font}`;if(c.measureText(String(s)).width<=width)break;n--;}while(n>12);if(centerY){const m=c.measureText(String(s));y+=(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;if(align==='center')x+=(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2;}if(n>=28){c.shadowColor='#00000099';c.shadowBlur=2*c.canvas.width/1000;c.shadowOffsetY=2*c.canvas.width/1000;}c.fillText(String(s),x,y);c.restore();
}
function line(c,x,y,w,color='#1a4c69'){c.strokeStyle=c.artTheme?.monthly?c.artTheme.accent:color;c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y);c.stroke();}
function panel(c,x,y,w,h,tone=null){c.save();c.fillStyle=tone?.fill||(c.artTheme?.monthly?'#18070df2':'#04101df2');c.strokeStyle=tone?.border||(c.artTheme?.monthly?'#a83951':'#258db1');c.lineWidth=1;c.shadowColor='#00000080';c.shadowBlur=9*c.canvas.width/1000;c.shadowOffsetY=5*c.canvas.width/1000;c.beginPath();c.roundRect(x,y,w,h,18);c.fill();c.stroke();c.restore();}
async function picture(c,url,x,y,size,round=false){
  let img;try{img=await imageAsset(url);}catch{img=await imageAsset('/assets/profiles/default-blader.png');}
  c.save();if(round){c.beginPath();c.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);c.clip();const scale=Math.max(size/img.width,size/img.height);c.drawImage(img,x+(size-img.width*scale)/2,y+(size-img.height*scale)/2,img.width*scale,img.height*scale);}else c.drawImage(img,x,y,size,size);c.restore();
}
function ring(c,wr,x,y,r=72){
  c.lineWidth=r<50?6:10;c.strokeStyle=c.artTheme?.monthly?'#47202b':'#193143';c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();if(wr!==null){c.strokeStyle=c.artTheme?.accent||cyan;c.lineCap='round';c.beginPath();c.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.PI*2*wr/100);c.stroke();c.lineCap='butt';}
  const numberSize=Math.round(Math.max(15,Math.min(28,r*.5))),labelSize=Math.round(Math.max(8,Math.min(11,r*.18)));
  text(c,wr===null?'—':wr+'%',x,y-r*.14,numberSize,white,r*1.64,'center','ChampionBlock',true);
  text(c,'WIN RATE',x,y+r*.3,labelSize,muted,r*1.64,'center','ChampionBlock',true);
}
function metric(c,value,label,x,y,w=212,h=120,tone=null){panel(c,x,y,w,h,tone);text(c,value,x+w/2,y+h*.4,50,tone?.ink||white,w-28,'center','ChampionBlock',true);text(c,label.toUpperCase(),x+w/2,y+h*.77,15,tone?.ink||muted,w-24,'center','ChampionBlock',true);}
export const CHIBIS=['witch-wave','witch-cheer','witch-point','blue-wave','blue-cheer','blue-point','blond-wave','blond-cheer','blond-point','red-wave','red-cheer','red-point','cat-wave','cat-cheer','cat-point'];
async function chibi(c,n,x,y,w,h=w){
  const selected=c.artTheme?.chibiIndex??n;let img;try{img=await imageAsset(`/assets/ranking/chibis-v3/${CHIBIS[((selected%15)+15)%15]}.png`);}catch{return;}
  const scale=Math.min(w/img.width,h/img.height),iw=img.width*scale,ih=img.height*scale;c.save();c.shadowColor='#000000a6';c.shadowBlur=10*c.canvas.width/1000;c.shadowOffsetX=1*c.canvas.width/1000;c.shadowOffsetY=5*c.canvas.width/1000;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);c.restore();
}
async function bey(c,p,x,y,size){
  if(!p.bey)return false;let img;try{img=await imageAsset(`/api/admin/champion/parts/${encodeURIComponent(p.bey.id)}/image`);}catch{return false;}
  const scale=Math.min(size/img.width,size/img.height);c.save();c.shadowColor=c.artTheme?.glow||'#008dff';c.shadowBlur=8*c.canvas.width/1000;c.drawImage(img,x+(size-img.width*scale)/2,y+(size-img.height*scale)/2,img.width*scale,img.height*scale);c.restore();return true;
}
async function background(c){
  c.drawImage(await imageAsset(c.artTheme.monthly?'/assets/ranking/background-month-red-v3.png':'/assets/ranking/background-v2.png'),0,0,1000,1000);
  c.fillStyle='#02081448';c.fillRect(0,0,1000,1000);line(c,52,880,896,cyan);
}
async function branding(c,index,total){
  const fade=c.createLinearGradient(0,870,0,1000);fade.addColorStop(0,'#020713b0');fade.addColorStop(1,'#020713f5');c.fillStyle=fade;c.fillRect(0,880,1000,120);line(c,52,880,896,'#258ba8');
  await picture(c,'/assets/champion/beystyle.png',52,893,89);text(c,'BEYSTYLE',158,932,25,white,360);text(c,'BEYXLAB.COM.BR · ENTRE NA ARENA',158,960,11,muted,490);
  text(c,'PARCEIRA',790,919,11,muted,140,'right');await picture(c,'/assets/champion/tamer.png',820,894,80);text(c,`${String(index+1).padStart(2,'0')}/${String(total).padStart(2,'0')}`,948,954,16,cyan,90,'right');
}
async function cover(c,data,index,total){
  c.drawImage(await imageAsset(data.month?'/assets/ranking/intro-month-red-v3.png':'/assets/ranking/intro-current-v2.png'),0,0,1000,1000);
  const shade=c.createLinearGradient(0,0,620,0);shade.addColorStop(0,'#010817c0');shade.addColorStop(1,'#01081700');c.fillStyle=shade;c.fillRect(0,0,650,880);
  await picture(c,'/assets/champion/beystyle.png',52,48,112);text(c,'BEYSTYLE',183,105,28,white,350);text(c,'APRESENTA',184,132,12,cyan);
  text(c,data.month?'DESTAQUES DO MÊS':'RANKING ATUAL',52,242,20,cyan,450);
  const edition=data.month?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',month:'long',year:'numeric'}).format(new Date(data.month+'-15T12:00:00Z')):'CLASSIFICAÇÃO GERAL';text(c,edition.toUpperCase(),52,275,14,muted,440);
  text(c,data.month?'BLADERS':'QUEM DOMINA',52,375,data.month?90:74,white,455,'left','ChampionWide');text(c,data.month?'DO MÊS':'A ARENA?',52,463,95,cyan,450,'left','ChampionWide');
  if(data.month){const monthName=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',month:'long'}).format(new Date(data.month+'-15T12:00:00Z'));text(c,monthName.toUpperCase(),52,550,68,white,460,'left','ChampionWide');text(c,data.month.slice(0,4),52,584,20,cyan);}
  else{text(c,'REPORTE GERAL SEMANAL',52,522,26,cyan,450,'left','ChampionWide');text(c,'Os elos e os números da disputa.',52,563,17,white,410);}
  await chibi(c,data.month?12:3,66,643,120,130);
  const fade=c.createLinearGradient(0,720,0,880);fade.addColorStop(0,'#02071300');fade.addColorStop(1,'#020713fa');c.fillStyle=fade;c.fillRect(0,720,1000,160);
  text(c,'Arraste para conhecer os bladers!',52,817,26,white,710);
  c.save();c.strokeStyle=c.artTheme.accent;c.shadowColor=c.artTheme.glow;c.shadowBlur=15*c.canvas.width/1000;c.lineWidth=5;c.lineJoin='miter';for(let i=0;i<4;i++){const x=805+i*34;c.globalAlpha=.4+i*.2;c.beginPath();c.moveTo(x,786);c.lineTo(x+18,804);c.lineTo(x,822);c.stroke();}c.restore();
  await branding(c,index,total);
}
export function pagesFor(data,count=12){
  const players=data.players.slice(0,count),pages=players.length?[{type:'cover',players:[]},...players.slice(0,3).map(p=>({type:'podium',players:[p]}))]:[];
  for(let i=3;i<players.length;i+=5)pages.push({type:'list',players:players.slice(i,i+5)});
  if(players.length)pages.push({type:'insights',players});
  const order=CHIBIS.map((_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  return pages.map((page,i)=>({...page,chibiIndex:order[i%order.length]}));
}
export async function renderRankingSlide(canvas,data,page,index,total,{size=2160}={}){
  canvas.width=canvas.height=size;const c=canvas.getContext('2d');c.artTheme={monthly:!!data.month,accent:data.month?'#ff758b':cyan,glow:data.month?'#ff2349':'#047cdf',chibiIndex:page.chibiIndex};c.scale(size/1000,size/1000);if(page.type==='cover'){await cover(c,data,index,total);return canvas;}await background(c);
  const monthly=!!data.month,date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(data.generatedAt));
  const edition=monthly?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',month:'long',year:'numeric'}).format(new Date(data.month+'-15T12:00:00Z')):'Atualizado em '+date;
  text(c,'BEYXLAB  /  ARENA COMPETITIVA',52,57,15,cyan);text(c,edition.toUpperCase(),948,57,13,muted,400,'right');
  text(c,monthly?'DESTAQUES DO MÊS':'RANKING DA ARENA',52,125,57,white,890,'left','ChampionWide');
  text(c,monthly?'Pontos do circuito no mês · elos atuais':'Classificação geral por elo · torneios concluídos',52,158,15,muted);
  if(page.type==='podium'){
    const p=page.players[0],rank=p.rating.provisional?'Em classificação':p.rating.tier?.name||'Sem elo';
    const medal=['#f7d06b','#dce9f4','#e8ac83'][p.position-1];
    await picture(c,`/assets/achievements/trophy-minimal${p.position===2?'-silver':p.position===3?'-bronze':''}.svg`,718,242,78);
    text(c,p.position+'º',872,282,132,medal,148,'center','ChampionWide',true);
    await chibi(c,index*3,835,335,108,105);
    await picture(c,`/api/admin/ranking-art/avatar/${encodeURIComponent(p.user.id)}`,62,216,186,true);
    c.strokeStyle=medal;c.lineWidth=3;c.beginPath();c.arc(155,309,99,0,Math.PI*2);c.stroke();
    text(c,p.position===1?(monthly?'LÍDER DO MÊS':'1º DO SITE'):p.position+'º LUGAR',278,237,17,medal);
    text(c,p.user.name,278,289,42,white,412);text(c,'@'+p.user.slug,278,320,16,muted,412);
    if(p.rating.tier?.icon&&!p.rating.provisional)await picture(c,p.rating.tier.icon,278,341,42);
    text(c,rank,331,364,22,p.rating.tier?.color||cyan,370);text(c,p.rating.points+' PDL'+(p.rating.provisional?' · provisório':''),331,395,17,muted,370);
    metric(c,p.wins,'vitórias',52,460,212,152,{fill:'#08291ff5',border:'#37ac7f',ink:'#a1f3cd'});
    metric(c,p.losses,'derrotas',280,460,212,152,{fill:'#30121bf5',border:'#bc526c',ink:'#ffb0be'});
    metric(c,p.events,monthly?'torneios no mês':'torneios',508,460,212,152);panel(c,736,460,212,152);ring(c,p.winRate,842,536,50);
    const medalY=642,medalH=p.bey?92:140;
    for(const [i,[value,label,color,fill,border,suffix]] of [[p.gold,'OURO','#f7d06b','#30240ef5','#ae873b',''],[p.silver,'PRATA','#dce9f4','#202a33f5','#8a9eae','-silver'],[p.bronze,'BRONZE','#e8ac83','#301e15f5','#ad704a','-bronze'],[p.gold+p.silver+p.bronze,'PÓDIOS',white,null,null,null]].entries()){
      const x=52+i*228;panel(c,x,medalY,212,medalH,fill?{fill,border}:null);
      if(suffix!==null)await picture(c,`/assets/achievements/trophy-minimal${suffix}.svg`,x+178,medalY+8,24);
      text(c,value,x+106,medalY+medalH*.38,34,color,160,'center','ChampionBlock',true);text(c,label,x+106,medalY+medalH*.76,13,i<3?color:muted,160,'center','ChampionBlock',true);
    }
    if(p.bey){panel(c,52,758,896,98);if(await bey(c,p,76,770,74)){text(c,p.bey.source==='used'?'BEY MAIS USADA':'BEY FAVORITA',176,787,13,cyan,710);text(c,p.bey.name,176,824,25,white,710);}}
  }else if(page.type==='list'){
    text(c,'A DISPUTA CONTINUA',52,217,28,cyan);
    await chibi(c,index+7,819,167,91,76);
    for(const [i,p] of page.players.entries()){
      const y=247+i*117;panel(c,52,y,896,102);text(c,String(p.position).padStart(2,'0'),72,y+61,31,muted,55);await picture(c,`/api/admin/ranking-art/avatar/${encodeURIComponent(p.user.id)}`,137,y+18,64,true);
      text(c,p.user.name,221,y+36,23,white,320);text(c,p.rating.provisional?'Em classificação':p.rating.tier?.name||'Sem elo',221,y+63,14,p.rating.tier?.color||muted,320);text(c,`${p.wins}V · ${p.losses}D · ${p.events} torneios`,221,y+85,12,muted,320);
      await bey(c,p,635,y+17,63);
      text(c,monthly?p.circuitPoints:p.rating.points,755,y+44,28,white,95,'center','ChampionBlock',true);text(c,monthly?'CIRCUITO':'PDL',755,y+74,10,muted,95,'center');ring(c,p.winRate,879,y+51,34);
    }
  }else{
    text(c,'OS NÚMEROS DA ARENA',52,222,32,cyan);
    await chibi(c,index+8,826,163,90,76);metric(c,data.totals.players,'jogadores',52,254,288,138);metric(c,data.totals.tournaments,'torneios',356,254,288,138);metric(c,data.totals.matches,'partidas',660,254,288,138);
    const best=(key)=>[...page.players].sort((a,b)=>b[key]-a[key]||a.position-b.position)[0];
    const eligible=page.players.filter(p=>p.wins+p.losses>=10),wr=[...eligible].sort((a,b)=>b.winRate-a.winRate||b.wins-a.wins)[0];
    const highlights=[['MAIS VITÓRIAS',best('wins'),p=>`${p.wins} vitórias`],['MAIS PÓDIOS',[...page.players].sort((a,b)=>(b.gold+b.silver+b.bronze)-(a.gold+a.silver+a.bronze)||a.position-b.position)[0],p=>`${p.gold+p.silver+p.bronze} pódios`],['MELHOR WIN RATE',wr,p=>`${p.winRate}% · ${p.wins+p.losses} partidas`]];
    for(const [i,[label,p,value]] of highlights.entries()){
      const y=418+i*129;panel(c,52,y,896,111);if(p)await picture(c,`/api/admin/ranking-art/avatar/${encodeURIComponent(p.user.id)}`,77,y+20,70,true);
      text(c,label,174,y+32,13,cyan);text(c,p?p.user.name:'Amostra ainda insuficiente',174,y+66,24,white,420);text(c,p?value(p):'Mínimo de 10 partidas',917,y+65,20,muted,290,'right');
    }
    text(c,`Destaques entre os ${page.players.length} jogadores exibidos · WR = vitórias ÷ (vitórias + derrotas)`,52,849,12,muted,896);
  }
  await branding(c,index,total);return canvas;
}
// Uncompressed ZIP: PNGs are already compressed. No upload or third-party service is needed.
export function zipImages(files){
  const enc=new TextEncoder(),chunks=[],central=[];let offset=0;
  const crc=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let b=0;b<8;b++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  const header=(n)=>{const a=new Uint8Array(n);return [a,new DataView(a.buffer)];};
  for(const file of files){const name=enc.encode(file.name),[h,v]=header(30),sum=crc(file.bytes);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,sum,true);v.setUint32(18,file.bytes.length,true);v.setUint32(22,file.bytes.length,true);v.setUint16(26,name.length,true);chunks.push(h,name,file.bytes);const [ch,cv]=header(46);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,sum,true);cv.setUint32(20,file.bytes.length,true);cv.setUint32(24,file.bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.push(ch,name);offset+=h.length+name.length+file.bytes.length;}
  const length=central.reduce((n,a)=>n+a.length,0),[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
}
export function rankingCaption(data,variant=0){
  if(!data?.players?.length)return '';
  const month=data.month?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',month:'long',year:'numeric'}).format(new Date(data.month+'-15T12:00:00Z')):null;
  const date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(data.generatedAt));
  const intro=month?`🔥 Bladers do mês — ${month}!`:["⚔️ Quem domina a arena? Reporte geral semanal!","🔥 A disputa pelo topo continua! Confira o ranking da arena.","🏆 Os bladers em destaque estão aqui! Reporte geral semanal."][variant%3];
  const podium=data.players.slice(0,3).map((p,i)=>`${['🥇','🥈','🥉'][i]} ${p.user.name}`).join('\n'),leader=data.players[0];
  const highlight=`Destaque do líder: ${leader.wins} vitória${leader.wins===1?'':'s'}${leader.winRate===null?'':` · ${leader.winRate}% de aproveitamento`}.`;
  return `${intro}\n${month?'Classificação do mês por pontos do circuito.':`Ranking geral por elo · atualizado em ${date}.`}\n\n${podium}\n\n${highlight}\n\n${['👉 Arraste para conhecer os bladers e os números da disputa.','👉 Deslize e confira quem está fazendo a diferença na arena.','👉 Arraste para ver o top 3 e os outros destaques!'][variant%3]}\nQuem você quer ver no topo? 👀\n\nRanking completo: https://beyxlab.com.br/ranking\nBeyStyle × BeyXLab | Parceira: Tamer Shop\n\n#BeybladeX #BeyStyle #BeyXLab #TamerShop`;
}
export async function mountRankingArt(root){
  await loadChampionFonts();let data=null,pages=[],index=0,busy=false,revision=0;
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
  root.innerHTML=`<section class="ranking-art"><div class="panel-card ranking-art-controls"><p class="eyebrow">CARROSSEL PARA INSTAGRAM</p><h2>Ranking da arena</h2><label>Conteúdo<select id="rankArtMode"><option value="current">Ranking atual · elo</option><option value="month">Destaques do mês · circuito</option></select></label><label id="rankArtMonthLabel" hidden>Mês<input type="month" id="rankArtMonth" value="${month}"></label><label>Jogadores<select id="rankArtCount"><option>12</option><option>9</option><option>20</option></select></label><button class="btn primary" id="rankArtGenerate">Atualizar dados e gerar</button><p id="rankArtStatus" role="status">Gere uma prévia com os dados atuais.</p><button class="btn secondary" id="rankArtDownload" disabled>Baixar esta página</button><button class="btn secondary" id="rankArtZip" disabled>Baixar carrossel · ZIP</button></div><div class="ranking-art-view"><canvas id="rankArtCanvas" aria-label="Prévia da página do carrossel"></canvas><nav aria-label="Páginas do carrossel"><button class="btn secondary" id="rankArtPrev" disabled>←</button><span id="rankArtPage">0 / 0</span><button class="btn secondary" id="rankArtNext" disabled>→</button></nav></div></section>`;
  const el=id=>root.querySelector('#'+id),canvas=el('rankArtCanvas'),alive=()=>root.contains(canvas)&&canvas.isConnected;
  root.querySelector('.ranking-art-view').insertAdjacentHTML('beforeend',`<section class="panel-card ranking-art-caption" id="rankArtCaptionBox" hidden><label for="rankArtCaption">Legenda do post</label><textarea id="rankArtCaption" rows="9" spellcheck="true"></textarea><div><button class="btn secondary" type="button" id="rankArtCaptionGenerate">Gerar outra legenda</button><button class="btn primary" type="button" id="rankArtCaptionCopy">Copiar legenda</button></div><small id="rankArtCaptionStatus" role="status"></small></section>`);
  let captionVariant=0;
  const caption=()=>{el('rankArtCaption').value=rankingCaption(data,captionVariant);el('rankArtCaptionStatus').textContent='Você pode editar antes de copiar.';};
  el('rankArtCaptionGenerate').onclick=()=>{captionVariant++;caption();};
  el('rankArtCaptionCopy').onclick=async()=>{try{await navigator.clipboard.writeText(el('rankArtCaption').value);el('rankArtCaptionStatus').textContent='Legenda copiada!';}catch{el('rankArtCaption').focus();el('rankArtCaption').select();el('rankArtCaptionStatus').textContent='Texto selecionado. Use a opção Copiar do seu dispositivo.';}};
  const status=s=>{if(alive())el('rankArtStatus').textContent=s;};
  function controls(){if(!alive())return;for(const id of ['rankArtGenerate','rankArtMode','rankArtCount','rankArtMonth'])el(id).disabled=busy;for(const id of ['rankArtDownload','rankArtZip'])el(id).disabled=busy||!pages.length;el('rankArtPrev').disabled=busy||index===0;el('rankArtNext').disabled=busy||index>=pages.length-1;el('rankArtPage').textContent=pages.length?`${index+1} / ${pages.length}`:'0 / 0';}
  async function preview(){const token=++revision,frame=document.createElement('canvas');await renderRankingSlide(frame,data,pages[index],index,pages.length,{size:1080});if(!alive()||token!==revision)return;canvas.width=canvas.height=1080;canvas.getContext('2d').drawImage(frame,0,0);controls();}
  async function action(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){status(e.message);}finally{busy=false;controls();}}
  const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  const png=async(i)=>{const c=document.createElement('canvas');await renderRankingSlide(c,data,pages[i],i,pages.length);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Falha ao exportar imagem.')),'image/png'));};
  const invalidate=()=>{revision++;data=null;pages=[];index=0;canvas.width=canvas.height=0;el('rankArtCaptionBox').hidden=true;el('rankArtCaption').value='';status('Atualize os dados para gerar este carrossel.');controls();};
  el('rankArtMode').onchange=()=>{el('rankArtMonthLabel').hidden=el('rankArtMode').value!=='month';invalidate();};el('rankArtMonth').onchange=invalidate;el('rankArtCount').onchange=invalidate;
  el('rankArtGenerate').onclick=()=>action(async()=>{status('Buscando classificação…');const query=el('rankArtMode').value==='month'?`?month=${encodeURIComponent(el('rankArtMonth').value)}`:'';const result=await BX.api('/api/admin/ranking-art/data'+query);if(!alive())return;data=result;pages=pagesFor(data,Number(el('rankArtCount').value));index=0;el('rankArtCaptionBox').hidden=!pages.length;if(!pages.length){el('rankArtCaption').value='';canvas.width=canvas.height=0;status('Nenhum resultado para este período.');return;}captionVariant=0;caption();await preview();status(`${pages.length} páginas prontas · dados de torneios concluídos.`);});
  for(const [id,delta] of [['rankArtPrev',-1],['rankArtNext',1]])el(id).onclick=()=>action(async()=>{index+=delta;await preview();});
  el('rankArtDownload').onclick=()=>action(async()=>download(await png(index),`beyxlab-ranking-${data.month||data.generatedAt.slice(0,10)}-${String(index+1).padStart(2,'0')}.png`));
  el('rankArtZip').onclick=()=>action(async()=>{const files=[];for(let i=0;i<pages.length;i++){status(`Exportando ${i+1} de ${pages.length}…`);const b=await png(i);files.push({name:`beyxlab-ranking-${String(i+1).padStart(2,'0')}.png`,bytes:new Uint8Array(await b.arrayBuffer())});await new Promise(r=>setTimeout(r,0));}download(zipImages(files),`beyxlab-ranking-${data.month||data.generatedAt.slice(0,10)}.zip`);status('Carrossel baixado em 2160 × 2160.');});
}
