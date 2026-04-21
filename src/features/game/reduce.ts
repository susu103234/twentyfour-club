import { EPS } from "@/lib/constants";
import { uid } from "@/lib/random";

export type ReduceOp = "+" | "-" | "×" | "÷";

/**
 * A node in the reduction tree. Leaves carry their original card index so we
 * can grey-out used cards. Inner nodes carry an op and two children; `expr`
 * is the pre-rendered minimally-parenthesised string for display/reveal.
 */
export interface ReduceNode {
  id: string;
  value: number;
  expr: string;
  /** 1..2 for leaves (precedence of operator-less atom); 1 for +-, 2 for ×÷. */
  prec: 1 | 2 | 3;
  cardIndex?: number;
  op?: ReduceOp;
  children?: [ReduceNode, ReduceNode];
}

export function leafNode(cardIndex: number, value: number): ReduceNode {
  return {
    id: uid(),
    value,
    expr: formatAtom(value),
    prec: 3,
    cardIndex,
  };
}

export function buildInitialPool(cards: readonly number[]): ReduceNode[] {
  return cards.map((v, i) => leafNode(i, v));
}

export interface CombineResult {
  node: ReduceNode;
  /** value is legal (e.g. not div-by-zero). UI can use this to grey the op. */
  legal: boolean;
}

/**
 * Combine two nodes under an operator. Left-operand-first semantics:
 * if the player selected A then B, the combined expression is `A op B`.
 */
export function combine(a: ReduceNode, b: ReduceNode, op: ReduceOp): CombineResult {
  const va = a.value;
  const vb = b.value;
  let value: number;
  switch (op) {
    case "+":
      value = va + vb;
      break;
    case "-":
      value = va - vb;
      break;
    case "×":
      value = va * vb;
      break;
    case "÷":
      if (Math.abs(vb) < EPS) return { node: poisonNode(a, b, op), legal: false };
      value = va / vb;
      break;
  }
  const prec = op === "+" || op === "-" ? 1 : 2;
  const left = wrapForLeft(a, prec);
  const right = wrapForRight(b, prec, op);
  return {
    node: {
      id: uid(),
      value,
      expr: `${left} ${op} ${right}`,
      prec,
      op,
      children: [a, b],
    },
    legal: true,
  };
}

/** Predicts whether combine(a, b, op) is legal without producing a node. */
export function isOpLegal(_a: ReduceNode, b: ReduceNode, op: ReduceOp): boolean {
  if (op === "÷") return Math.abs(b.value) > EPS;
  return true;
}

/** Replace nodes a and b in pool with a single combined node. */
export function applyCombine(
  pool: ReduceNode[],
  a: ReduceNode,
  b: ReduceNode,
  op: ReduceOp
): { pool: ReduceNode[]; combined: ReduceNode } {
  const combined = combine(a, b, op).node;
  const next: ReduceNode[] = [];
  const skip = new Set([a.id, b.id]);
  // Preserve original order, inserting the combined node at the position of a.
  for (const n of pool) {
    if (n.id === a.id) next.push(combined);
    else if (!skip.has(n.id)) next.push(n);
  }
  return { pool: next, combined };
}

/** Formatted atom — integer or trimmed decimal. */
function formatAtom(v: number): string {
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v - Math.round(v)) < EPS) return String(Math.round(v));
  return v.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Left operand only needs parens if its root has strictly lower precedence
 * than the outer op.
 */
function wrapForLeft(a: ReduceNode, outer: 1 | 2): string {
  return a.prec < outer ? `(${a.expr})` : a.expr;
}

/**
 * Right operand needs parens if lower precedence, OR same precedence under
 * a non-associative op (`-` or `÷`), because `a - (b - c) ≠ (a - b) - c`.
 */
function wrapForRight(b: ReduceNode, outer: 1 | 2, op: ReduceOp): string {
  if (b.prec < outer) return `(${b.expr})`;
  const nonAssoc = op === "-" || op === "÷";
  if (nonAssoc && b.prec === outer) return `(${b.expr})`;
  return b.expr;
}

/** Used when an illegal op would be applied; keeps types honest. */
function poisonNode(a: ReduceNode, b: ReduceNode, op: ReduceOp): ReduceNode {
  return {
    id: uid(),
    value: NaN,
    expr: `${a.expr} ${op} ${b.expr}`,
    prec: 1,
    op,
    children: [a, b],
  };
}
