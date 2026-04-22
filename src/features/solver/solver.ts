/**
 * 24 solver.
 *
 * Given n numbers, enumerates every binary-tree combination using +, -, *, /
 * and returns the expressions whose value is (approximately) 24.
 *
 * Works by repeatedly picking two operands, combining them via every operator,
 * and recursing on the shrunk list. Division by zero is skipped.
 */

import { TARGET, EPS } from "@/lib/constants";

export interface SolverNode {
  expr: string;
  value: number;
  /** Precedence of the outermost operator: 1 = add/sub, 2 = mul/div, 3 = leaf. */
  prec: number;
  /**
   * True iff every intermediate value in this subtree is an integer. Leaves
   * are integers by construction; +, −, × preserve this; ÷ preserves it only
   * when the divisor divides the dividend evenly.
   */
  allInt: boolean;
}

export interface DetailedSolution {
  expr: string;
  /** Every step of this expression is an integer (no fractional intermediates). */
  allInt: boolean;
}

function leaf(n: number): SolverNode {
  return { expr: String(n), value: n, prec: 3, allInt: true };
}

function wrap(node: SolverNode, minPrec: number): string {
  return node.prec < minPrec ? `(${node.expr})` : node.expr;
}

function dividesEvenly(a: number, b: number): boolean {
  if (Math.abs(b) < EPS) return false;
  const q = a / b;
  return Math.abs(q - Math.round(q)) < EPS;
}

function* combine(a: SolverNode, b: SolverNode): Generator<SolverNode> {
  const base = a.allInt && b.allInt;

  // a + b (commutative — only emit once; ordering enforced by caller)
  yield {
    expr: `${wrap(a, 1)} + ${wrap(b, 1)}`,
    value: a.value + b.value,
    prec: 1,
    allInt: base,
  };
  // a - b and b - a (not commutative)
  yield {
    expr: `${wrap(a, 1)} - ${wrap(b, 2)}`,
    value: a.value - b.value,
    prec: 1,
    allInt: base,
  };
  yield {
    expr: `${wrap(b, 1)} - ${wrap(a, 2)}`,
    value: b.value - a.value,
    prec: 1,
    allInt: base,
  };
  // a * b (commutative)
  yield {
    expr: `${wrap(a, 2)} × ${wrap(b, 2)}`,
    value: a.value * b.value,
    prec: 2,
    allInt: base,
  };
  // a / b and b / a — only keep the all-int flag when the division is exact.
  if (Math.abs(b.value) > EPS) {
    yield {
      expr: `${wrap(a, 2)} ÷ ${wrap(b, 3)}`,
      value: a.value / b.value,
      prec: 2,
      allInt: base && dividesEvenly(a.value, b.value),
    };
  }
  if (Math.abs(a.value) > EPS) {
    yield {
      expr: `${wrap(b, 2)} ÷ ${wrap(a, 3)}`,
      value: b.value / a.value,
      prec: 2,
      allInt: base && dividesEvenly(b.value, a.value),
    };
  }
}

function canonicalise(expr: string): string {
  return expr.replace(/\s+/g, "");
}

/**
 * Return every distinct (by string) expression that evaluates to 24, along
 * with whether the expression can be reached via integer-only intermediates.
 * If the same expression string can be built both with and without fractions,
 * the integer-only path wins.
 */
export function solve24Detailed(nums: number[]): DetailedSolution[] {
  const nodes = nums.map(leaf);
  const found = new Map<string, DetailedSolution>();

  function recurse(pool: SolverNode[]) {
    if (pool.length === 1) {
      const only = pool[0];
      if (Math.abs(only.value - TARGET) < EPS) {
        const key = canonicalise(only.expr);
        const existing = found.get(key);
        if (!existing || (only.allInt && !existing.allInt)) {
          found.set(key, { expr: only.expr, allInt: only.allInt });
        }
      }
      return;
    }

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const rest: SolverNode[] = [];
        for (let k = 0; k < pool.length; k++) {
          if (k !== i && k !== j) rest.push(pool[k]);
        }
        const a = pool[i];
        const b = pool[j];
        for (const merged of combine(a, b)) {
          recurse([...rest, merged]);
        }
      }
    }
  }

  recurse(nodes);
  return [...found.values()];
}

/** Back-compat: the old string-only view. */
export function solve24(nums: number[]): string[] {
  return solve24Detailed(nums).map((s) => s.expr);
}

export function hasSolution(nums: number[]): boolean {
  return solve24(nums).length > 0;
}

export function firstSolution(nums: number[]): string | null {
  const all = solve24(nums);
  return all.length > 0 ? shortest(all) : null;
}

export function shortest(exprs: string[]): string {
  let best = exprs[0];
  for (const e of exprs) {
    if (canonicalise(e).length < canonicalise(best).length) best = e;
  }
  return best;
}
