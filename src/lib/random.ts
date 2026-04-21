/**
 * Small pluggable RNG layer. `Math.random` by default; swappable to a
 * deterministic generator for the daily hand (same seed → same puzzle).
 *
 * The seeded generator is mulberry32 — a tiny, well-behaved 32-bit PRNG
 * that's plenty for picking four cards.
 */

export type RandomFn = () => number;

let rng: RandomFn = Math.random;

export function setSeed(seed: number | string | null): void {
  rng = seed == null ? Math.random : mulberry32(hashStringToInt(String(seed)));
}

export function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffled<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Non-seeded — always a fresh id regardless of RNG state. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Deterministic "today" key in the user's local timezone. Format YYYY-MM-DD.
 * Same day → same seed → same hand for everyone on that local day.
 */
export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mulberry32(a: number): RandomFn {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
