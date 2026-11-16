import type { BattleEvent, Settings } from '../game/types';

/** Optional feedback; audio failure never affects the simulation. */
export class SoundBank {
  private context: AudioContext | null = null;
  private seen = 0;
  constructor(private settings: () => Settings) {}
  unlock(): void {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* silent fallback */ }
  }
  reset(): void { this.seen = 0; }
  consume(events: BattleEvent[]): void {
    for (const event of events) {
      if (event.id <= this.seen) continue;
      this.seen = event.id;
      if (!this.settings().sound || !this.context || this.context.state !== 'running') continue;
      if (event.type === 'shot') this.tone(event.weapon === 'rail' ? 150 : 420, .04, .05, 'triangle');
      if (event.type === 'hit') this.tone(85, .085, .12, 'square');
      if (event.type === 'end') { this.tone(520, .2, .12, 'sine'); this.tone(780, .3, .08, 'sine', .13); }
    }
  }
  private tone(frequency: number, duration: number, gain: number, type: OscillatorType, delay = 0): void {
    try {
      const context = this.context!, oscillator = context.createOscillator(), volume = context.createGain(), start = context.currentTime + delay;
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(frequency * .45, start + duration);
      volume.gain.setValueAtTime(gain * this.settings().volume, start); volume.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(volume); volume.connect(context.destination); oscillator.start(start); oscillator.stop(start + duration);
    } catch { /* optional audio */ }
  }
  dispose(): void { void this.context?.close().catch(() => {}); }
}
