import type { Vec2 } from './types';
export const TAU = Math.PI * 2;
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const angleDelta = (a: number, b: number): number => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
/** First intersection along the segment, including starts inside the circle. */
export function segmentCircle(start: Vec2, end: Vec2, center: Vec2, radius: number): number | null {
  const dx = end.x - start.x, dy = end.y - start.y, ox = start.x - center.x, oy = start.y - center.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oy * dy), disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
export class SeededRandom {
  private value: number;
  constructor(seed: number) { this.value = seed >>> 0; }
  next(): number {
    this.value = (this.value + 0x6d2b79f5) >>> 0;
    let t = this.value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
