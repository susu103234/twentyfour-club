import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useGame } from "@/store/gameStore";

/**
 * Floating pill that shows praise on correct and a soft nudge on wrong.
 * Auto-dismisses. Colors are deliberately restrained — ivory for correct,
 * neutral for wrong. No red.
 */
export function FeedbackToast() {
  const feedback = useGame((s) => s.feedback);
  const setState = useGame.setState;

  useEffect(() => {
    if (feedback.kind === "idle") return;
    const t = window.setTimeout(
      () => setState({ feedback: { kind: "idle" } }),
      feedback.kind === "correct" ? 900 : 1400
    );
    return () => clearTimeout(t);
  }, [feedback, setState]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center z-10">
      <AnimatePresence>
        {feedback.kind !== "idle" && (
          <motion.div
            key={feedback.kind + ("praise" in feedback ? feedback.praise : feedback.hint)}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className={
              "rounded-full px-3 py-1 text-sm font-medium backdrop-blur-md " +
              (feedback.kind === "correct"
                ? "text-glow-300"
                : "text-ink-200")
            }
            style={
              feedback.kind === "correct"
                ? {
                    background: "rgba(232,217,160,0.08)",
                    border: "1px solid rgba(232,217,160,0.22)",
                    boxShadow: "0 4px 18px rgba(232,217,160,0.18)",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }
            }
          >
            {feedback.kind === "correct" ? feedback.praise : feedback.hint}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
