export function createBroadcastAudio() {
  let context;
  let output;
  let enabled = false;
  let volume = .55;

  async function unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Áudio indisponível neste navegador.');
    if (!context) {
      context = new Audio();
      output = context.createGain();
      output.gain.value = volume * .42;
      output.connect(context.destination);
    }
    await context.resume();
    enabled = context.state === 'running';
    return enabled;
  }

  function note(start, length, frequency, end, shape, peak) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const when = context.currentTime + start;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(end, when + length);
    envelope.gain.setValueAtTime(.001, when);
    envelope.gain.exponentialRampToValueAtTime(peak, when + .014);
    envelope.gain.exponentialRampToValueAtTime(.001, when + length);
    oscillator.connect(envelope).connect(output);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(when);
    oscillator.stop(when + length + .01);
  }

  function play(cue) {
    if (!enabled || context?.state !== 'running') return;
    if (cue === 'ROUND') {
      note(0, .44, 105, 62, 'sine', .4);
      note(.05, .18, 294, 328, 'triangle', .27);
      note(.17, .25, 440, 494, 'triangle', .27);
      note(.29, .42, 587, 660, 'triangle', .28);
    } else if (cue === 'TABLE') {
      note(0, .28, 180, 85, 'sine', .42);
      note(.035, .29, 740, 390, 'triangle', .24);
    } else {
      note(0, .21, 130, 53, 'sine', .55);
      note(.012, .13, 380, 145, 'triangle', .25);
    }
  }

  return {
    unlock, play,
    get enabled() { return enabled; },
    mute() { enabled = false; },
    setVolume(value) {
      volume = value;
      if (output) output.gain.setTargetAtTime(value * .42, context.currentTime, .025);
    },
  };
}
