import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";

/**
 * Lists every canonical solution the solver found for the current hand.
 * Opened from the title bar (∑ icon). Non-destructive — doesn't mutate
 * anything, just exposes what the solver already knew. Useful for learners
 * and for inspecting a hand after a reveal.
 */
export function SolutionsPanel() {
  const open = useUi((s) => s.solutionsOpen);
  const close = useUi((s) => s.toggleSolutions);
  const hand = useGame((s) => s.hand);

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
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="m-3 flex-1 glass glass-hi rounded-2xl p-4 flex flex-col gap-3 min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-ink-50">
                All solutions
                {hand ? (
                  <span className="text-[11px] text-ink-400 font-normal ml-2">
                    {hand.cards.join(" · ")}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="btn-ghost !py-1 !px-2 text-[11px]"
              >
                Close
              </button>
            </div>

            <div className="divider" />

            {!hand ? (
              <div className="flex-1 flex items-center justify-center text-ink-400 text-xs">
                No active hand.
              </div>
            ) : hand.solutions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-ink-400 text-xs">
                No solution found (shouldn't happen — report this).
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                {hand.solutions.map((expr, i) => (
                  <li
                    key={`${i}-${expr}`}
                    className="rounded-lg px-3 py-2 flex items-center gap-3"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span className="text-[10px] font-mono text-ink-400 w-4 text-right">
                      {i + 1}
                    </span>
                    <span className="text-sm font-mono text-ink-100">
                      {expr}
                    </span>
                    <div className="flex-1" />
                    <span className="text-[10px] text-ink-400 tracking-widest">
                      = 24
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[11px] text-ink-400">
              Listed shortest-first, capped at 6. Different operator bags count
              as different solutions — reorderings of the same expression do
              not.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
