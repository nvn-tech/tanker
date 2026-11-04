// Tiny synthesized sound effects (no audio files needed).
TK.Sfx = (() => {
  let ac = null;
  let master = null;
  let muted = false;
  let chargeOsc = null;

  function ensure() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.35;
      master.connect(ac.destination);
    } catch (e) {
      ac = null;
    }
    return !!ac;
  }

  function noiseBuffer(sec) {
    const len = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(type, f0, f1, dur, vol = 0.5, delay = 0) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, q = 1) {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  const sounds = {
    shoot() { noise(0.25, 0.6, 2500); tone('square', 220, 60, 0.18, 0.25); },
    boom() { noise(0.7, 0.9, 1200, 0.7); tone('sine', 120, 35, 0.5, 0.6); },
    bigboom() { noise(1.1, 1, 900, 0.7); tone('sine', 90, 25, 0.9, 0.8); },
    hit() { tone('square', 520, 180, 0.15, 0.25); },
    heal() { tone('sine', 520, 1040, 0.25, 0.3); tone('sine', 780, 1560, 0.3, 0.2, 0.08); },
    item() { tone('triangle', 660, 990, 0.1, 0.3); },
    deny() { tone('square', 180, 140, 0.15, 0.2); },
    turn() { tone('triangle', 660, 660, 0.12, 0.3); tone('triangle', 880, 880, 0.18, 0.3, 0.12); },
    teleport() { tone('sine', 300, 1800, 0.35, 0.3); },
    tick() { tone('square', 1200, 1200, 0.04, 0.12); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.25, 0.3, i * 0.14)); },
    lose() { [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.3, i * 0.2)); },
  };

  return {
    unlock() { if (ensure() && ac.state === 'suspended') ac.resume(); },
    play(name) {
      if (muted || !ensure() || !sounds[name]) return;
      try { sounds[name](); } catch (e) { /* ignore audio errors */ }
    },
    // Rising pitch while the power bar charges.
    charge(power) {
      if (muted || !ensure()) return;
      if (!chargeOsc) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'triangle';
        g.gain.value = 0.06;
        o.connect(g).connect(master);
        o.start();
        chargeOsc = { o, g };
      }
      chargeOsc.o.frequency.setTargetAtTime(200 + power * 6, ac.currentTime, 0.02);
    },
    stopCharge() {
      if (chargeOsc) {
        try { chargeOsc.o.stop(); } catch (e) { /* already stopped */ }
        chargeOsc = null;
      }
    },
    toggleMute() { muted = !muted; if (muted) this.stopCharge(); return muted; },
    get muted() { return muted; },
  };
})();
