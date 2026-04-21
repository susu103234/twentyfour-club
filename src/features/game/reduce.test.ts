import { describe, it, expect } from "vitest";
import {
  buildInitialPool,
  combine,
  applyCombine,
  isOpLegal,
  leafNode,
} from "./reduce";
import { evaluateExpression } from "./expression";

describe("reduce: pool", () => {
  it("buildInitialPool produces one leaf per card, in input order", () => {
    const pool = buildInitialPool([3, 7, 2, 8]);
    expect(pool).toHaveLength(4);
    expect(pool.map((n) => n.value)).toEqual([3, 7, 2, 8]);
    expect(pool.every((n) => n.cardIndex !== undefined)).toBe(true);
  });
});

describe("reduce: combine", () => {
  it("adds and multiplies", () => {
    const a = leafNode(0, 3);
    const b = leafNode(1, 7);
    expect(combine(a, b, "+").node.value).toBe(10);
    expect(combine(a, b, "×").node.value).toBe(21);
  });

  it("subtracts left − right (order matters)", () => {
    const a = leafNode(0, 3);
    const b = leafNode(1, 7);
    expect(combine(a, b, "-").node.value).toBe(-4);
    expect(combine(b, a, "-").node.value).toBe(4);
  });

  it("rejects divide-by-zero", () => {
    const a = leafNode(0, 3);
    const b = leafNode(1, 0);
    expect(isOpLegal(a, b, "÷")).toBe(false);
    expect(combine(a, b, "÷").legal).toBe(false);
  });

  it("produces minimally-parenthesised expressions that re-evaluate correctly", () => {
    // (3 + 7) × (2 - 8) - should wrap each side
    const a = combine(leafNode(0, 3), leafNode(1, 7), "+").node;
    const b = combine(leafNode(2, 2), leafNode(3, 8), "-").node;
    const final = combine(a, b, "×").node;
    expect(final.value).toBe(-60);
    const { value } = evaluateExpression(final.expr);
    expect(value).toBe(-60);
  });

  it("doesn't over-parenthesise left side of + when child is already +", () => {
    // (a + b) + c → should render as `a + b + c` (not `(a + b) + c`)
    const left = combine(leafNode(0, 1), leafNode(1, 2), "+").node;
    const plus = combine(left, leafNode(2, 3), "+").node;
    expect(plus.expr).not.toContain("(");
  });

  it("DOES parenthesise right side of − when child is same precedence", () => {
    // a − (b − c) requires parens because non-associative
    const right = combine(leafNode(1, 2), leafNode(2, 3), "-").node;
    const minus = combine(leafNode(0, 10), right, "-").node;
    expect(minus.expr).toContain("(");
    expect(minus.value).toBe(10 - (2 - 3));
  });
});

describe("reduce: applyCombine", () => {
  it("replaces two nodes with one in order", () => {
    const pool = buildInitialPool([1, 2, 3, 4]);
    const { pool: next, combined } = applyCombine(pool, pool[0], pool[2], "+");
    expect(next).toHaveLength(3);
    expect(next[0]).toBe(combined); // inserted at position of a
    expect(next.map((n) => n.value)).toEqual([4, 2, 4]); // 1+3=4, then 2, 4
  });
});
