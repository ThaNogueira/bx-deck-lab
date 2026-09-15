import { Icon } from '../components/ui';
import { PartImage } from './PartImage';
import type { PickerView } from './types';

export function PickerFilters({kinds,current}:{kinds:string[][];current:string}) {
  return <>{kinds.map(([key,label])=><button key={key} type="button" className={`picker-chip ${key===current?'active':''}`} data-kind={key}>{label}</button>)}<button type="button" className="picker-chip owned-toggle" data-owned="1" title="Mostrar só peças que eu tenho"><Icon name="check" size={14}/> Tenho</button></>;
}
export function PartPicker({items,resolveImage}:PickerView) {
  if(!items.length) return <div className="empty-state">Nenhuma peça com esses filtros.</div>;
  return <>{items.map(({part:p,owned,favorite,title})=><button key={p.id} type="button" className={`picker-tile ${owned?'owned':''} ${favorite?'fav':''}`} data-part={p.id} draggable title={title}>
    <PartImage part={p} size="tile" resolveImage={resolveImage}/><span className="picker-tile-name">{p.display}</span>
    {owned?<><i className="picker-owned"><Icon name="check" size={14}/>{owned>1?` ×${owned}`:''}</i><em className="picker-have">na coleção</em></>:<i className="picker-noown" title="Não está na sua coleção"><Icon name="backpack" size={11}/></i>}
    {p.banned&&<i className="picker-banned">!</i>}<i className={`tile-fav ${favorite?'on':''}`} data-fav={p.id} title={favorite?'Tirar das favoritas':'Favoritar'}><Icon name="star" size={12}/></i>
  </button>)}</>;
}
