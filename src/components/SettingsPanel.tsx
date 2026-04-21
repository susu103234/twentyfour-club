import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import type { Difficulty, InputMode } from "@/types";

export function SettingsPanel() {
  const open = useUi((s) => s.settingsOpen);
  const close = useUi((s) => s.toggleSettings);
  const difficulty = useGame((s) => s.preferences.difficulty);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const alwaysOnTop = useGame((s) => s.preferences.alwaysOnTop);
  const toggleOnTop = useGame((s) => s.toggleAlwaysOnTop);
  const inputMode = useGame((s) => s.preferences.inputMode);
  const setInputMode = useGame((s) => s.setInputMode);

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
            className="m-3 flex-1 glass glass-hi rounded-2xl p-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-ink-50">Settings</div>
              <button
                type="button"
                onClick={close}
                className="btn-ghost !py-1 !px-2 text-xs"
              >
                Close
              </button>
            </div>

            <div className="divider" />

            <Section label="Input">
              <div className="inline-flex rounded-lg bg-white/5 border border-white/8 p-0.5 text-xs">
                {(
                  [
                    { id: "reduce", label: "Reduce" },
                    { id: "typed", label: "Typed" },
                  ] as { id: InputMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setInputMode(m.id)}
                    className={
                      "px-3 py-1 rounded-md transition-colors " +
                      (inputMode === m.id
                        ? "bg-white/10 text-ink-50"
                        : "text-ink-400 hover:text-ink-100")
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-400 mt-1">
                Reduce: tap two cards, pick an op, they collapse. No brackets.
              </p>
            </Section>

            <Section label="Difficulty">
              <div className="inline-flex rounded-lg bg-white/5 border border-white/8 p-0.5 text-xs">
                {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={
                      "px-3 py-1 rounded-md capitalize transition-colors " +
                      (difficulty === d
                        ? "bg-white/10 text-ink-50"
                        : "text-ink-400 hover:text-ink-100")
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-400 mt-1">
                Adaptive selection still runs; this is your baseline.
              </p>
            </Section>

            <Section label="Floating">
              <label className="flex items-center gap-2 text-sm text-ink-100">
                <input
                  type="checkbox"
                  checked={alwaysOnTop}
                  onChange={toggleOnTop}
                  className="accent-accent-500"
                />
                Always on top
              </label>
            </Section>

            <div className="mt-auto text-[10px] text-ink-400/80 tracking-wide">
              Local session · no account · no telemetry
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
