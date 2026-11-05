import {imageAsset,loadChampionFonts} from './champion-renderer.mjs?v=photo-editor-4';
const cyan='#37e7ff',white='#effaff',muted='#8faebb';
function text(c,s,x,y,size=24,color=white,width=930,align='left',font='ChampionBlock'){
  c.save();c.fillStyle=color;c.textAlign=align;let n=size;do{c.font=`${n}px ${font}`;if(c.measureText(String(s)).width<=width)break;n--;}while(n>12);if(n>=28){c.shadowColor='#047cdf';c.shadowBlur=10*c.canvas.width/1000;c.strokeStyle='#020815';c.lineWidth=2;c.strokeText(String(s),x,y);}c.fillText(String(s),x,y);c.restore();
}
function line(c,x,y,w,color='#1a4c69'){c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y);c.stroke();}
function panel(c,x,y,w,h){c.save();c.fillStyle='#04101df2';c.strokeStyle='#258db1';c.lineWidth=1;c.shadowColor='#007aff';c.shadowBlur=15*c.canvas.width/1000;c.shadowOffsetY=4*c.canvas.width/1000;c.beginPath();c.roundRect(x,y,w,h,18);c.fill();c.stroke();c.restore();}
async function picture(c,url,x,y,size,round=false){
  let img;try{img=await imageAsset(url);}catch{img=await imageAsset('/assets/profiles/default-blader.png');}
  c.save();if(round){c.beginPath();c.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);c.clip();const scale=Math.max(size/img.width,size/img.height);c.drawImage(img,x+(size-img.width*scale)/2,y+(size-img.height*scale)/2,img.width*scale,img.height*scale);}else c.drawImage(img,x,y,size,size);c.restore();
}
function ring(c,wr,x,y,r=72){
  c.lineWidth=10;c.strokeStyle='#193143';c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();if(wr!==null){c.strokeStyle=cyan;c.lineCap='round';c.beginPath();c.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.PI*2*wr/100);c.stroke();c.lineCap='butt';}
  const small=r<50;text(c,wr===null?'—':wr+'%',x,y+(small?3:10),small?21:34,white,r*1.7,'center');text(c,'WIN RATE',x,y+(small?19:34),small?8:12,muted,r*1.7,'center');
}
function metric(c,value,label,x,y,w=200){text(c,value,x,y,46,white,w);text(c,label.toUpperCase(),x,y+28,13,muted,w);}
async function background(c){
  c.drawImage(await imageAsset('/assets/ranking/background-v2.png'),0,0,1000,1000);
  c.fillStyle='#02081448';c.fillRect(0,0,1000,1000);line(c,52,880,896,cyan);
}
async function branding(c,index,total){
  const fade=c.createLinearGradient(0,870,0,1000);fade.addColorStop(0,'#020713b0');fade.addColorStop(1,'#020713f5');c.fillStyle=fade;c.fillRect(0,880,1000,120);line(c,52,880,896,'#258ba8');
  await picture(c,'/assets/champion/beystyle.png',52,893,89);text(c,'BEYSTYLE',158,932,25,white,360);text(c,'BEYXLAB.COM.BR · ENTRE NA ARENA',158,960,11,muted,490);
  text(c,'PARCEIRA',790,919,11,muted,140,'right');await picture(c,'/assets/champion/tamer.png',820,894,80);text(c,`${String(index+1).padStart(2,'0')}/${String(total).padStart(2,'0')}`,948,954,16,cyan,90,'right');
}
async function cover(c,data,index,total){
  c.drawImage(await imageAsset(`/assets/ranking/intro-${data.month?'month':'current'}-v2.png`),0,0,1000,1000);
  const shade=c.createLinearGradient(0,0,620,0);shade.addColorStop(0,'#010817c0');shade.addColorStop(1,'#01081700');c.fillStyle=shade;c.fillRect(0,0,650,880);
  await picture(c,'/assets/champion/beystyle.png',52,48,112);text(c,'BEYSTYLE',183,105,28,white,350);text(c,'APRESENTA',184,132,12,cyan);
  text(c,data.month?'DESTAQUES DO MÊS':'RANKING ATUAL',52,242,20,cyan,450);
  const edition=data.month?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',month:'long',year:'numeric'}).format(new Date(data.month+'-15T12:00:00Z')):'CLASSIFICAÇÃO GERAL';text(c,edition.toUpperCase(),52,275,14,muted,440);
  text(c,data.month?'OS NOMES':'QUEM DOMINA',52,381,data.month?87:74,white,455,'left','ChampionWide');text(c,data.month?'DO MÊS':'A ARENA?',52,472,100,cyan,450,'left','ChampionWide');
  text(c,'Conheça os jogadores em destaque,',52,535,17,white,410);text(c,'seus elos e os números da disputa.',52,565,17,white,410);
  const fade=c.createLinearGradient(0,720,0,880);fade.addColorStop(0,'#02071300');fade.addColorStop(1,'#020713fa');c.fillStyle=fade;c.fillRect(0,720,1000,160);
  text(c,'Arraste para conhecer os bladers!',52,817,26,white,710);
  c.save();c.strokeStyle=cyan;c.shadowColor='#00baff';c.shadowBlur=15*c.canvas.width/1000;c.lineWidth=5;c.lineJoin='miter';for(let i=0;i<4;i++){const x=805+i*34;c.globalAlpha=.4+i*.2;c.beginPath();c.moveTo(x,786);c.lineTo(x+18,804);c.lineTo(x,822);c.stroke();}c.restore();
  await branding(c,index,total);
}
export function pagesFor(data,count=12){
  const players=data.players.slice(0,count),pages=players.length?[{type:'cover',players:[]},...players.slice(0,3).map(p=>({type:'podium',players:[p]}))]:[];
  for(let i=3;i<players.length;i+=5)pages.push({type:'list',players:players.slice(i,i+5)});
  if(players.length)pages.push({type:'insights',players});return pages;
}
export async function renderRankingSlide(canvas,data,page,index,total,{size=2160}={}){
  canvas.width=canvas.height=size;const c=canvas.getContext('2d');c.scale(size/1000,size/1000);if(page.type==='cover'){await cover(c,data,index,total);return canvas;}await background(c);
  const monthly=!!data.month,date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(data.generatedAt));
  const edition=monthly?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',month:'long',year:'numeric'}).format(new Date(data.month+'-15T12:00:00Z')):'Atualizado em '+date;
  text(c,'BEYXLAB  /  ARENA COMPETITIVA',52,57,15,cyan);text(c,edition.toUpperCase(),948,57,13,muted,400,'right');
  text(c,monthly?'DESTAQUES DO MÊS':'RANKING DA ARENA',52,125,57,white,890,'left','ChampionWide');
  text(c,monthly?'Pontos do circuito no mês · elos atuais':'Classificação geral por elo · torneios concluídos',52,158,15,muted);
  if(page.type==='podium'){
    const p=page.players[0],rank=p.rating.provisional?'Em classificação':p.rating.tier?.name||'Sem elo';
    text(c,String(p.position).padStart(2,'0'),948,332,160,'#13344d',240,'right','ChampionWide');
    await picture(c,`/api/admin/ranking-art/avatar/${encodeURIComponent(p.user.id)}`,76,222,224,true);
    c.strokeStyle=p.position===1?'#f7d06b':cyan;c.lineWidth=3;c.beginPath();c.arc(188,334,120,0,Math.PI*2);c.stroke();
    text(c,p.position===1?(monthly?'LÍDER DO MÊS':'1º DO SITE'):p.position+'º LUGAR',344,254,18,p.position===1?'#f7d06b':cyan);
    text(c,p.user.name,344,315,43,white,590);text(c,'@'+p.user.slug,344,350,16,muted,590);
    if(p.rating.tier?.icon&&!p.rating.provisional)await picture(c,p.rating.tier.icon,344,377,48);
    text(c,rank,404,408,23,p.rating.tier?.color||cyan,520);text(c,p.rating.points+' PDL'+(p.rating.provisional?' · provisório':''),404,438,16,muted,520);
    panel(c,52,505,896,174);metric(c,p.wins,'vitórias',82,570,170);metric(c,p.losses,'derrotas',280,570,170);metric(c,p.events,monthly?'torneios no mês':'torneios',475,570,210);ring(c,p.winRate,824,591,59);
    panel(c,52,703,896,125);metric(c,p.gold,'ouro',82,759,175);metric(c,p.silver,'prata',296,759,175);metric(c,p.bronze,'bronze',510,759,175);metric(c,p.gold+p.silver+p.bronze,'pódios',725,759,175);
  }else if(page.type==='list'){
    text(c,'A DISPUTA CONTINUA',52,217,28,cyan);
    for(const [i,p] of page.players.entries()){
      const y=247+i*117;panel(c,52,y,896,102);text(c,String(p.position).padStart(2,'0'),72,y+61,31,muted,55);await picture(c,`/api/admin/ranking-art/avatar/${encodeURIComponent(p.user.id)}`,137,y+18,64,true);
      text(c,p.user.name,221,y+36,23,white,410);text(c,p.rating.provisional?'Em classificação':p.rating.tier?.name||'Sem elo',221,y+63,14,p.rating.tier?.color||muted,410);text(c,`${p.wins}V · ${p.losses}D · ${p.events} torneios`,221,y+85,12,muted,410);
      text(c,monthly?p.circuitPoints:p.rating.points,704,y+49,29,white,150,'center');text(c,monthly?'CIRCUITO':'PDL',704,y+72,11,muted,150,'center');ring(c,p.winRate,864,y+51,34);
    }
  }else{
    text(c,'OS NÚMEROS DA ARENA',52,222,32,cyan);
    panel(c,52,254,896,138);metric(c,data.totals.players,'jogadores',82,317,235);metric(c,data.totals.tournaments,'torneios',377,317,235);metric(c,data.totals.matches,'partidas',672,317,235);
    const best=(key)=>[...page.players].sort((a,b)=>b[key]-a[key]||a.position-b.position)[0];
    const eligible=page.players.filter(p=>p.wins+p.losses>=10),wr=[...eligible].sort((a,b)=>b.winRate-a.winRate||b.wins-a.wins)[0];
    const highlights=[['MAIS VITÓRIAS',best('wins'),p=>`${p.wins} vitórias`],['MAIS PÓDIOS',[...page.players].sort((a,b)=>(b.gold+b.silver+b.bronze)-(a.gold+a.silver+a.bronze)||a.position-b.position)[0],p=>`${p.gold+p.silver+p.bronze} pódios`],['MELHOR WIN RATE',wr,p=>`${p.winRate}% · ${p.wins+p.losses} partidas`]];
    for(const [i,[label,p,value]] of highlights.entries()){
      const y=418+i*129;panel(c,52,y,896,111);if(p)await picture(c,`/api/admin/ranking-art/avatar/${encodeURIComponent(p.user.id)}`,77,y+20,70,true);
      text(c,label,174,y+32,13,cyan);text(c,p?p.user.name:'Amostra ainda insuficiente',174,y+66,24,white,450);text(c,p?value(p):'Mínimo de 10 partidas',917,y+65,21,muted,290,'right');
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
export async function mountRankingArt(root){
  await loadChampionFonts();let data=null,pages=[],index=0,busy=false,revision=0;
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
  root.innerHTML=`<section class="ranking-art"><div class="panel-card ranking-art-controls"><p class="eyebrow">CARROSSEL PARA INSTAGRAM</p><h2>Ranking da arena</h2><label>Conteúdo<select id="rankArtMode"><option value="current">Ranking atual · elo</option><option value="month">Destaques do mês · circuito</option></select></label><label id="rankArtMonthLabel" hidden>Mês<input type="month" id="rankArtMonth" value="${month}"></label><label>Jogadores<select id="rankArtCount"><option>12</option><option>9</option><option>20</option></select></label><button class="btn primary" id="rankArtGenerate">Atualizar dados e gerar</button><p id="rankArtStatus" role="status">Gere uma prévia com os dados atuais.</p><button class="btn secondary" id="rankArtDownload" disabled>Baixar esta página</button><button class="btn secondary" id="rankArtZip" disabled>Baixar carrossel · ZIP</button></div><div class="ranking-art-view"><canvas id="rankArtCanvas" aria-label="Prévia da página do carrossel"></canvas><nav aria-label="Páginas do carrossel"><button class="btn secondary" id="rankArtPrev" disabled>←</button><span id="rankArtPage">0 / 0</span><button class="btn secondary" id="rankArtNext" disabled>→</button></nav></div></section>`;
  const el=id=>root.querySelector('#'+id),canvas=el('rankArtCanvas'),alive=()=>root.contains(canvas)&&canvas.isConnected;
  const status=s=>{if(alive())el('rankArtStatus').textContent=s;};
  function controls(){if(!alive())return;for(const id of ['rankArtGenerate','rankArtMode','rankArtCount','rankArtMonth'])el(id).disabled=busy;for(const id of ['rankArtDownload','rankArtZip'])el(id).disabled=busy||!pages.length;el('rankArtPrev').disabled=busy||index===0;el('rankArtNext').disabled=busy||index>=pages.length-1;el('rankArtPage').textContent=pages.length?`${index+1} / ${pages.length}`:'0 / 0';}
  async function preview(){const token=++revision,frame=document.createElement('canvas');await renderRankingSlide(frame,data,pages[index],index,pages.length,{size:1080});if(!alive()||token!==revision)return;canvas.width=canvas.height=1080;canvas.getContext('2d').drawImage(frame,0,0);controls();}
  async function action(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){status(e.message);}finally{busy=false;controls();}}
  const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  const png=async(i)=>{const c=document.createElement('canvas');await renderRankingSlide(c,data,pages[i],i,pages.length);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Falha ao exportar imagem.')),'image/png'));};
  const invalidate=()=>{revision++;data=null;pages=[];index=0;canvas.width=canvas.height=0;status('Atualize os dados para gerar este carrossel.');controls();};
  el('rankArtMode').onchange=()=>{el('rankArtMonthLabel').hidden=el('rankArtMode').value!=='month';invalidate();};el('rankArtMonth').onchange=invalidate;el('rankArtCount').onchange=invalidate;
  el('rankArtGenerate').onclick=()=>action(async()=>{status('Buscando classificação…');const query=el('rankArtMode').value==='month'?`?month=${encodeURIComponent(el('rankArtMonth').value)}`:'';const result=await BX.api('/api/admin/ranking-art/data'+query);if(!alive())return;data=result;pages=pagesFor(data,Number(el('rankArtCount').value));index=0;if(!pages.length){canvas.width=canvas.height=0;status('Nenhum resultado para este período.');return;}await preview();status(`${pages.length} páginas prontas · dados de torneios concluídos.`);});
  for(const [id,delta] of [['rankArtPrev',-1],['rankArtNext',1]])el(id).onclick=()=>action(async()=>{index+=delta;await preview();});
  el('rankArtDownload').onclick=()=>action(async()=>download(await png(index),`beyxlab-ranking-${data.month||data.generatedAt.slice(0,10)}-${String(index+1).padStart(2,'0')}.png`));
  el('rankArtZip').onclick=()=>action(async()=>{const files=[];for(let i=0;i<pages.length;i++){status(`Exportando ${i+1} de ${pages.length}…`);const b=await png(i);files.push({name:`beyxlab-ranking-${String(i+1).padStart(2,'0')}.png`,bytes:new Uint8Array(await b.arrayBuffer())});await new Promise(r=>setTimeout(r,0));}download(zipImages(files),`beyxlab-ranking-${data.month||data.generatedAt.slice(0,10)}.zip`);status('Carrossel baixado em 2160 × 2160.');});
}
