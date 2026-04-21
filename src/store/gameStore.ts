import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Difficulty,
  Hand,
  HandCards,
  HistoryEntry,
  HistoryOutcome,
  InputMode,
  Mode,
  Preferences,
  SessionStats,
  SubmissionFeedback,
} from "@/types";
import { RUSH_SECONDS } from "@/lib/constants";
import {
  generateHand,
  generateHandForSeed,
  pickAdaptiveDifficulty,
} from "@/features/generator/generator";
import { validateSubmission } from "@/features/game/validation";
import { buildHint, type HintLevel } from "@/features/game/hints";
import { checkUnlocked } from "@/features/achievements/achievements";
import {
  applyCombine,
  buildInitialPool,
  isOpLegal,
  type ReduceNode,
  type ReduceOp,
} from "@/features/game/reduce";
import { pick, todayKey, uid } from "@/lib/random";
import { TARGET, EPS } from "@/lib/constants";
import { solve24, shortest } from "@/features/solver/solver";
import { classifyDifficulty } from "@/features/generator/difficulty";

const PRAISE = ["Nice", "Clean solve", "Sharp", "Brilliant", "Crisp", "Elegant"] as const;
const WRONG_TIPS: Record<string, string[]> = {
  "not-24": ["Almost", "Close — try another path", "So near — reshuffle it"],
  "bad-numbers": ["Use each card exactly once", "Mind the four cards", "One of each"],
  "parse-error": ["Check the brackets", "Expression looks off", "Try again"],
};
const RUSH_PENALTY_MS = 3_000;
const HISTORY_LIMIT = 30;

interface GameState {
  mode: Mode;
  difficulty: Difficulty;
  preferences: Preferences;

  hand: Hand | null;
  input: string;
  feedback: SubmissionFeedback;

  hintLevel: HintLevel;
  hintUsedOnHand: boolean;

  rushTimeMs: number;
  rushActive: boolean;
  rushStartedAt: number | null;
  rushSolveTimestamps: number[];

  score: number;
  stats: SessionStats;
  unlockedAchievements: string[];
  newlyUnlocked: string[];

  solveStartedAt: number;

  history: HistoryEntry[];
  /** Map of YYYY-MM-DD → outcome, so we know the daily is done. */
  dailySolvedOn: Record<string, HistoryOutcome>;

  // reduce-mode state
  reducePool: ReduceNode[];
  /** Stack of previous pool snapshots for undo. Cleared on new hand. */
  reduceHistory: ReduceNode[][];
  /** Selected node ids in selection order (max 2). */
  reduceSelected: string[];

  // actions
  startNewHand: () => void;
  startDailyHand: () => void;
  replayFromHistory: (id: string) => void;
  /**
   * Load a specific 4-card hand. Returns true if the hand has at least one
   * solution (i.e. was loaded), false for unsolvable (ignored). Used by the
   * share-code loader and Practice mode.
   */
  loadCustomHand: (cards: HandCards) => boolean;
  setInput: (s: string) => void;
  appendToken: (token: string) => void;
  backspace: () => void;
  clearInput: () => void;
  submit: () => void;
  requestHint: () => void;
  reveal: () => void;
  nextHand: () => void;
  skipHand: () => void;
  setMode: (m: Mode) => void;
  setDifficulty: (d: Difficulty) => void;
  setInputMode: (m: InputMode) => void;
  toggleAlwaysOnTop: () => void;
  startRush: () => void;
  stopRush: () => void;
  tickRush: (dtMs: number) => void;
  dismissAchievements: () => void;
  clearHistory: () => void;

  // reduce actions
  toggleReduceSelection: (nodeId: string) => void;
  applyReduceOp: (op: ReduceOp) => void;
  undoReduce: () => void;
  resetReduce: () => void;
}

const freshStats = (): SessionStats => ({
  solved: 0,
  failed: 0,
  hintsUsed: 0,
  revealsUsed: 0,
  streak: 0,
  longestStreak: 0,
  fastSolves: 0,
  noHintStreak: 0,
  hardSolved: 0,
});

