(() => {
  const bands = [
    {min:0,label:'Iniciante',color:'#547d98'},
    {min:6000,label:'Aprendiz',color:'#6dc9df'},
    {min:11000,label:'Intermediário',color:'#a3e97b'},
    {min:15000,label:'Habilidoso',color:'#ef9a5b'},
    {min:20000,label:'Profissional',color:'#ff686e'},
  ];
  const tone = sp=>sp>=15000?'red':sp>=12000?'orange':sp>=11000?'green':'neutral';
  const level = sp=>bands.findLast(b=>sp>=b.min)??bands[0];
  const number = sp=>Math.round(sp||0).toLocaleString('pt-BR');
  const meter = sp=>{
    const current=level(sp), position=Math.min(100,Math.max(0,sp/25000*100));
    return `<div class="bp-power-scale"><div class="bp-power-meter" role="meter" aria-label="Nível de lançamento: ${current.label}" aria-valuemin="0" aria-valuemax="25000" aria-valuenow="${Math.min(25000,Math.max(0,sp))}" aria-valuetext="${number(sp)} SP, ${current.label}"><div class="bp-power-track">${bands.map((b,i)=>`<span style="flex:${(bands[i+1]?.min??25000)-b.min};background:${b.color}" title="${b.label}: ${number(b.min)} SP ou mais"></span>`).join('')}</div><i style="left:${position}%" title="Seu máximo: ${number(sp)} SP"></i></div><div class="bp-power-axis"><span>0 SP</span><span>25.000+ SP</span></div><div class="bp-power-levels">${bands.map(b=>`<span${b===current?' class="is-current"':''}>${b.label}</span>`).join('')}</div></div>`;
  };
  BX.shootPower = {tone,level,meter,bands};
})();
