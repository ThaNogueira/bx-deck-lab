const number=value=>Math.round(value).toLocaleString('pt-BR');
let nextChartId=0;
export function renderLaunchChart(container,values) {
  if(!values.length) {container.innerHTML='<p>Nenhum lançamento nesta sessão.</p>';return;}
  const width=Math.max(260,container.clientWidth||660),height=210,left=48,right=16,top=18,bottom=32;
  const max=Math.max(1000,Math.ceil(values.reduce((max,sp)=>Math.max(max,sp),0)/1000)*1000),w=width-left-right,h=height-top-bottom;
  const point=(sp,i)=>[left+(values.length===1?.5:i/(values.length-1))*w,top+h-(sp/max*h)];
  const points=values.map(point),r=values.length>150?1.5:values.length>50?2:3.5;
  const color=sp=>sp>=15000?'#ff686e':sp>=12000?'#ffb268':sp>=11000?'#b6ff70':'#83def2';
  const line=points.map(p=>p.join(',')).join(' ');
  const ticks=[0,.5,1].map(part=>{const y=top+h-part*h;return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="bp-chart-grid"/><text x="${left-9}" y="${y+4}" text-anchor="end">${number(max*part)}</text>`;}).join('');
  const indexes=[...new Set([0,Math.round((values.length-1)/2),values.length-1])];
  const fillId=container.dataset.fillId??=('bp-chart-fill-'+(++nextChartId));
  container.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução de ${values.length} lançamentos, de ${number(values[0])} a ${number(values.at(-1))} SP"><defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6ed6ed" stop-opacity=".17"/><stop offset="100%" stop-color="#6ed6ed" stop-opacity="0"/></linearGradient></defs>${ticks}<polygon points="${points[0][0]},${top+h} ${line} ${points.at(-1)[0]},${top+h}" fill="url(#${fillId})"/><polyline points="${line}" class="bp-chart-line"/>${points.map(([x,y],i)=>i%Math.max(1,Math.ceil(values.length/600)) && i!==values.length-1?'':`<circle cx="${x}" cy="${y}" r="${i===values.length-1?r+1.5:r}" fill="${color(values[i])}" class="bp-chart-point" data-index="${i}"><title>Lançamento ${i+1}: ${number(values[i])} SP</title></circle>`).join('')}${indexes.map(i=>`<text x="${points[i][0]}" y="${height-8}" text-anchor="middle">${i+1}</text>`).join('')}</svg><output class="bp-chart-reading"></output>`;
  container.querySelector('svg').onpointerover=container.querySelector('svg').onpointerdown=event=>{
    const index=event.target.dataset.index;
    if(index!==undefined) container.querySelector('output').textContent=`Lançamento ${Number(index)+1} · ${number(values[index])} SP`;
  };
}
