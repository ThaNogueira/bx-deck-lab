/* Admin-only editor; images stay in the browser until the artwork is saved. */
(() => {
  BX.mountChampionGenerator = async root => {
    const renderer=await import('/js/champion-renderer.mjs?v=nameplate-3'),index=await BX.partTagReady();await renderer.loadChampionFonts();
    const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const state={name:'',eventName:'SEMANAL TAMER',eventDate:localDay,beys:[[],[],[]],portrait:null,zoom:1,offsetX:0,offsetY:0,tournamentId:null,championUserId:null};
    let saved=null,busy=false,rendering=false,pending=false,dirty=true,renderPromise=Promise.resolve(),missing=[],players=[],timer,revision=0;
    root.innerHTML=`<section class="champion-generator"><div class="champion-form panel-card"><p class="eyebrow">ARTE DO CAMPEÃO</p><h2>Gerador de campeão</h2>
      <label>Torneio<select id="championTournament"><option value="">Sem vínculo</option></select></label>
      <label id="championPlayerLabel" hidden>Jogador<select id="championPlayer"></select></label>
      <div class="champion-form-row"><label>Nome na arte<input id="championName" maxlength="60" placeholder="Nome do campeão"></label><label>Data<input id="championDate" type="date" value="${localDay}"></label></div>
      <label>Evento<input id="championEvent" maxlength="80" value="SEMANAL TAMER"></label>
      <label class="champion-photo-input">Foto do campeão<input id="championPhoto" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <button type="button" class="btn secondary" id="championRetry" hidden>Tentar recortar novamente</button>
      <fieldset class="champion-framing" disabled><legend>Enquadramento</legend><label>Tamanho<input id="championZoom" type="range" min="0.65" max="1.6" step="0.01" value="1"></label><label>Horizontal<input id="championX" type="range" min="-180" max="180" step="1" value="0"></label><label>Vertical<input id="championY" type="range" min="-160" max="160" step="1" value="0"></label></fieldset>
      <button type="button" class="champion-deck-button" id="championDeck"><span><b>Deck List</b><small>Montar / cores</small></span><span id="championDeckPreview"></span></button>
      <div id="championComboLabels" class="champion-combo-labels"></div>
      <p id="championStatus" role="status">Adicione a foto e monte as três Beys.</p>
      <div class="champion-buttons"><button class="btn primary" id="championDownload" disabled>Baixar PNG 2160 × 2160</button><button class="btn secondary" id="championSave" disabled>Salvar arte</button><button class="btn secondary" id="championPublish" disabled>Publicar na comunidade</button></div><a id="championPostLink" hidden target="_blank" rel="noopener">Ver publicação</a>
      </div><div class="champion-preview"><canvas id="championCanvas" aria-label="Prévia da arte do campeão"></canvas></div><section class="champion-history panel-card"><p class="eyebrow">ARTES SALVAS</p><div id="championHistory"></div></section></section>`;
    const el=id=>root.querySelector('#'+id),canvas=el('championCanvas'),alive=()=>canvas.isConnected&&root.contains(canvas);
    const ready=()=>state.portrait&&state.name.trim()&&state.eventName.trim()&&state.eventDate&&state.beys.every(ids=>ids.length)&&!missing.length;
    const status=(message,error=false)=>{if(!alive())return;el('championStatus').textContent=message;el('championStatus').classList.toggle('error',error);};
    const controls=()=>{if(!alive())return;for(const id of ['championDownload','championSave','championPublish'])el(id).disabled=busy||rendering||dirty||!ready();root.querySelectorAll('.champion-form input,.champion-form select,#championDeck').forEach(input=>input.disabled=busy);};
    const change=()=>{revision++;saved=null;el('championPostLink').hidden=true;dirty=true;clearTimeout(timer);timer=setTimeout(draw,160);controls();};
    const deckPreview=()=>{el('championDeckPreview').innerHTML=BX.deckPreview(state.beys,{u:32});el('championComboLabels').innerHTML=state.beys.map(ids=>`<span>${BX.esc(renderer.comboLabel(ids,index.byId)||'—')}</span>`).join('');};
    async function draw(){
      if(!alive())return;if(rendering){pending=true;return renderPromise;}
      rendering=true;controls();renderPromise=(async()=>{
        do{pending=false;const frame=document.createElement('canvas'),version=revision;const snapshot={...state,beys:state.beys.map(ids=>[...ids])};
          try{const result=await renderer.renderChampion(frame,snapshot,index.byId);if(!alive())return;if(version!==revision){pending=true;continue;}canvas.width=frame.width;canvas.height=frame.height;canvas.getContext('2d').drawImage(frame,0,0);missing=result.missing;dirty=false;if(!busy)status(missing.length?`Peças sem imagem: ${missing.join(', ')}`:ready()?'Arte pronta.':'Adicione nome, foto e as três Beys.',missing.length>0);}catch(error){status(error.message,true);}
        }while(pending&&alive());
      })().finally(()=>{rendering=false;controls();});return renderPromise;
    }
    async function output(){clearTimeout(timer);if(dirty)await draw();await renderPromise;if(!ready())throw Error('Complete nome, foto, data e as três Beys.');return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Não foi possível gerar o PNG.')),'image/png'));}
    async function save(){
      if(saved)return saved;const image=await output(),form=new FormData();
      for(const key of ['name','eventName','eventDate'])form.append(key,state[key]);form.append('beys',JSON.stringify(state.beys));if(state.tournamentId)form.append('tournamentId',state.tournamentId);if(state.championUserId)form.append('championUserId',state.championUserId);form.append('image',image,'campeao.png');
      saved=(await BX.api('/api/admin/champion/artworks',{method:'POST',body:form})).artwork;await history();return saved;
    }
    async function action(fn){if(busy)return;busy=true;controls();try{await fn();}catch(error){status(error.message,true);}finally{busy=false;controls();}}
    async function history(){const {artworks}=await BX.api('/api/admin/champion/artworks');if(!alive())return;el('championHistory').innerHTML=artworks.map(a=>`<article><img src="${BX.esc(a.imageUrl)}" alt="Arte de ${BX.esc(a.name)}" loading="lazy"><div><b>${BX.esc(a.name)}</b><small>${BX.esc(a.eventName)} · ${BX.esc(a.eventDate.split('-').reverse().join('/'))}</small><a href="${BX.esc(a.imageUrl)}" download="campeao-${BX.esc(a.eventDate)}.png">Baixar</a> ${a.postId?`<a href="/comunidade/p/${BX.esc(a.postId)}">Ver post</a>`:`<button type="button" class="btn ghost" data-publish-art="${BX.esc(a.id)}">Publicar</button>`}</div></article>`).join('')||'<small>Nenhuma arte salva.</small>';
      root.querySelectorAll('[data-publish-art]').forEach(b=>b.onclick=()=>action(async()=>{const result=await BX.api(`/api/admin/champion/artworks/${b.dataset.publishArt}/publish`,{method:'POST'});status('Imagem publicada na comunidade.');await history();el('championPostLink').href=result.url;el('championPostLink').hidden=false;}));
    }
    for(const [id,key] of [['championName','name'],['championEvent','eventName'],['championDate','eventDate']])el(id).oninput=e=>{state[key]=e.target.value;change();};
    for(const [id,key] of [['championZoom','zoom'],['championX','offsetX'],['championY','offsetY']])el(id).oninput=e=>{state[key]=Number(e.target.value);change();};
    let photoFile=null;
    async function processPhoto(){
      if(!photoFile||busy)return;busy=true;state.portrait=null;root.querySelector('.champion-framing').disabled=true;change();controls();el('championPhoto').disabled=true;el('championRetry').hidden=true;status('Recortando foto, aguarde…');
      try{
        if(photoFile.size>20*1024*1024)throw Error('Use uma foto de até 20 MB.');let cutout=photoFile;
        if(!await renderer.alreadyTransparent(photoFile)){const {removeChampionBackground}=await import('/react/champion-cutout.js');cutout=await removeChampionBackground(photoFile,(_key,current,total)=>status(total?`Preparando recorte… ${Math.round(current/total*100)}%`:'Recortando foto…'));}
        if(!alive())return;const bitmap=await createImageBitmap(cutout);state.portrait=renderer.cropPortrait(bitmap);bitmap.close();state.zoom=1;state.offsetX=0;state.offsetY=0;el('championZoom').value=1;el('championX').value=0;el('championY').value=0;root.querySelector('.champion-framing').disabled=false;change();await draw();status(missing.length?`Peças sem imagem: ${missing.join(', ')}`:'Foto recortada. Ajuste o enquadramento se precisar.',missing.length>0);
      }catch(error){status(`Não foi possível recortar a foto: ${error.message}`,true);if(alive())el('championRetry').hidden=false;}finally{busy=false;if(alive())el('championPhoto').disabled=false;controls();}
    }
    el('championPhoto').onchange=e=>{photoFile=e.target.files[0];processPhoto();};el('championRetry').onclick=processPhoto;
    el('championDeck').onclick=()=>BX.openTournamentDeckEditor({title:'Deck do campeão',heading:'Deck do campeão',beys:state.beys,enableRecolors:true,requireThree:true,showTitle:false,slotLabel:ids=>renderer.comboLabel(ids,index.byId),onSave:async draft=>{state.beys=Array.from({length:3},(_,i)=>draft.beys[i]||[]);deckPreview();change();}}).catch(error=>status(error.message,true));
    const selectPlayer=()=>{const player=players.find(p=>p.user.id===el('championPlayer').value);if(player){state.championUserId=player.user.id;state.name=player.user.name;el('championName').value=state.name;state.beys=Array.from({length:3},(_,i)=>player.beys[i]||[]);deckPreview();change();}};
    el('championPlayer').onchange=selectPlayer;
    el('championTournament').onchange=async e=>{
      if(!e.target.value){state.tournamentId=null;state.championUserId=null;players=[];el('championPlayerLabel').hidden=true;change();return;}
      const slug=e.target.value;state.tournamentId=null;state.championUserId=null;try{const result=await BX.api('/api/admin/champion/tournaments/'+encodeURIComponent(slug));if(el('championTournament').value!==slug)return;state.tournamentId=result.tournament.id;state.eventDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(result.tournament.startsAt));state.eventName=result.tournament.name;el('championDate').value=state.eventDate;el('championEvent').value=state.eventName;players=result.players;el('championPlayer').innerHTML=players.map(p=>`<option value="${BX.esc(p.user.id)}">${p.place}º · ${BX.esc(p.user.name)}</option>`).join('');el('championPlayerLabel').hidden=!players.length;state.championUserId=null;selectPlayer();change();}catch(error){el('championTournament').value='';status(error.message,true);}
    };
    el('championDownload').onclick=()=>action(async()=>{const blob=await output(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`campeao-${state.eventDate}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('PNG em alta qualidade baixado.');});
    el('championSave').onclick=()=>action(async()=>{await save();status('Arte salva.');});
    el('championPublish').onclick=()=>action(async()=>{const artwork=await save(),result=await BX.api(`/api/admin/champion/artworks/${artwork.id}/publish`,{method:'POST'});el('championPostLink').href=result.url;el('championPostLink').hidden=false;status('Imagem publicada na comunidade.');await history();});
    const {tournaments}=await BX.api('/api/admin/champion/tournaments');if(!alive())return;el('championTournament').insertAdjacentHTML('beforeend',tournaments.map(t=>`<option value="${BX.esc(t.slug)}">${BX.esc(t.name)}</option>`).join(''));deckPreview();await Promise.all([draw(),history()]);
  };
})();