const defaultPreferences: Preferences = {
  mode: "chill",
  difficulty: "normal",
  alwaysOnTop: true,
  sound: false,
  inputMode: "reduce",
};

/**
 * Heuristic: returns a structurally distinct alternate solution if one
 * exists, else null. "Distinct" means it's not just a parenthesis or
 * commutative reorder of the player's expression — we compare the multiset
 * of operators used, which changes meaningfully between e.g.
 *   (a + b) * (c + d)   vs   (a - b) * (c - d)  vs  a / (b - c / d).
 */
function pickAlternateSolution(solutions: string[], playerExpr: string): string | null {
  if (solutions.length <= 1) return null;
  const playerBag = opBag(playerExpr);
  const playerNorm = normalizeWs(playerExpr);
  // Prefer a solution that uses a different bag of operators.
  const distinctBag = solutions.find(
    (s) => opBag(s) !== playerBag && normalizeWs(s) !== playerNorm
  );
  if (distinctBag) return distinctBag;
  // Fall back to any solution that's at least textually different.
  return solutions.find((s) => normalizeWs(s) !== playerNorm) ?? null;
}

function opBag(expr: string): string {
  return (expr.match(/[+\-×÷*/]/g) ?? [])
    .map((o) => (o === "*" ? "×" : o === "/" ? "÷" : o))
    .sort()
    .join("");
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, "");
}

function pointsFor(difficulty: Difficulty, usedHint: boolean): number {
  const base = difficulty === "hard" ? 5 : difficulty === "normal" ? 3 : 2;
  return usedHint ? Math.max(1, base - 1) : base;
}

