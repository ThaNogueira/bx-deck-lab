const effects = {
  hit: { modes:[730,1240,2030,3480,5720], decay:.19, noise:3400, snap:.034, level:.23 },
  smash: { modes:[430,1080,1840,3030,4930], decay:.29, noise:2800, snap:.047, level:.32 },
  scrape: { modes:[1050,2180,3610], decay:.075, noise:2600, snap:.075, level:.12 },
  dash: { modes:[690,1050,2320], decay:.16, noise:1750, snap:.21, level:.17 },
  launch: { modes:[440,1010,1840], decay:.10, noise:1490, snap:.19, level:.17 },
  finish: { modes:[610,1220,1930], decay:.36, noise:1100, snap:.045, level:.13 },
};

export class ArenaAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
  }

  toggle(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.master?.gain.setTargetAtTime(0,this.context.currentTime,.035);
      return;
    }
    if (!this.context) this.initialize();
    this.context.resume().catch(() => {});
    this.master.gain.setTargetAtTime(.62,this.context.currentTime,.03);
  }

  initialize() {
    const ctx = this.context = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -13;
    this.master.connect(limiter).connect(ctx.destination);
    this.noise = ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i=0;i<samples.length;i++) samples[i] = Math.random()*2-1;
    this.rotors = Array.from({length:2},() => {
      const motor = ctx.createOscillator(), texture = ctx.createBufferSource();
      const band = ctx.createBiquadFilter(), motorGain = ctx.createGain(), hissGain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      motor.setPeriodicWave(ctx.createPeriodicWave(
        new Float32Array(7),new Float32Array([0,1,.29,.12,.14,.025,.04])));
      texture.buffer = this.noise;
      texture.loop = true;
      band.type = 'bandpass';
      band.Q.value = .68;
      motorGain.gain.value = hissGain.gain.value = 0;
      motor.connect(motorGain).connect(pan);
      texture.connect(band).connect(hissGain).connect(pan);
      pan.connect(this.master);
      motor.start(); texture.start(0,Math.random());
      return {motor,band,motorGain,hissGain,pan};
    });
  }

  update(frames, rate) {
    if (!this.enabled || !this.context) return;
    const time = this.context.currentTime;
    this.rotors.forEach(({motor,band,motorGain,hissGain,pan},i) => {
      const frame = frames?.[i];
      const spin = frame && !frame.burst ? Math.hypot(...frame.w) : 0;
      const travel = spin ? Math.hypot(frame.v[0],frame.v[2]) : 0;
      const depth = rate < 1 ? .37 : 1;
      const running = Math.min(1,spin/180);
      motor.frequency.setTargetAtTime(30+spin*.92*depth,time,.050);
      band.frequency.setTargetAtTime((210+spin*3.2+travel*15)*depth,time,.068);
      motorGain.gain.setTargetAtTime(running*.033,time,.065);
      hissGain.gain.setTargetAtTime(running*(.022+Math.min(.037,travel*.0012)+(frame?.dash ? .048 : 0)),time,.056);
      pan.pan.setTargetAtTime(frame ? Math.max(-.7,Math.min(.7,frame.p[0]*.105)) : 0,time,.095);
    });
  }

  play(name, strength = 1, x = 0) {
    const cue = effects[name];
    if (!this.enabled || !this.context || !cue) return;
    const ctx = this.context, now = ctx.currentTime;
    const output = ctx.createStereoPanner();
    output.pan.value = Math.max(-.74,Math.min(.74,x*.115));
    output.connect(this.master);
    const level = cue.level*Math.max(.16,Math.min(1.42,Math.sqrt(strength)));
    const variation = .94+Math.random()*.12;
    const grit = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain();
    grit.buffer = this.noise;
    filter.type = 'bandpass';
    filter.Q.value = .64;
    filter.frequency.setValueAtTime(cue.noise*.68,now);
    filter.frequency.exponentialRampToValueAtTime(cue.noise*(name === 'dash' ? 1.85 : .8),now+cue.snap);
    env.gain.setValueAtTime(level,now);
    env.gain.exponentialRampToValueAtTime(.0001,now+cue.snap);
    grit.connect(filter).connect(env).connect(output);
    grit.start(now,Math.random()*.8);
    grit.stop(now+cue.snap);
    cue.modes.forEach((hz,i) => {
      const tone = ctx.createOscillator(), gain = ctx.createGain();
      const end = now+cue.decay/(1+i*.27);
      tone.frequency.value = hz*variation;
      gain.gain.setValueAtTime(level/(2.3+i*1.13),now);
      gain.gain.exponentialRampToValueAtTime(.0001,end);
      tone.connect(gain).connect(output);
      tone.start(now); tone.stop(end);
      if (i === 0) tone.onended = () => output.disconnect();
    });
  }
}
