import type { SessionStats } from "@/types";
import { ACHIEVEMENTS } from "./definitions";

export function checkUnlocked(
  stats: SessionStats,
  already: readonly string[]
): string[] {
  const unlocked = new Set(already);
  const newly: string[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (unlocked.has(ach.id)) continue;
    if (ach.unlocked(stats)) newly.push(ach.id);
  }
  return newly;
}

export function getAchievement(id: string) {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
