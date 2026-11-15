const clamp = (value,min,max) => Math.min(max,Math.max(min,value));

export class BattlePlayback {
  constructor() { this.clear(); }

  clear() {
    this.samples = [];
    this.clock = null;
    this.lastDraw = null;
  }

  push(frames,time,arrival,exact=false) {
    if (exact) this.clear();
    const latest = this.samples.at(-1);
    // During a reflex challenge one physics tick can span several packets.
    // Only a new step can advance the clock's time reference.
    if (latest && time<=latest.time) return false;
    this.samples.push({frames,time,arrival});
    if (this.samples.length>16) this.samples.shift();
    return true;
  }

  sample(now,rate) {
    const latest = this.samples.at(-1);
    if (!latest) return null;
    const slowMotion = rate < .1;
    const delay = slowMotion ? .045 : .085;
    const desired = latest.time+(Math.max(0,now-latest.arrival)-delay)*rate;
    const elapsed = this.lastDraw===null ? 0 : clamp(now-this.lastDraw,0,.075);
    this.lastDraw = now;
    this.clock ??= desired;
    const speed = clamp(1+(desired-this.clock)*8,.72,1.28);
    const limit = slowMotion ? .012 : .14;
    this.clock = Math.min(latest.time+limit,this.clock+elapsed*rate*speed);
    while (this.samples.length>1 && this.samples[1].time<=this.clock) this.samples.shift();
    const [from,to] = this.samples;
    const span = to ? to.time-from.time : 0;
    return {from:from.frames,to:to?.frames,span,
      blend:span ? clamp((this.clock-from.time)/span,0,1) : 0,
      lead:to ? 0 : Math.max(0,this.clock-from.time)};
  }
}
