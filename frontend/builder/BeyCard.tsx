import { Icon } from '../components/ui';
import { PartImage } from './PartImage';
import type { Analysis, CardsView, ResolveImage, SlotView } from './types';

function Score({label,value}:{label:string;value:number}) {
  return <div className="score-row"><span>{label}</span><div><i style={{width:`${Math.round(Math.min(10,Math.max(0,value))*10)}%`}}/></div><b>{value.toFixed(1)}</b></div>;
}
function BeyAnalysis({analysis:a}:{analysis:Analysis|null}) {
  if(!a) return <div className="bey-analysis empty"><span>Analisador</span><p>Complete o Bey para receber uma avaliação de função e sinergia.</p></div>;
  return <div className="bey-analysis"><div className="analysis-mini-head"><span>Analisador</span><b>{a.type}</b></div><p>{a.sentence}</p><div className="score-list"><Score label="ATK" value={a.atk}/><Score label="DEF" value={a.def}/><Score label="STA" value={a.sta}/></div><details><summary>Por quê?</summary><p><strong>Bit:</strong> {a.bitNote}</p><p><strong>Ratchet:</strong> {a.ratchetNote}</p>{a.assistNote&&<p><strong>CX:</strong> {a.assistNote}</p>}</details></div>;
}
function BeyCard({slot:s,modes,resolveImage}:{slot:SlotView;modes:CardsView['modes'];resolveImage:ResolveImage}) {
  const i=s.index;
  return <article className={`bey-card v2 ${s.invalid.length?'invalid':''} ${s.complete&&!s.invalid.length?'complete':''}`} data-deck-slot={i}>
    <div className="bey-head"><div className="slot-number"><b><i>{i+1}</i></b> Bey {i+1} <small className="bey-progress">{s.filled}/{s.total}</small></div><div className="bey-head-actions">
      <button type="button" className="move-slot" data-slot={i} data-dir="-1" disabled={i===0} title="Mover para a esquerda"><Icon name="back" size={13}/></button>
      <button type="button" className="move-slot" data-slot={i} data-dir="1" disabled={i===2} title="Mover para a direita"><Icon name="back" size={13}/></button>
      <button type="button" className="dup-slot" data-slot={i} title={`Copiar só a estrutura (${modes[s.mode]}) para um Bey vazio`}><Icon name="grid" size={13}/></button>
      <button type="button" className="clear-slot" data-slot={i} title="Limpar este Bey"><Icon name="trash" size={14}/></button>
    </div></div>
    <div className="bey-structure"><label>Estrutura</label><select data-slot={i} data-field="mode" defaultValue={s.mode} aria-label={`Estrutura do Bey ${i+1}`}>{Object.entries(modes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{s.expand&&<span className="bey-badge">Expand</span>}</div>
    <div className="stage" data-mode={s.mode} data-over={s.fields.some(x=>x.field==='over')?'1':'0'}><div className="stage-glow"/>{s.fields.map(f=><div key={f.field} className={`slot sl-${f.field} ${f.part?'filled':'empty'} ${f.problems.length?'bad':''} ${f.targeted?'targeted':''}`} role="button" tabIndex={0} data-bey={i} data-field={f.field} data-kind={f.kind} aria-label={`${f.label}: ${f.part?.display||'vazio'}`} title={f.part?`${f.part.display} — ${f.label}${f.problems.length?' · '+f.problems.join(', '):''}`:`Escolher ${f.label}`}>
      <span className="slot-ring">{f.part?<PartImage part={f.part} size="slot" resolveImage={resolveImage}/>:<span className="slot-plus"><Icon name="plus" size={18}/></span>}</span><span className="slot-lab">{f.label}</span><span className="slot-name">{f.part?.display||(f.targeted?'aguardando…':'escolher')}</span>
      {f.part&&<button type="button" className="slot-x" tabIndex={-1} title={`Remover ${f.part.display}`} aria-label="Remover"><Icon name="x" size={11}/></button>}<span className="slot-tip" aria-hidden="true"/>
    </div>)}</div>
    <div className="bey-summary"><strong>{s.name}</strong><small>{s.complete?<><Icon name={s.invalid.length?'warn':'check'} size={14}/>{s.invalid[0]||'Montagem válida'}</>:`Toque num slot para escolher a peça (${s.filled}/${s.total})`}</small></div>
    {s.tip&&<div className="bit-inline-note"><b>{s.tip.label}</b><span>{s.tip.note}</span></div>}<BeyAnalysis analysis={s.analysis}/>
  </article>;
}
export function BeyCards(data:CardsView) { return <>{data.slots.map(slot=><BeyCard key={slot.index} slot={slot} modes={data.modes} resolveImage={data.resolveImage}/>)}</>; }
