import { useEffect, useRef, useState } from 'react';
import type { Part, ResolveImage } from './types';

const queue: (()=>Promise<void>)[]=[];
let running=0;
function pump(){while(running<6&&queue.length){running++;queue.shift()!().finally(()=>{running--;pump();});}}

export function PartImage({part,size,resolveImage}:{part:Part;size:string;resolveImage:ResolveImage}) {
  const [url,setUrl]=useState(part.image||'');
  const [failed,setFailed]=useState(false);
  const element=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let active=true;
    const load=()=>{queue.push(async()=>{if(!active)return;try{const value=await resolveImage(part.id);if(active&&value)setUrl(value);}catch{/* Keep the readable fallback. */}});pump();};
    let observer:IntersectionObserver|undefined;
    if(!part.image){
      if('IntersectionObserver' in window&&element.current){observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){observer?.disconnect();load();}},{rootMargin:'300px'});observer.observe(element.current);}
      else load();
    }
    return ()=>{active=false;observer?.disconnect();};
  },[part.id,part.image,resolveImage]);
  const fallback=part.abbrev||part.display.split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase();
  return <div ref={element} className={`part-art ${size}`} title={part.display}>
    {url&&!failed?<img src={url} alt={part.display} loading="lazy" onError={()=>setFailed(true)}/>:<span className="fallback">{fallback}</span>}
  </div>;
}
