import type { HandCards } from "@/types";

/**
 * 6-char share code for a 4-card hand, formatted as `XXXX-YY`.
 * The 4-char head encodes the hand in base 36 (13^4 = 28 561 < 36^4).
 * The 2-char tail is a deterministic checksum so typos fail fast rather
 * than silently loading the wrong hand.
 *
 * Design choices:
 *   — Uppercased, no lowercase-ambiguous chars in user-facing text.
 *   — Accepts input with/without the dash, case-insensitive, ignores
 *     whitespace. (Makes copy-paste from chat apps forgiving.)
 *   — Stable: the same cards always produce the same code.
 */

const BASE = 36;

export function encodeHand(cards: HandCards): string {
  const [a, b, c, d] = cards;
  const n =
    (a - 1) * 13 * 13 * 13 +
    (b - 1) * 13 * 13 +
    (c - 1) * 13 +
    (d - 1);
  const head = n.toString(BASE).padStart(4, "0").toUpperCase();
  const tail = checksum(n).toString(BASE).padStart(2, "0").toUpperCase();
  return `${head}-${tail}`;
}

export function decodeHand(input: string): HandCards | null {
  const cleaned = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length !== 6) return null;
  const head = cleaned.slice(0, 4);
  const tail = cleaned.slice(4);
  const n = parseInt(head, BASE);
  if (!Number.isFinite(n) || n < 0 || n > 28560) return null;
  const expected = checksum(n).toString(BASE).padStart(2, "0").toUpperCase();
  if (expected !== tail) return null;
  const a = Math.floor(n / (13 * 13 * 13)) + 1;
  const b = (Math.floor(n / (13 * 13)) % 13) + 1;
  const c = (Math.floor(n / 13) % 13) + 1;
  const d = (n % 13) + 1;
  return [a, b, c, d] as HandCards;
}

/**
 * Small multiplicative checksum. Not cryptographic — just enough that a
 * single-digit typo in the head almost always invalidates the code.
 */
function checksum(n: number): number {
  let h = 0x9e37 ^ n;
  h = Math.imul(h, 2654435761) >>> 0;
  h ^= h >>> 16;
  // `^=` demotes to signed int32 — coerce back to uint before modulo so the
  // result is always non-negative and `toString(36)` stays alphanumeric.
  return (h >>> 0) % (BASE * BASE);
}
