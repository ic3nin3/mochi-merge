// All sounds are synthesized with the WebAudio API — no audio files.
// The AudioContext is created lazily on the first user gesture so we stay
// autoplay-policy safe on iOS/Android.

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Call from any user gesture. Safe to call repeatedly. */
  ensure(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /** Soft plop when a piece is dropped / lands. */
  plop(): void {
    this.ensure();
    this.tone(340, 140, 0.12, 'sine', 0.35);
  }

  /** Pop on merge — pitch climbs a ladder with the created tier. */
  pop(tier: number): void {
    this.ensure();
    const base = 320 * Math.pow(1.09, tier);
    this.tone(base, base * 1.9, 0.1, 'sine', 0.4);
    this.tone(base * 2, base * 2.6, 0.14, 'triangle', 0.22, 0.03);
  }

  /** Little arpeggio when a brand-new max tier is created. */
  fanfare(): void {
    this.ensure();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, f, 0.16, 'triangle', 0.3, i * 0.09));
  }

  /** Descending jingle on game over. */
  gameOver(): void {
    this.ensure();
    const notes = [392, 329.63, 261.63, 196];
    notes.forEach((f, i) => this.tone(f, f * 0.97, 0.22, 'sine', 0.3, i * 0.16));
  }

  /** Short clock tick for the final seconds of Challenge mode. */
  tick(): void {
    this.ensure();
    this.tone(1150, 900, 0.05, 'square', 0.12);
  }

  /** Time-up jingle for Challenge mode — bright rising finish. */
  timeUp(): void {
    this.ensure();
    const notes = [523.25, 659.25, 783.99, 659.25, 523.25];
    notes.forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.3, i * 0.1));
    this.tone(261.63, 261.63, 0.4, 'sine', 0.25, 0.55);
  }

  /** Happy "order served" ding for café modes. */
  serve(): void {
    this.ensure();
    this.tone(880, 880, 0.1, 'triangle', 0.32);
    this.tone(1174.66, 1174.66, 0.14, 'triangle', 0.32, 0.09);
    this.tone(1760, 1760, 0.2, 'sine', 0.2, 0.18);
  }

  /** Grumpy buzz when a customer storms off (Conveyor Rush strike). */
  angry(): void {
    this.ensure();
    this.tone(220, 110, 0.22, 'sawtooth', 0.22);
    this.tone(180, 90, 0.28, 'square', 0.12, 0.08);
  }

  /** Dull thud for a rejected tap (full plate / unservable ticket). */
  thunk(): void {
    this.ensure();
    this.tone(130, 62, 0.12, 'sine', 0.4);
  }

  /** Soft double-blip when a customer grows impatient (once per customer). */
  warn(): void {
    this.ensure();
    this.tone(660, 660, 0.07, 'triangle', 0.16);
    this.tone(660, 660, 0.07, 'triangle', 0.14, 0.11);
  }
}

export const sound = new SoundEngine();
