import { Icon } from '../components/ui';
import { PartImage } from './PartImage';
import type { SheetView } from './types';

export function SheetList({items,showAll,resolveImage}:SheetView) {
  if(!items.length)return <div className="empty-state">Nenhuma peça desse tipo{showAll?'':' na sua coleção'}.</div>;
  return <>{items.map(({p,owned,disabled,why,current,rec,favorite})=><button key={p.id} type="button" className={`sh-item ${disabled?'disabled':''} ${current?'current':''} ${rec?'rec':''}`} data-part={p.id} data-disabled={disabled?'1':undefined} title={p.display}>
    <PartImage part={p} size="sh" resolveImage={resolveImage}/><span className="sh-txt"><b>{p.display}</b><small>{p.abbrev&&p.abbrev!==p.display?p.abbrev+' · ':''}{showAll?(owned?<><Icon name="check" size={11}/> na coleção{owned>1?` ×${owned}`:''}</>:<i className="sh-noown" title="Não está na sua coleção"><Icon name="backpack" size={11}/></i>):`×${owned} na coleção`}{p.banned&&<> · <em>banida</em></>}</small></span>
    {why?<span className="sh-why">{why}</span>:current?<span className="sh-why cur"><Icon name="check" size={12}/> atual</span>:rec?<span className="sh-why rec" title={rec.reason}><Icon name="sparkle" size={11}/> recomendada</span>:null}
    <i className={`sh-fav ${favorite?'on':''}`} data-fav={p.id} title="Favoritar"><Icon name="star" size={14}/></i>
  </button>)}</>;
}
export function SheetQuick({favorites,recent,recommendations,resolveImage}:SheetView) {
  return <>{recommendations.length>0&&<div className="sh-row rec"><small><Icon name="sparkle" size={11}/> Recomendadas para este Bey</small><div>{recommendations.map(r=><button type="button" key={r.p.id} className="rec-card" data-part={r.p.id} title={`${r.p.display} — ${r.reason}`}><PartImage part={r.p} size="chip" resolveImage={resolveImage}/><span className="rec-txt"><b>{r.p.display}</b><small>{r.reason}{r.tags.length?' · '+r.tags.join(' · '):''}</small></span><Icon name="sparkle" size={12}/></button>)}</div></div>}
    {[{items:favorites,label:'Favoritas',icon:'star',cls:'fav'},{items:recent,label:'Recentes',icon:'clock',cls:''}].filter(group=>group.items.length).map(group=><div key={group.label} className="sh-row"><small><Icon name={group.icon} size={11}/> {group.label}</small><div>{group.items.map(x=><button key={x.p.id} type="button" className={`sh-chip ${group.cls} ${x.disabled?'disabled':''}`} data-part={x.p.id} data-disabled={x.disabled?'1':undefined} title={`${x.p.display}${x.why?' — '+x.why:''}`}><PartImage part={x.p} size="chip" resolveImage={resolveImage}/><span>{x.p.abbrev||x.p.display}</span></button>)}</div></div>)}
  </>;
}
