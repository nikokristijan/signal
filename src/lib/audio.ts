/**
 * Zvukovi generirani Web Audio API-jem: nema vanjskih datoteka.
 * AudioContext se otključava tek nakon geste korisnika (gumb „Kreni" ili prva tipka).
 */
type Ctx = AudioContext;

class Sfx {
  private ctx: Ctx | null = null;
  enabled = true;

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  /** Mora se pozvati iz geste korisnika (klik/tipka). */
  unlock() {
    if (typeof window === "undefined") return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* zvuk nije dostupan */
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number) {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== "running") return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Otkucaj: viši i oštriji što je tajmer bliže nuli (urgency 0..1). */
  tick(urgency: number) {
    this.tone(700 + urgency * 700, 0.05, "square", 0.035 + urgency * 0.03);
  }

  good(combo: number) {
    const base = 520 + Math.min(combo, 8) * 40;
    this.tone(base, 0.09, "sine", 0.12);
    this.tone(base * 1.5, 0.14, "sine", 0.1, 0.07);
  }

  bad() {
    this.tone(170, 0.16, "sawtooth", 0.07, 0, 110);
  }

  boom() {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== "running") return;
    const len = Math.floor(ctx.sampleRate * 0.9);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.8);
    const g = ctx.createGain();
    g.gain.value = 0.6;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
    this.tone(120, 0.6, "sine", 0.5, 0, 38);
  }

  /** Kratki signal „prestigao si prijatelja". */
  overtake() {
    this.tone(660, 0.1, "triangle", 0.1);
    this.tone(990, 0.18, "triangle", 0.1, 0.09);
  }
}

export const sfx = new Sfx();

export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* nije podržano */
  }
}
