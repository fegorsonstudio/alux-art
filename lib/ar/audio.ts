/**
 * The burner's roar, made from noise: no sound file to download. The context
 * is created from the Start tap, which is what phones require, and every
 * burst is attenuated by how far away the balloon is.
 */
export class BurnerAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Call from a user gesture. Safe to call again. */
  unlock() {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        const sr = this.ctx.sampleRate, len = sr * 2;
        const buf = this.ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        // Brown-ish noise: a low rumble rather than a hiss.
        let last = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.02 * white) / 1.02;
          d[i] = last * 3.5;
        }
        this.noise = buf;
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => undefined);
    } catch { /* no audio: the balloons are silent */ }
  }

  /** One burst: seconds long, at a distance in metres. */
  burst(seconds: number, distanceM: number) {
    if (this.muted || !this.ctx || !this.noise) return;
    try {
      const ctx = this.ctx, now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass"; band.frequency.value = 420; band.Q.value = 0.6;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.setValueAtTime(900, now); lp.frequency.linearRampToValueAtTime(2200, now + 0.25);
      lp.frequency.linearRampToValueAtTime(700, now + seconds);
      const gain = ctx.createGain();
      const level = Math.min(0.9, 0.9 / (1 + distanceM / 35));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.12);
      gain.gain.setValueAtTime(level, now + Math.max(0.15, seconds - 0.35));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      src.connect(band).connect(lp).connect(gain).connect(ctx.destination);
      src.start(now);
      src.stop(now + seconds + 0.05);
    } catch { /* ignore */ }
  }

  close() {
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
