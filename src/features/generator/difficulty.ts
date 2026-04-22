import type { Difficulty } from "@/types";
import type { DetailedSolution } from "@/features/solver/solver";

/**
 * Classify a hand's difficulty from its (detailed) solution set.
 *
 * - Easy: at least one pure + − × solution (no division — trivially integer).
 * - Normal: no pure solution, but at least one solution whose every
 *   intermediate value stays an integer (division must divide evenly).
 * - Hard: every solution passes through a fractional intermediate.
 */
export function classifyDifficulty(
  solutions: DetailedSolution[]
): Difficulty {
  if (solutions.length === 0) return "hard";
  const hasPure = solutions.some((s) => !/[÷\/]/.test(s.expr));
  if (hasPure) return "easy";
  const hasIntegerOnly = solutions.some((s) => s.allInt);
  return hasIntegerOnly ? "normal" : "hard";
}
