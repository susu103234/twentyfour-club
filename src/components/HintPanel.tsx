import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { buildHint } from "@/features/game/hints";

export function HintPanel() {
  const hand = useGame((s) => s.hand);
  const level = useGame((s) => s.hintLevel);

  if (!hand || level === 0) return null;
  const hint = buildHint(hand.solutions[0], level);

  return (
    <AnimatePresence>
      <motion.div
        key={`${hand.id}-${level}`}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="rounded-lg px-3 py-2 text-xs font-mono text-accent-300"
        style={{
          background: "rgba(159,179,255,0.08)",
          border: "1px solid rgba(159,179,255,0.22)",
        }}
      >
        {hint.text}
      </motion.div>
    </AnimatePresence>
  );
}
