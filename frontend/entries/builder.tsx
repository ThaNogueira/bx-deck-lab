import 'vite/modulepreload-polyfill';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Fragment, type ReactNode } from 'react';
import { BuilderLayout } from '../builder/BuilderLayout';
import { BeyCards } from '../builder/BeyCard';
import { PartPicker, PickerFilters } from '../builder/PartPicker';
import { SheetList, SheetQuick } from '../builder/PartSheet';
import { DeckAnalysis, Legality, ValidationList } from '../builder/DeckAnalysis';
import '../builder/types';

// React owns markup; app.js retains the battle-tested engine and interaction layer.
// Each region is an explicit DOM boundary, not an innerHTML wrapper.
const roots=new Map<string,Root>();
let revision=0;
function renderRegion(id:string,children:ReactNode) {
  let root=roots.get(id);
  if(!root){const element=document.getElementById(id);if(!element)throw new Error(`Missing Builder region: ${id}`);root=createRoot(element);roots.set(id,root);}
  // Legacy listeners attach after commit; fresh keyed children avoid duplicate handlers.
  flushSync(()=>root.render(<Fragment key={++revision}>{children}</Fragment>));
}
async function loadScript(src:string) {
  await new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=()=>reject(new Error(`Não foi possível carregar ${src}`));document.body.appendChild(s);});
}
async function boot() {
  renderRegion('view-builder',<BuilderLayout/>);
  window.BXBuilderUI={
    cards:data=>renderRegion('deckGrid',<BeyCards {...data}/>),
    picker:data=>renderRegion('pickerGrid',<PartPicker {...data}/>),
    filters:(kinds,current)=>renderRegion('pickerFilters',<PickerFilters kinds={kinds} current={current}/>),
    sheet:data=>{renderRegion('sheetList',<SheetList {...data}/>);renderRegion('sheetQuick',<SheetQuick {...data}/>);},
    analysis:(data,complete)=>renderRegion('deckAnalysis',<DeckAnalysis data={data} complete={complete}/>),
    validation:data=>{renderRegion('deckLegality',<Legality data={data}/>);renderRegion('validationList',<ValidationList data={data}/>);},
  };
  await loadScript('/app.js');
  await loadScript('/js/home.js');
}
boot().catch(error=>{
  console.error(error);
  renderRegion('view-builder',<div className="empty-state" role="alert">Não foi possível iniciar o Builder. <button className="btn primary" onClick={()=>location.reload()}>Tentar novamente</button></div>);
});
