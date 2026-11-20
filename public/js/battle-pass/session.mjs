export class BattlePassSession {
  constructor({counter=null,epoch=0}={}) {
    this.counter = counter;
    this.epoch = epoch;
    this.attached = false;
    this.seen = new Set();
    this.pendingLive = new Map();
  }

  metadata(data) {
    const cancelled = this.attached && data.state==='ready' && data.counter===this.headerCounter;
    const advanced=this.headerCounter!==undefined && (data.counter>this.headerCounter || this.headerCounter>65000 && data.counter<1000);
    if(this.headerCounter!==undefined && data.counter<this.headerCounter && !advanced) this.pendingLive.clear();
    if(advanced && data.state==='ready') this.pendingLive.set(data.counter,data.receivedAt??new Date().toISOString());
    if(this.pendingLive.size>100) this.pendingLive.delete(this.pendingLive.keys().next().value);
    this.attached = data.state==='attached';
    this.headerCounter = data.counter;
    return cancelled ? 'cancelled' : data.state;
  }

  snapshot(data,now=new Date().toISOString()) {
    const previous = this.counter;
    const previousEpoch = this.epoch;
    if (previous!==null && data.counter<previous) this.epoch++;
    const initialWrap = previous===null && data.counter<data.values.length-1;
    if (initialWrap) this.epoch++;
    const wraps = initialWrap || previous!==null && previous>65000 && data.counter<1000;
    this.counter = data.counter;
    const entries = data.values.map((sp,i)=>{
      const logical = data.counter-data.values.length+1+i;
      const counter = (logical+65536)%65536;
      const epoch = logical<0 && wraps ? Math.max(0,this.epoch-1) : this.epoch;
      const key = epoch+':'+counter;
      const observed=this.pendingLive.get(counter);
      this.pendingLive.delete(counter);
      const live = !!observed || data.live && i===data.values.length-1 && previous!==data.counter;
      return {counter,epoch,sp,source:live?'live':'history',measuredAt:observed??(live?now:null),key};
    }).filter(entry=>{
      if (this.seen.has(entry.key) || previous!==null && entry.epoch===previousEpoch && entry.counter<=previous) return false;
      this.seen.add(entry.key);
      return true;
    });
    this.attached = false;
    return entries;
  }
}
