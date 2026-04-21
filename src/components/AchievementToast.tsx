import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useGame } from "@/store/gameStore";
import { getAchievement } from "@/features/achievements/achievements";

export function AchievementToast() {
  const newly = useGame((s) => s.newlyUnlocked);
  const dismiss = useGame((s) => s.dismissAchievements);

  useEffect(() => {
    if (newly.length === 0) return;
    const t = window.setTimeout(dismiss, 2600);
    return () => clearTimeout(t);
  }, [newly, dismiss]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center z-30">
      <AnimatePresence>
        {newly.length > 0 && (
          <motion.div
            key={newly.join(",")}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="pointer-events-auto glass glass-hi rounded-xl px-3 py-2 flex items-center gap-3 max-w-[90%]"
          >
            <span className="text-accent-400 text-sm">●</span>
            <div className="flex flex-col leading-tight">
              <div className="text-[10px] uppercase tracking-widest text-ink-400">
                Unlocked
              </div>
              <div className="text-[13px] text-ink-50">
                {newly
                  .map((id) => getAchievement(id)?.title ?? id)
                  .join(" · ")}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
