import type { Achievement, SessionStats } from "@/types";

export interface AchievementDef extends Achievement {
  unlocked: (stats: SessionStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-solve",
    title: "First solve",
    hint: "Clear your very first hand.",
    unlocked: (s) => s.solved >= 1,
  },
  {
    id: "streak-5",
    title: "On a roll",
    hint: "Five solves in a row.",
    unlocked: (s) => s.longestStreak >= 5,
  },
  {
    id: "solved-10",
    title: "Regular",
    hint: "Solve ten hands in a session.",
    unlocked: (s) => s.solved >= 10,
  },
  {
    id: "first-hard",
    title: "Sharp mind",
    hint: "Clear a hard hand.",
    unlocked: (s) => s.hardSolved >= 1,
  },
  {
    id: "fast-three",
    title: "Quick hands",
    hint: "Three solves under 30 s each.",
    unlocked: (s) => s.fastSolves >= 3,
  },
  {
    id: "clean-five",
    title: "Clean solve",
    hint: "Five hands in a row without hints.",
    unlocked: (s) => s.noHintStreak >= 5,
  },
];
