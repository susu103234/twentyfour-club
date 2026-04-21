import type { Difficulty } from "@/types";

/**
 * Classify a hand's difficulty from the set of its solutions.
 *
 * - Easy: at least one pure + - × solution (no division).
 * - Normal: every solution uses division or has to nest ≥ 2 levels.
 * - Hard: every solution involves a fractional intermediate
 *   (i.e. contains a '÷' where the right operand is a grouped expression).
 */
export function classifyDifficulty(solutions: string[]): Difficulty {
  if (solutions.length === 0) return "hard";
  const hasPure = solutions.some((s) => !/[÷\/]/.test(s));
  if (hasPure) return "easy";
  const everyFractional = solutions.every(fractionalSolution);
  return everyFractional ? "hard" : "normal";
}

function fractionalSolution(expr: string): boolean {
  // Treat as "fractional" if there's a division whose right-hand side
  // is a parenthesised sub-expression — classic 24-game hard shapes
  // like 6 ÷ (1 - 3/4) or 3 ÷ (1 - 5/8).
  return /[÷\/]\s*\(/.test(expr);
}
