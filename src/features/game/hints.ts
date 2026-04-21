import { evaluateExpression } from "./expression";
import { formatNumber, toAsciiExpression } from "@/lib/format";

export type HintLevel = 0 | 1 | 2 | 3;

export interface HintPayload {
  level: HintLevel;
  text: string;
}

/**
 * Layered hints derived from the canonical solver solution.
 *
 * Level 1 — strategic: surface a good intermediate goal. We pick the top-level
 *           operation of the canonical solution and describe "make X and Y".
 * Level 2 — structural: show the shape of the expression with blanks instead
 *           of numbers, so the player sees *where* operators live.
 * Level 3 — full reveal of the canonical expression.
 */
export function buildHint(solution: string, level: HintLevel): HintPayload {
  if (level === 0) return { level, text: "" };
  if (level === 3) {
    return { level, text: `Answer · ${solution}` };
  }
  if (level === 2) {
    return { level, text: `Shape · ${toStructure(solution)}` };
  }
  const goals = strategicGoals(solution);
  return { level, text: goals };
}

/**
 * Parse the top-level op of the expression and describe what the two halves
 * need to evaluate to. Falls back to a generic tip if parsing fails.
 */
function strategicGoals(expr: string): string {
  const split = splitTopLevel(expr);
  if (!split) return fallbackTip(expr);
  const [left, op, right] = split;
  try {
    const lv = evaluateExpression(toAsciiExpression(left)).value;
    const rv = evaluateExpression(toAsciiExpression(right)).value;
    return `Try to make ${formatNumber(lv)} and ${formatNumber(rv)}, then ${verbFor(op)}.`;
  } catch {
    return fallbackTip(expr);
  }
}

function verbFor(op: string): string {
  switch (op) {
    case "+":
      return "add them";
    case "-":
      return "subtract the smaller";
    case "*":
    case "×":
      return "multiply them";
    case "/":
    case "÷":
      return "divide";
    default:
      return "combine them";
  }
}

function fallbackTip(expr: string): string {
  if (/[÷\/]\s*\(/.test(expr)) return "Consider dividing by a small fraction.";
  if (/[÷\/]/.test(expr)) return "Division is involved — look for exact factors.";
  return "Aim for a clean multiplication like 4 × 6 or 3 × 8.";
}

/**
 * Replace operands with dashes while keeping operators and parens. Gives a
 * visual skeleton like "__ ÷ (__ - __ ÷ __)".
 */
function toStructure(expr: string): string {
  return expr.replace(/\d+(?:\.\d+)?/g, "□");
}

/**
 * Split an expression at its lowest-precedence top-level operator.
 * Returns [leftExpr, op, rightExpr] or null if no top-level op found
 * (e.g. the whole expression is wrapped in parentheses).
 */
function splitTopLevel(expr: string): [string, string, string] | null {
  const scan = (ops: Set<string>): number => {
    let depth = 0;
    let idx = -1;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (depth === 0 && ops.has(ch)) idx = i;
    }
    return idx;
  };
  // Prefer lowest precedence + - at top level, fall back to * / × ÷.
  let at = scan(new Set(["+", "-"]));
  if (at === -1) at = scan(new Set(["*", "/", "×", "÷"]));
  if (at === -1) {
    // Entire expression is wrapped; peel one layer.
    if (expr.startsWith("(") && expr.endsWith(")")) {
      return splitTopLevel(expr.slice(1, -1).trim());
    }
    return null;
  }
  const op = expr[at];
  return [expr.slice(0, at).trim(), op, expr.slice(at + 1).trim()];
}
