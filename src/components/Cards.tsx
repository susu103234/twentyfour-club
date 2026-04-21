import { useMemo } from "react";
import { useGame } from "@/store/gameStore";
import { evaluateExpression } from "@/features/game/expression";
import { Card } from "./Card";

/**
 * Renders the four cards for the current hand. Tapping a card appends its
 * value to the expression input. Cards fully consumed by the current input
 * fade to the "used" state so the player sees what's left.
 */
export function Cards() {
  const hand = useGame((s) => s.hand);
  const input = useGame((s) => s.input);
  const append = useGame((s) => s.appendToken);

  const used = useMemo(() => usedCounts(input), [input]);

  if (!hand) return null;

  const remaining: Record<number, number> = {};
  for (const c of hand.cards) remaining[c] = (remaining[c] ?? 0) + 1;
  for (const [v, count] of Object.entries(used)) {
    const n = Number(v);
    if (remaining[n] !== undefined) remaining[n] = Math.max(0, remaining[n] - count);
  }
  const seen: Record<number, number> = {};

  return (
    <div className="grid grid-cols-4 gap-2.5">
      {hand.cards.map((c, idx) => {
        seen[c] = (seen[c] ?? 0) + 1;
        const isUsed = seen[c] > remaining[c];
        return (
          <Card
            key={`${hand.id}-${idx}`}
            value={c}
            used={isUsed}
            onClick={() => append(String(c))}
          />
        );
      })}
    </div>
  );
}

function usedCounts(input: string): Record<number, number> {
  const out: Record<number, number> = {};
  try {
    const { numbers } = evaluateExpression(input);
    for (const n of numbers) out[n] = (out[n] ?? 0) + 1;
    return out;
  } catch {
    const matches = input.match(/\d+(?:\.\d+)?/g) ?? [];
    for (const m of matches) {
      const n = Number(m);
      out[n] = (out[n] ?? 0) + 1;
    }
    return out;
  }
}