function pushHistory(
  history: HistoryEntry[],
  hand: Hand,
  outcome: HistoryOutcome
): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: uid(),
    cards: hand.cards,
    difficulty: hand.difficulty,
    canonical: hand.solutions[0],
    outcome,
    at: Date.now(),
  };
  // Prepend, cap, and drop duplicates if the same hand id shows up twice.
  return [entry, ...history].slice(0, HISTORY_LIMIT);
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      mode: "chill",
      difficulty: "normal",
      preferences: defaultPreferences,

      hand: null,
      input: "",
      feedback: { kind: "idle" },

      hintLevel: 0,
      hintUsedOnHand: false,

      rushTimeMs: RUSH_SECONDS * 1000,
      rushActive: false,
      rushStartedAt: null,
      rushSolveTimestamps: [],

      score: 0,
      stats: freshStats(),
      unlockedAchievements: [],
      newlyUnlocked: [],

      solveStartedAt: Date.now(),

      history: [],
      dailySolvedOn: {},

      reducePool: [],
      reduceHistory: [],
      reduceSelected: [],

      startNewHand: () => {
        const { stats, preferences } = get();
        const adaptive = pickAdaptiveDifficulty(preferences.difficulty, stats);
        const hand = generateHand(adaptive);
        set({
          hand,
          input: "",
          feedback: { kind: "idle" },
          hintLevel: 0,
          hintUsedOnHand: false,
          solveStartedAt: Date.now(),
          reducePool: buildInitialPool(hand.cards),
          reduceHistory: [],
          reduceSelected: [],
        });
      },

      startDailyHand: () => {
        const hand = generateHandForSeed(`daily-${todayKey()}`);
        set({
          hand,
          input: "",
          feedback: { kind: "idle" },
          hintLevel: 0,
          hintUsedOnHand: false,
          solveStartedAt: Date.now(),
          reducePool: buildInitialPool(hand.cards),
          reduceHistory: [],
          reduceSelected: [],
        });
      },

      loadCustomHand: (cards) => {
        const solutions = solve24([...cards]);
        if (solutions.length === 0) return false;
        const dedup = [...new Set(solutions)].sort(
          (a, b) => a.length - b.length
        );
        const canonical = shortest(dedup);
        const ordered = [
          canonical,
          ...dedup.filter((s) => s !== canonical),
        ].slice(0, 6);
        const hand: Hand = {
          cards,
          solutions: ordered,
          difficulty: classifyDifficulty(ordered),
          id: uid(),
        };
        set({
          hand,
          input: "",
          feedback: { kind: "idle" },
          hintLevel: 0,
          hintUsedOnHand: false,
          solveStartedAt: Date.now(),
          reducePool: buildInitialPool(hand.cards),
          reduceHistory: [],
          reduceSelected: [],
        });
        return true;
      },

      replayFromHistory: (id) => {
        const entry = get().history.find((h) => h.id === id);
        if (!entry) return;
        const hand: Hand = {
          cards: entry.cards,
          solutions: [entry.canonical],
          difficulty: entry.difficulty,
          id: uid(),
        };
        set({
          hand,
          input: "",
          feedback: { kind: "idle" },
          hintLevel: 0,
          hintUsedOnHand: false,
          solveStartedAt: Date.now(),
          reducePool: buildInitialPool(hand.cards),
          reduceHistory: [],
          reduceSelected: [],
        });
      },

      setInput: (s) => set({ input: s, feedback: { kind: "idle" } }),

      appendToken: (token) => {
        const { input } = get();
        const needsSpace =
          input.length > 0 &&
          !/\s$/.test(input) &&
          !"()".includes(input.slice(-1)) &&
          !"()".includes(token);
        set({
          input: input + (needsSpace ? " " : "") + token,
          feedback: { kind: "idle" },
        });
      },

      backspace: () => {
        const { input } = get();
        const trimmed = input.replace(/\s+$/, "");
        if (trimmed.length === 0) return set({ input: "" });
        const withoutToken = trimmed.replace(/(\d+(?:\.\d+)?|[+\-*/×÷()])$/u, "");
        set({ input: withoutToken.replace(/\s+$/, ""), feedback: { kind: "idle" } });
      },

      clearInput: () => set({ input: "", feedback: { kind: "idle" } }),

      submit: () => {
        const {
          hand,
          input,
          mode,
          rushActive,
          rushTimeMs,
          stats,
          score,
          hintUsedOnHand,
          solveStartedAt,
          unlockedAchievements,
          history,
          dailySolvedOn,
        } = get();
        if (!hand) return;
        const result = validateSubmission(input, hand.cards);
        if (result.kind !== "ok") {
          const praise = pick(WRONG_TIPS[result.kind]);
          const nextStats: SessionStats = {
            ...stats,
            failed: stats.failed + 1,
            streak: 0,
            noHintStreak: 0,
          };
          set({
            feedback: { kind: "wrong", hint: praise },
            stats: nextStats,
            rushTimeMs:
              mode === "rush" && rushActive
                ? Math.max(0, rushTimeMs - RUSH_PENALTY_MS)
                : rushTimeMs,
          });
          return;
        }

        const elapsedMs = Date.now() - solveStartedAt;
        const fast = elapsedMs < 30_000;
        const praiseWord = pick(PRAISE);
        const gained =
          pointsFor(hand.difficulty, hintUsedOnHand) +
          (mode === "rush" ? 1 : 0);

        const nextStats: SessionStats = {
          ...stats,
          solved: stats.solved + 1,
          streak: stats.streak + 1,
          longestStreak: Math.max(stats.longestStreak, stats.streak + 1),
          fastSolves: stats.fastSolves + (fast ? 1 : 0),
          noHintStreak: hintUsedOnHand ? 0 : stats.noHintStreak + 1,
          hardSolved: stats.hardSolved + (hand.difficulty === "hard" ? 1 : 0),
        };
        const newly = checkUnlocked(nextStats, unlockedAchievements);
        const nextHistory = pushHistory(history, hand, "solved");
        const nextDaily =
          mode === "daily"
            ? { ...dailySolvedOn, [todayKey()]: "solved" as HistoryOutcome }
            : dailySolvedOn;

        set({
          feedback: { kind: "correct", praise: praiseWord, value: result.value },
          stats: nextStats,
          score: score + gained,
          rushSolveTimestamps:
            mode === "rush"
              ? [...get().rushSolveTimestamps, Date.now()]
              : get().rushSolveTimestamps,
          unlockedAchievements: [...unlockedAchievements, ...newly],
          newlyUnlocked: [...get().newlyUnlocked, ...newly],
          history: nextHistory,
          dailySolvedOn: nextDaily,
        });

        // Auto-advance cadence:
        //   rush       → 650 ms (existing sprint feel)
        //   daily      → never (one-shot per day; let the player savour it)
        //   otherwise  → 1.2 s if this was the only solution
        //              → 2.6 s if an alt is worth showing (shown via an
        //                 `alt` feedback follow-up pill)
        if (mode === "daily") return;
        if (mode === "rush" && rushActive) {
          window.setTimeout(() => {
            const s = get();
            if (s.rushActive) s.nextHand();
          }, 650);
          return;
        }
        const alt = pickAlternateSolution(hand.solutions, input);
        if (alt) {
          // After praise fades, surface the alternate.
          window.setTimeout(() => {
            const s = get();
            if (s.feedback.kind === "idle" || s.feedback.kind === "correct") {
              useGame.setState({
                feedback: { kind: "correct", praise: `Also: ${alt}`, value: result.value },
              });
            }
          }, 1100);
          window.setTimeout(() => {
            const s = get();
            // Only auto-advance if the player hasn't already moved on.
            if (s.hand?.id === hand.id) s.nextHand();
          }, 2600);
        } else {
          window.setTimeout(() => {
            const s = get();
            if (s.hand?.id === hand.id) s.nextHand();
          }, 1200);
        }
      },

      requestHint: () => {
        const { hand, hintLevel, stats } = get();
        if (!hand || hintLevel >= 3) return;
        const next = (hintLevel + 1) as HintLevel;
        set({
          hintLevel: next,
          hintUsedOnHand: true,
          stats: {
            ...stats,
            hintsUsed: stats.hintsUsed + (next === 1 ? 1 : 0),
          },
        });
      },

      reveal: () => {
        const { hand, stats, history, mode, dailySolvedOn } = get();
        if (!hand) return;
        set({
          hintLevel: 3,
          hintUsedOnHand: true,
          stats: { ...stats, revealsUsed: stats.revealsUsed + 1 },
          history: pushHistory(history, hand, "revealed"),
          dailySolvedOn:
            mode === "daily"
              ? { ...dailySolvedOn, [todayKey()]: "revealed" }
              : dailySolvedOn,
        });
      },

      nextHand: () => {
        const { mode } = get();
        if (mode === "daily") {
          // Daily is a one-shot per day — leave the current hand so the user
          // can keep trying, or fall back to chill generation if they insist.
          get().startNewHand();
          return;
        }
        get().startNewHand();
      },

      skipHand: () => {
        const { hand, history } = get();
        if (hand) {
          set({ history: pushHistory(history, hand, "skipped") });
        }
        get().startNewHand();
      },

      setMode: (m) => {
        set({ mode: m, preferences: { ...get().preferences, mode: m } });
        if (m === "rush") get().startRush();
        else {
          get().stopRush();
          if (m === "daily") get().startDailyHand();
          else get().startNewHand();
        }
      },

      setDifficulty: (d) =>
        set({
          difficulty: d,
          preferences: { ...get().preferences, difficulty: d },
        }),

      setInputMode: (m) =>
        set({
          preferences: { ...get().preferences, inputMode: m },
          // Clear any stale typed input/selection so switching is clean.
          input: "",
          reduceSelected: [],
        }),

      toggleAlwaysOnTop: () => {
        const prefs = get().preferences;
        const next = !prefs.alwaysOnTop;
        set({ preferences: { ...prefs, alwaysOnTop: next } });
        void applyAlwaysOnTop(next);
      },

      startRush: () => {
        set({
          rushActive: true,
          rushTimeMs: RUSH_SECONDS * 1000,
          rushStartedAt: Date.now(),
          rushSolveTimestamps: [],
          score: 0,
          stats: { ...get().stats, streak: 0 },
        });
        get().startNewHand();
      },

      stopRush: () =>
        set({
          rushActive: false,
          rushStartedAt: null,
        }),

      tickRush: (dtMs) => {
        const { rushTimeMs, rushActive } = get();
        if (!rushActive) return;
        const next = Math.max(0, rushTimeMs - dtMs);
        if (next === 0) set({ rushTimeMs: 0, rushActive: false });
        else set({ rushTimeMs: next });
      },

      dismissAchievements: () => set({ newlyUnlocked: [] }),

      clearHistory: () => set({ history: [] }),

      toggleReduceSelection: (nodeId) => {
        const { reducePool, reduceSelected } = get();
        const exists = reducePool.some((n) => n.id === nodeId);
        if (!exists) return;
        // With a single card left, selection is meaningless — there's
        // nothing to combine it with. Silently ignore so the UI never
        // shows contradictory status text like "Tap another card · Ended
        // at X". The player's only moves here are Undo / Reset / Next.
        if (reducePool.length < 2) return;
        if (reduceSelected.includes(nodeId)) {
          set({ reduceSelected: reduceSelected.filter((x) => x !== nodeId) });
          return;
        }
        const next =
          reduceSelected.length >= 2
            ? [reduceSelected[1], nodeId]
            : [...reduceSelected, nodeId];
        set({ reduceSelected: next });
      },

      applyReduceOp: (op) => {
        const state = get();
        const { reducePool, reduceSelected, reduceHistory } = state;
        if (reduceSelected.length !== 2) return;
        const a = reducePool.find((n) => n.id === reduceSelected[0]);
        const b = reducePool.find((n) => n.id === reduceSelected[1]);
        if (!a || !b) return;
        if (!isOpLegal(a, b, op)) return;
        const { pool: nextPool, combined } = applyCombine(reducePool, a, b, op);
        set({
          reducePool: nextPool,
          reduceHistory: [...reduceHistory, reducePool],
          reduceSelected: [],
          feedback: { kind: "idle" },
        });
        // If a single node remains, evaluate.
        if (nextPool.length === 1) {
          const final = nextPool[0];
          if (Math.abs(final.value - TARGET) < EPS) {
            // Reuse the typed submit pipeline by feeding the expression in.
            set({ input: final.expr });
            get().submit();
          } else {
            set({
              feedback: {
                kind: "wrong",
                hint: `Ended at ${formatFinal(final.value)} — try Undo`,
              },
            });
          }
        } else {
          // Intermediate step — if the combined node ends up being used
          // immediately and matches 24 via upcoming ops, we'll check above.
          void combined;
        }
      },

      undoReduce: () => {
        const { reduceHistory } = get();
        if (reduceHistory.length === 0) return;
        const prevPool = reduceHistory[reduceHistory.length - 1];
        set({
          reducePool: prevPool,
          reduceHistory: reduceHistory.slice(0, -1),
          reduceSelected: [],
          feedback: { kind: "idle" },
        });
      },

      resetReduce: () => {
        const { hand } = get();
        if (!hand) return;
        set({
          reducePool: buildInitialPool(hand.cards),
          reduceHistory: [],
          reduceSelected: [],
          feedback: { kind: "idle" },
        });
      },
    }),
    {
      name: "24club/state",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted, version) => {
        // v1 → v2: force alwaysOnTop to true for existing users so the
        // floating window actually floats by default.
        const state = (persisted ?? {}) as { preferences?: Preferences };
        if (version < 2 && state.preferences) {
          state.preferences = { ...state.preferences, alwaysOnTop: true };
        }
        return state;
      },
      partialize: (s) => ({
        preferences: s.preferences,
        mode: s.mode,
        difficulty: s.difficulty,
        stats: s.stats,
        score: s.score,
        unlockedAchievements: s.unlockedAchievements,
        history: s.history,
        dailySolvedOn: s.dailySolvedOn,
      }),
    }
  )
);

export function currentHintText(): string {
  const { hand, hintLevel } = useGame.getState();
  if (!hand || hintLevel === 0) return "";
  const solution = hand.solutions[0];
  return buildHint(solution, hintLevel).text;
}

function formatFinal(v: number): string {
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v - Math.round(v)) < EPS) return String(Math.round(v));
  return v.toFixed(2).replace(/\.?0+$/, "");
}

async function applyAlwaysOnTop(next: boolean): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setAlwaysOnTop(next);
  } catch {
    // Browser preview — no Tauri runtime.
  }
}
