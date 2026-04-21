export type Difficulty = "easy" | "normal" | "hard";

export type Mode = "chill" | "rush" | "daily";

export type HistoryOutcome = "solved" | "revealed" | "skipped";

export interface HistoryEntry {
  id: string;
  cards: HandCards;
  difficulty: Difficulty;
  canonical: string;
  outcome: HistoryOutcome;
  at: number;
}

export type HandCards = readonly [number, number, number, number];

export interface Hand {
  cards: HandCards;
  /** Canonical solutions produced by the solver. At least one. */
  solutions: string[];
  difficulty: Difficulty;
  /** Stable id so React can key transitions. */
  id: string;
}

export type SubmissionFeedback =
  | { kind: "idle" }
  | { kind: "correct"; praise: string; value: number }
  | { kind: "wrong"; hint: string };

export interface SessionStats {
  solved: number;
  failed: number;
  hintsUsed: number;
  revealsUsed: number;
  streak: number;
  longestStreak: number;
  fastSolves: number;
  noHintStreak: number;
  hardSolved: number;
}

export type InputMode = "reduce" | "typed";

export interface Preferences {
  mode: Mode;
  difficulty: Difficulty;
  alwaysOnTop: boolean;
  sound: boolean;
  inputMode: InputMode;
}

export interface Achievement {
  id: string;
  title: string;
  hint: string;
}
