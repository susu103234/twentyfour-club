import { describe, it, expect } from "vitest";
import { solve24, shortest } from "./solver";
import { evaluateExpression } from "@/features/game/expression";
import { TARGET, EPS } from "@/lib/constants";

function allSolutionsEvaluateTo24(cards: number[]) {
  const sols = solve24(cards);
  for (const s of sols) {
    const { value, numbers } = evaluateExpression(s);
    expect(Math.abs(value - TARGET)).toBeLessThan(EPS);
    expect([...numbers].sort()).toEqual([...cards].sort());
  }
  return sols;
}

describe("solve24", () => {
  it("finds solutions for canonical 24 hands", () => {
    expect(solve24([6, 6, 6, 6]).length).toBeGreaterThan(0);
    expect(solve24([8, 8, 3, 3]).length).toBeGreaterThan(0);
    expect(solve24([1, 5, 5, 5]).length).toBeGreaterThan(0);
    expect(solve24([3, 3, 7, 7]).length).toBeGreaterThan(0);
  });

  it("returns no solutions for unsolvable hands", () => {
    expect(solve24([1, 1, 1, 1])).toEqual([]);
    expect(solve24([2, 2, 2, 2])).toEqual([]);
  });

  it("every returned expression actually equals 24 and uses exactly the given cards", () => {
    allSolutionsEvaluateTo24([6, 1, 3, 4]);
    allSolutionsEvaluateTo24([5, 5, 5, 1]);
    allSolutionsEvaluateTo24([8, 3, 8, 3]);
  });

  it("handles division-dependent hands without crashing", () => {
    // 3 3 7 7 → 7 × (3 + 3/7) = 24, requires division that doesn't produce int mid-way
    const sols = solve24([3, 3, 7, 7]);
    expect(sols.length).toBeGreaterThan(0);
  });
});

describe("shortest", () => {
  it("picks the textually shortest expression", () => {
    const picks = ["((1 + 2) × 3) + 15", "1 + 23"];
    expect(shortest(picks)).toBe("1 + 23");
  });
});
