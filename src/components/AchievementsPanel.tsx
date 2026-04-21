import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import { ACHIEVEMENTS } from "@/features/achievements/definitions";

export function AchievementsPanel() {
  const open = useUi((s) => s.achievementsOpen);
  const close = useUi((s) => s.toggleAchievements);
  const unlocked = useGame((s) => s.unlockedAchievements);
  const stats = useGame((s) => s.stats);

  const set = new Set(unlocked);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-20 flex items-stretch"
          onClick={close}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="m-3 flex-1 glass glass-hi rounded-2xl p-4 flex flex-col gap-3 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-ink-50">Achievements</div>
              <button
                type="button"
                onClick={close}
                className="btn-ghost !py-1 !px-2 text-xs"
              >
                Close
              </button>
            </div>
            <div className="divider" />
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Solved" value={stats.solved} />
              <Mini label="Longest streak" value={stats.longestStreak} />
              <Mini label="Hints used" value={stats.hintsUsed} />
              <Mini label="Hard solves" value={stats.hardSolved} />
            </div>
            <div className="divider" />
            <ul className="flex flex-col gap-1.5">
              {ACHIEVEMENTS.map((a) => {
                const got = set.has(a.id);
                return (
                  <li
                    key={a.id}
                    className={
                      "rounded-lg px-3 py-2 border text-sm flex items-start gap-3 " +
                      (got
                        ? "border-accent-500/30 bg-accent-500/10"
                        : "border-white/8 bg-white/3 opacity-70")
                    }
                  >
                    <span className={got ? "text-accent-400" : "text-ink-400"}>
                      {got ? "●" : "○"}
                    </span>
                    <div>
                      <div className="text-ink-50 text-[13px] leading-tight">
                        {a.title}
                      </div>
                      <div className="text-ink-400 text-[11px]">{a.hint}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/3 border border-white/8 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-ink-400">
        {label}
      </div>
      <div className="text-lg font-mono text-ink-50">{value}</div>
    </div>
  );
}
