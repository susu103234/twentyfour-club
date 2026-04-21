import { EPS, TARGET } from "@/lib/constants";
import { evaluateExpression, ParseError } from "./expression";

export type ValidationResult =
  | { kind: "ok"; value: number }
  | { kind: "not-24"; value: number }
  | { kind: "bad-numbers"; used: number[]; expected: number[] }
  | { kind: "parse-error"; message: string };

function multisetEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, idx) => v === sb[idx]);
}

export function validateSubmission(
  expression: string,
  hand: readonly number[]
): ValidationResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { kind: "parse-error", message: "Empty expression" };
  }
  try {
    const { value, numbers } = evaluateExpression(trimmed);
    if (!multisetEqual(numbers, [...hand])) {
      return {
        kind: "bad-numbers",
        used: numbers,
        expected: [...hand],
      };
    }
    if (Math.abs(value - TARGET) < EPS) {
      return { kind: "ok", value };
    }
    return { kind: "not-24", value };
  } catch (err) {
    const message = err instanceof ParseError ? err.message : "Invalid expression";
    return { kind: "parse-error", message };
  }
}
