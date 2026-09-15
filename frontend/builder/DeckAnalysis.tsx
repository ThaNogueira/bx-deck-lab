import { Icon } from '../components/ui';
import type { DeckAnalysis as AnalysisData, Validation } from './types';
export function DeckAnalysis({data:a,complete}:{data:AnalysisData;complete:number}) {
  return <><div className="deck-analysis-head"><div><p className="eyebrow">ANALISADOR DO DECK</p><h2>{a.title}</h2></div><span>{complete}/3 completos</span></div><p className="deck-analysis-text">{a.text}</p>{a.atk!==undefined&&<div className="deck-score-grid">{[['Ataque',a.atk],['Defesa',a.def],['Stamina',a.sta]].map(([label,value])=>{const score=Number(value)||0;return <div className="score-row" key={label}><span>{label}</span><div><i style={{width:`${Math.round(Math.min(10,Math.max(0,score))*10)}%`}}/></div><b>{score.toFixed(1)}</b></div>;})}</div>}{!!a.special?.length&&<div className="analysis-warnings">{a.special.map(x=><p key={x}>• {x}</p>)}</div>}<small className="heuristic-note">Avaliação heurística: serve como guia de construção; peso, molde, desgaste, estádio e técnica de lançamento podem alterar bastante o resultado real.</small></>;
}
export function Legality({data:v}:{data:Validation}) {
  return v.legal?<><Icon name="check" size={13}/> Deck legal</>:v.errors.length?<><Icon name="x" size={13}/> Deck ilegal</>:<>{v.complete}/3 Beys prontos</>;
}
export function ValidationList({data:v}:{data:Validation}) {
  return <>{v.errors.map((x,i)=><div className="validation-item err" key={`err-${i}`}><i>×</i><span>{x}</span></div>)}{v.info.map((x,i)=><div className="validation-item" key={`info-${i}`}><i>•</i><span>{x}</span></div>)}{v.legal?<div className="validation-item"><i><Icon name="check" size={14}/></i><span>Três Beys completos e sem repetições proibidas.</span></div>:!v.errors.length&&!v.info.length?<div className="validation-item"><i><Icon name="check" size={14}/></i><span>Nenhum problema detectado.</span></div>:null}</>;
}
