import { HAND_SIZE } from "@/lib/constants";
import { pick, randInt, setSeed, shuffled, uid } from "@/lib/random";
import { shortest, solve24 } from "@/features/solver/solver";
import type { Difficulty, Hand, HandCards, SessionStats } from "@/types";
import { classifyDifficulty } from "./difficulty";

const MAX_ATTEMPTS = 400;

/**
 * Draw four integers in [1..13] and verify a solution exists. Rejects
 * unsolvable hands and filters by difficulty classification. Gives up
 * after MAX_ATTEMPTS and loosens the filter so the game never stalls.
 */
export function generateHand(difficulty: Difficulty): Hand {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cards = drawCards();
    const solutions = solve24([...cards]);
    if (solutions.length === 0) continue;
    const actual = classifyDifficulty(solutions);
    if (actual === difficulty) {
      return makeHand(cards, solutions, difficulty);
    }
  }
  while (true) {
    const cards = drawCards();
    const solutions = solve24([...cards]);
    if (solutions.length > 0) {
      return makeHand(cards, solutions, classifyDifficulty(solutions));
    }
  }
}

/**
 * Deterministic hand for a given seed. Same seed → same cards → same hand.
 * Used by the daily mode so everyone playing on the same local day sees the
 * same puzzle without any network or server.
 */
export function generateHandForSeed(seed: string): Hand {
  setSeed(seed);
  try {
    const cards = drawCards();
    const solutions = solve24([...cards]);
    if (solutions.length > 0) {
      return makeHand(cards, solutions, classifyDifficulty(solutions));
    }
    // On the rare chance the seed draws an unsolvable, salt it and retry.
    for (let i = 1; i < 20; i++) {
      setSeed(`${seed}#${i}`);
      const cs = drawCards();
      const s = solve24([...cs]);
      if (s.length > 0) {
        return makeHand(cs, s, classifyDifficulty(s));
      }
    }
    // Fallback — break determinism rather than loop forever.
    setSeed(null);
    return generateHand("normal");
  } finally {
    setSeed(null);
  }
}

function drawCards(): HandCards {
  const values: number[] = [];
  for (let i = 0; i < HAND_SIZE; i++) values.push(randInt(1, 13));
  const arr = shuffled(values);
  return [arr[0], arr[1], arr[2], arr[3]] as const;
}

function makeHand(
  cards: HandCards,
  solutions: string[],
  difficulty: Difficulty
): Hand {
  const sorted = [...new Set(solutions)].sort((a, b) => a.length - b.length);
  const canonical = shortest(sorted);
  const ordered = [canonical, ...sorted.filter((s) => s !== canonical)].slice(
    0,
    6
  );
  return {
    cards,
    solutions: ordered,
    difficulty,
    id: uid(),
  };
}

export function pickAdaptiveDifficulty(
  preferred: Difficulty,
  stats: SessionStats
): Difficulty {
  const solveRate =
    stats.solved + stats.failed === 0
      ? 0.5
      : stats.solved / (stats.solved + stats.failed);
  const usingHints = stats.hintsUsed + stats.revealsUsed > stats.solved * 0.6;

  if (stats.streak >= 4 && solveRate > 0.7 && !usingHints) {
    return stepUp(preferred);
  }
  if (stats.failed >= 3 && solveRate < 0.4) {
    return stepDown(preferred);
  }
  if (Math.random() < 0.15) {
    return pick(["easy", "normal", "hard"] as const);
  }
  return preferred;
}

function stepUp(d: Difficulty): Difficulty {
  if (d === "easy") return "normal";
  if (d === "normal") return "hard";
  return "hard";
}

function stepDown(d: Difficulty): Difficulty {
  if (d === "hard") return "normal";
  if (d === "normal") return "easy";
  return "easy";
}
