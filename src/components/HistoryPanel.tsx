import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import type { HistoryOutcome } from "@/types";

const outcomeStyle: Record<HistoryOutcome, { label: string; ring: string }> = {
  solved: { label: "solved", ring: "rgba(232,217,160,0.28)" },
  revealed: { label: "revealed", ring: "rgba(159,179,255,0.28)" },
  skipped: { label: "skipped", ring: "rgba(255,255,255,0.08)" },
};

/**
 * A scrollable list of recent hands. Tap any entry to replay it — the
 * solver gives you the canonical solution stored with the entry, so the
 * player can study an expression they missed before.
 */
export function HistoryPanel() {
  const open = useUi((s) => s.historyOpen);
  const close = useUi((s) => s.toggleHistory);
  const history = useGame((s) => s.history);
  const replay = useGame((s) => s.replayFromHistory);
  const clear = useGame((s) => s.clearHistory);

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
              <div className="text-sm font-medium text-ink-50">Recent hands</div>
              <div className="flex items-center gap-1">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clear}
                    className="btn-ghost !py-1 !px-2 text-[11px]"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="btn-ghost !py-1 !px-2 text-[11px]"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="divider" />

            {history.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-ink-400 text-xs">
                No hands yet — play a few rounds.
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                {history.map((h) => {
                  const style = outcomeStyle[h.outcome];
                  return (
                    <li
                      key={h.id}
                      className="rounded-lg px-3 py-2 flex items-center gap-3 transition-colors hover:bg-white/4"
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: `1px solid ${style.ring}`,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {h.cards.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center justify-center w-6 h-8 rounded-[5px] text-[11px] text-ink-100"
                            style={{
                              background:
                                "linear-gradient(180deg, rgba(58,58,68,0.85), rgba(28,28,34,0.85))",
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className="text-[11px] text-ink-400 uppercase tracking-wider">
                          {style.label} · {h.difficulty}
                        </span>
                        <span className="text-xs font-mono text-ink-200 truncate max-w-[140px]">
                          {h.canonical}
                        </span>
                      </div>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => {
                          replay(h.id);
                          close();
                        }}
                        className="btn-ghost !py-1 !px-2 text-[11px]"
                      >
                        Replay
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
