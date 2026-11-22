export class BattlePassStore {
  constructor(owner,indexedDB=globalThis.indexedDB) {
    this.owner = owner;
    this.ready = new Promise((resolve,reject)=>{
      const request = indexedDB.open('bx-battle-pass',1);
      request.onupgradeneeded = ()=>request.result.createObjectStore('accounts');
      request.onsuccess = ()=>resolve(request.result);
      request.onerror = ()=>reject(new Error('Libere o armazenamento do navegador para guardar os lançamentos.'));
    });
  }

  async change(update) {
    const db = await this.ready;
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('accounts','readwrite'), store = tx.objectStore('accounts');
      const request = store.get(this.owner);
      let data;
      request.onsuccess = ()=>{
        data = request.result ?? {devices:{},sessions:[]};
        update(data);
        store.put(data,this.owner);
      };
      tx.oncomplete = ()=>resolve(data);
      tx.onerror = tx.onabort = ()=>reject(new Error('Não foi possível guardar o lançamento no navegador.'));
    });
  }

  read() { return this.change(()=>{}); }
}

export class BattlePassSync {
  constructor(store,{request,authenticated,onStatus=()=>{},onProgress=()=>{},getCapture=()=>null}) {
    Object.assign(this,{store,request,authenticated,onStatus,onProgress,getCapture});
    this.retry = 0;
  }

  async device(device) {
    const data = await this.store.read();
    let cursor = data.devices[device.key]??{counter:null,epoch:0};
    if (this.authenticated) {
      try {
        const server = await this.request('/api/battle-pass/devices',{method:'POST',body:{...device,accountId:this.store.owner}});
        if (server.epoch>cursor.epoch || server.epoch===cursor.epoch && (server.counter??-1)>(cursor.counter??-1)) cursor = server;
      } catch { /* Capture continues using this account's saved cursor when offline. */ }
    }
    return cursor;
  }

  async add(session,device,entries,cursor) {
    const data = await this.store.change(data=>{
      const known = new Set(data.sessions.filter(s=>s.device.key===device.key).flatMap(s=>s.launches.map(r=>r.key)));
      const fresh = entries.filter(row=>!known.has(row.key));
      let current = data.sessions.find(s=>s.id===session.id);
      if (!current) {
        current = {id:session.id,startedAt:session.startedAt,endedAt:session.endedAt,device,launches:[],dirty:true};
        data.sessions.push(current);
      }
      current.launches.push(...fresh);
      current.endedAt = session.endedAt;
      current.dirty = true;
      data.devices[device.key] = cursor;
    });
    this.flush();
    return data.sessions.find(s=>s.id===session.id);
  }

  async flush() {
    if (this.running || !this.authenticated || this.stopped) return;
    this.running = true;
    clearTimeout(this.timer);
    try {
      const data = await this.store.read();
      for (const session of data.sessions) {
        const pending = session.launches.filter(row=>!row.synced);
        if (!pending.length && !session.dirty) continue;
        const rows = pending.slice(0,100);
        this.onStatus('syncing');
        const capture=this.getCapture(session.id);
        const result=await this.request('/api/battle-pass/sync',{method:'POST',body:{
          accountId:this.store.owner,
          device:session.device,session:{id:session.id,startedAt:session.startedAt,endedAt:session.endedAt},launches:rows,...(capture?{capture}:{}),
        }});
        if(result?.progression) {try{this.onProgress(result.progression);}catch{/* UI feedback does not invalidate an accepted sync. */}}
        await this.store.change(saved=>{
          const current = saved.sessions.find(s=>s.id===session.id);
          for (const row of current.launches) if (rows.some(sent=>sent.key===row.key)) row.synced = true;
          // An ending that happened during the request still needs to be transmitted.
          current.dirty = current.endedAt!==session.endedAt || current.launches.some(row=>!row.synced);
        });
      }
      const saved = await this.store.read();
      this.retry = 0;
      const pending = saved.sessions.some(s=>s.dirty || s.launches.some(r=>!r.synced));
      this.onStatus(pending?'pending':'saved');
      if (pending) this.timer = setTimeout(()=>this.flush(),250);
    } catch (error) {
      if ([401,403,409,422].includes(error.status)) {
        this.onStatus('blocked',error.message);
        return;
      }
      this.onStatus('pending',error.message);
      this.timer = setTimeout(()=>this.flush(),Math.min(60000,2000*2**Math.min(this.retry++,5)));
    } finally { this.running = false; }
  }

  stop() { this.stopped = true;clearTimeout(this.timer); }
}
