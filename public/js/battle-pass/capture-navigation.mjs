export function captureNavigation({active,onReturn}) {
  let frame,away=false;
  const home='/battle-pass';
  const host={get active(){return active();},get away(){return away;},navigate,restore};
  BX.captureHost=host;
  function restore({history=true}={}) {
    away=false;document.body.classList.remove('bp-capture-away');
    if(frame){frame.contentWindow.location.replace('about:blank');frame.hidden=true;}
    if(history)window.history.pushState({bpCapture:true},'',home);
    onReturn?.();window.dispatchEvent(new Event('bp-capture-view'));
  }
  function navigate(target,{history=true}={}) {
    const url=new URL(target,location.origin);
    if(url.origin!==location.origin)return false;
    if(url.pathname.replace(/\/$/,'')===home){restore({history});return true;}
    if(!frame){frame=document.createElement('iframe');frame.className='bp-capture-page';frame.title='BX Lab';
      frame.setAttribute('allow','fullscreen; camera; clipboard-write');document.body.appendChild(frame);
      frame.onload=()=>{try{if(away && frame.contentWindow.location.origin===location.origin){const path=frame.contentWindow.location.pathname+frame.contentWindow.location.search+frame.contentWindow.location.hash;if(frame.contentWindow.location.pathname.replace(/\/$/,'')===home){restore();return;}if(path!==location.pathname+location.search+location.hash)window.history.replaceState({bpCapture:true},'',path);}}catch{}};
    }
    away=true;frame.hidden=false;frame.contentWindow.location.replace(url.href);document.body.classList.add('bp-capture-away');
    if(history)window.history.pushState({bpCapture:true},'',url.pathname+url.search+url.hash);
    window.dispatchEvent(new Event('bp-capture-view'));return true;
  }
  document.addEventListener('click',event=>{
    if(!active() || away || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    const link=event.target.closest('a[href]');if(!link || link.target && link.target!=='_self' || link.hasAttribute('download'))return;
    const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
    event.preventDefault();navigate(url.href);
  });
  window.addEventListener('popstate',()=>{if(active()){const target=location.pathname+location.search+location.hash;if(target.startsWith(home))restore({history:false});else navigate(target,{history:false});}});
  return host;
}

export function joinCaptureHost() {
  if(window.parent===window)return false;
  try {
    const host=window.parent.BX?.captureHost;if(!host?.active)return false;
    document.addEventListener('click',event=>{
      if(event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
      const link=event.target.closest('a[href]');if(!link || link.target && link.target!=='_self' || link.hasAttribute('download'))return;
      const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
      if(url.pathname===location.pathname && url.search===location.search)return;
      event.preventDefault();host.navigate(url.href);
    });
    return true;
  }catch{return false;}
}
