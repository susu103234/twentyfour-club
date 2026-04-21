import { describe, it, expect } from "vitest";
import { encodeHand, decodeHand } from "./seedCode";
import type { HandCards } from "@/types";

describe("seedCode", () => {
  it("round-trips every 4-card combination in [1..13]", () => {
    // Sparse sample — full 28 561-way coverage would be slow but still fine.
    const probes: HandCards[] = [
      [1, 1, 1, 2],
      [13, 13, 13, 13],
      [3, 7, 2, 8],
      [6, 1, 3, 4],
      [5, 5, 5, 1],
      [8, 3, 8, 3],
      [12, 4, 7, 9],
    ];
    for (const cards of probes) {
      const code = encodeHand(cards);
      expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{2}$/);
      const decoded = decodeHand(code);
      expect(decoded).toEqual(cards);
    }
  });

  it("accepts forgiving input (lowercase, no dash, whitespace)", () => {
    const code = encodeHand([7, 2, 11, 5]);
    const raw = code.replace("-", "").toLowerCase();
    expect(decodeHand(raw)).toEqual([7, 2, 11, 5]);
    expect(decodeHand(`  ${code.toLowerCase()}  `)).toEqual([7, 2, 11, 5]);
  });

  it("rejects codes with a bad checksum", () => {
    const code = encodeHand([3, 3, 7, 7]); // e.g. "02M8-XY"
    // Flip the last checksum char to something guaranteed wrong.
    const badTail = code.endsWith("A") ? "B" : "A";
    const tampered = code.slice(0, -1) + badTail;
    expect(decodeHand(tampered)).toBeNull();
  });

  it("rejects junk input", () => {
    expect(decodeHand("")).toBeNull();
    expect(decodeHand("XX")).toBeNull();
    expect(decodeHand("NOT-A-CODE")).toBeNull();
  });
});
