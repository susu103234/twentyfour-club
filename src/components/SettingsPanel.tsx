import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import { encodeHand, decodeHand } from "@/features/share/seedCode";
import type { Difficulty, HandCards, InputMode } from "@/types";

export function SettingsPanel() {
  const open = useUi((s) => s.settingsOpen);
  const close = useUi((s) => s.toggleSettings);
  const difficulty = useGame((s) => s.preferences.difficulty);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const alwaysOnTop = useGame((s) => s.preferences.alwaysOnTop);
  const toggleOnTop = useGame((s) => s.toggleAlwaysOnTop);
  const inputMode = useGame((s) => s.preferences.inputMode);
  const setInputMode = useGame((s) => s.setInputMode);
  const bubbleDrag = useGame((s) => s.preferences.bubbleDrag);
  const toggleBubbleDrag = useGame((s) => s.toggleBubbleDrag);
  const hand = useGame((s) => s.hand);
  const loadCustomHand = useGame((s) => s.loadCustomHand);

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
              {inputMode === "reduce" && (
                <label className="flex items-center gap-2 text-sm text-ink-100 mt-2">
                  <input
                    type="checkbox"
                    checked={bubbleDrag}
                    onChange={toggleBubbleDrag}
                    className="accent-accent-500"
                  />
                  Drag bubbles to merge
                </label>
              )}
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

            <Section label="Share hand">
              <ShareRow cards={hand?.cards ?? null} />
            </Section>

            <Section label="Load / Practice">
              <LoadRow
                onLoad={(cards) => {
                  const ok = loadCustomHand(cards);
                  if (ok) close();
                  return ok;
                }}
              />
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

function ShareRow({ cards }: { cards: HandCards | null }) {
  const [copied, setCopied] = useState(false);
  if (!cards) {
    return (
      <p className="text-[11px] text-ink-400">No active hand yet.</p>
    );
  }
  const code = encodeHand(cards);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be denied in older WebViews — no-op; user can read the
      // code directly from the pill below.
    }
  };
  return (
    <div className="flex items-center gap-2">
      <code className="px-2 py-1 rounded-md bg-white/5 border border-white/8 text-[12px] font-mono tracking-[0.18em] text-ink-50">
        {code}
      </code>
      <button type="button" onClick={onCopy} className="btn-ghost !py-1 !px-2 text-xs">
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

function LoadRow({ onLoad }: { onLoad: (cards: HandCards) => boolean }) {
  const [mode, setMode] = useState<"code" | "manual">("code");
  const [code, setCode] = useState("");
  const [manual, setManual] = useState<[string, string, string, string]>([
    "",
    "",
    "",
    "",
  ]);
  const [error, setError] = useState<string | null>(null);

  const submitCode = () => {
    setError(null);
    const cards = decodeHand(code);
    if (!cards) {
      setError("Invalid code");
      return;
    }
    if (!onLoad(cards)) setError("No solution for that hand");
  };

  const submitManual = () => {
    setError(null);
    const nums = manual.map((s) => parseInt(s.trim(), 10));
    if (nums.some((n) => !Number.isFinite(n) || n < 1 || n > 13)) {
      setError("Each card must be 1–13");
      return;
    }
    const cards: HandCards = [nums[0], nums[1], nums[2], nums[3]];
    if (!onLoad(cards)) setError("No way to make 24 from those");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex rounded-lg bg-white/5 border border-white/8 p-0.5 text-xs self-start">
        {(
          [
            { id: "code", label: "Share code" },
            { id: "manual", label: "Practice" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMode(m.id);
              setError(null);
            }}
            className={
              "px-3 py-1 rounded-md transition-colors " +
              (mode === m.id
                ? "bg-white/10 text-ink-50"
                : "text-ink-400 hover:text-ink-100")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "code" ? (
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCode()}
            placeholder="ABCD-EF"
            spellCheck={false}
            autoComplete="off"
            maxLength={8}
            className="flex-1 px-2 py-1 rounded-md bg-white/5 border border-white/8 text-[12px] font-mono tracking-[0.16em] text-ink-50 outline-none uppercase placeholder:text-ink-400/50"
          />
          <button
            type="button"
            onClick={submitCode}
            disabled={code.trim().length < 5}
            className="btn-ghost !py-1 !px-2 text-xs disabled:opacity-40"
          >
            Load
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              value={manual[i]}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                setManual((prev) => {
                  const n = [...prev] as [string, string, string, string];
                  n[i] = v;
                  return n;
                });
              }}
              onKeyDown={(e) => e.key === "Enter" && submitManual()}
              inputMode="numeric"
              maxLength={2}
              placeholder="—"
              className="w-10 py-1 text-center rounded-md bg-white/5 border border-white/8 text-[13px] font-mono text-ink-50 outline-none placeholder:text-ink-400/50"
            />
          ))}
          <button
            type="button"
            onClick={submitManual}
            disabled={manual.some((x) => x.trim() === "")}
            className="btn-ghost !py-1 !px-2 text-xs disabled:opacity-40"
          >
            Play
          </button>
        </div>
      )}

      {error ? (
        <p className="text-[11px] text-red-300">{error}</p>
      ) : (
        <p className="text-[11px] text-ink-400">
          {mode === "code"
            ? "Paste a 6-char code a friend sent you."
            : "Pick any four cards (1–13). Must have a solution."}
        </p>
      )}
    </div>
  );
}
