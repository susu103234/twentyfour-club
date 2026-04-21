import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import { formatNumber, formatTime } from "@/lib/format";
import { isOpLegal, type ReduceNode, type ReduceOp } from "@/features/game/reduce";

/**
 * Interactive collapsed strip.
 *
 * In reduce mode each mini-card is tappable — the same selection + combine
 * flow as the expanded board works here. When two cards are selected the
 * operator chips appear in place of the score readout so the window stays
 * at one row. In typed mode the strip is read-only; tapping any card
 * expands the window so the player can type.
 */
export function CollapsedView() {
  const hand = useGame((s) => s.hand);
  const startNewHand = useGame((s) => s.startNewHand);
  const score = useGame((s) => s.score);
  const mode = useGame((s) => s.mode);
  const rushActive = useGame((s) => s.rushActive);
  const rushMs = useGame((s) => s.rushTimeMs);
  const inputMode = useGame((s) => s.preferences.inputMode);
  const pool = useGame((s) => s.reducePool);
  const selected = useGame((s) => s.reduceSelected);
  const toggle = useGame((s) => s.toggleReduceSelection);
  const applyOp = useGame((s) => s.applyReduceOp);
  const undo = useGame((s) => s.undoReduce);
  const resetPool = useGame((s) => s.resetReduce);
  const historyLen = useGame((s) => s.reduceHistory.length);
  const setCollapsed = useUi((s) => s.setCollapsed);

  if (!hand) startNewHand();

  const isReduce = inputMode === "reduce";
  const showOps = isReduce && selected.length === 2;
  const a = showOps ? pool.find((n) => n.id === selected[0]) : undefined;
  const b = showOps ? pool.find((n) => n.id === selected[1]) : undefined;

  const renderCards = () => {
    if (!isReduce && hand) {
      return hand.cards.map((c, i) => (
        <MiniStatic
          key={`${hand.id}-${i}`}
          value={c}
          onTap={() => setCollapsed(false)}
          delay={i * 0.04}
        />
      ));
    }
    return pool.map((node) => {
      const order = selected.indexOf(node.id);
      return (
        <MiniCard
          key={node.id}
          node={node}
          selected={order !== -1}
          order={order}
          onTap={() => toggle(node.id)}
        />
      );
    });
  };

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={() => setCollapsed(false)}
      className="flex items-center gap-2.5 px-3 py-[10px] flex-1 min-w-0"
    >
      <div className="flex items-center gap-[5px] shrink-0" data-no-drag>
        <AnimatePresence initial={false}>{renderCards()}</AnimatePresence>
      </div>

      <div className="flex-1 min-w-0" />

      <div className="flex items-center gap-1.5 shrink-0" data-no-drag>
        <AnimatePresence mode="wait" initial={false}>
          {showOps ? (
            <motion.div
              key="ops"
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.14 }}
              className="flex items-center gap-0.5"
            >
              {(["+", "-", "×", "÷"] as ReduceOp[]).map((op) => {
                const ok = a && b ? isOpLegal(a, b, op) : false;
                return (
                  <button
                    key={op}
                    type="button"
                    disabled={!ok}
                    onClick={() => ok && applyOp(op)}
                    className="token w-7 h-7 text-[15px]"
                    style={{ opacity: ok ? 1 : 0.25 }}
                  >
                    {op === "-" ? "−" : op}
                  </button>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="score"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-1.5"
            >
              {mode === "rush" && rushActive ? (
                <span className="font-mono tabular-nums text-[13px] text-accent-300">
                  {formatTime(rushMs)}
                </span>
              ) : (
                <span className="font-mono tabular-nums text-[13px] text-ink-100">
                  {score}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isReduce && historyLen > 0 && !showOps && (
          <>
            <SubtleIcon title="Undo" onClick={undo}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path
                  d="M4 3 L1 6 L4 9 M1 6 H9 a2 2 0 0 1 2 2 V11"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SubtleIcon>
            <SubtleIcon title="Reset" onClick={resetPool}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6 a4 4 0 1 1 1.5 3.1 M2 3 V6 H5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SubtleIcon>
          </>
        )}

        <SubtleIcon title="Expand" onClick={() => setCollapsed(false)}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M1 5 V1 H5 M7 11 H11 V7"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </SubtleIcon>
      </div>
    </div>
  );
}

function SubtleIcon({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-6 h-6 inline-flex items-center justify-center rounded-md text-ink-300 hover:text-ink-50 hover:bg-white/6 transition-colors"
    >
      {children}
    </button>
  );
}

function MiniStatic({
  value,
  onTap,
  delay,
}: {
  value: number;
  onTap: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onTap}
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
      className="min-w-[28px] h-9 px-1.5 rounded-[7px] flex items-center justify-center text-[13px] text-ink-50 font-light tracking-tight tabular-nums"
      style={cardStyle(false)}
    >
      {value}
    </motion.button>
  );
}

function MiniCard({
  node,
  selected,
  order,
  onTap,
}: {
  node: ReduceNode;
  selected: boolean;
  order: number;
  onTap: () => void;
}) {
  const label = formatNumber(node.value);
  return (
    <motion.button
      type="button"
      onClick={onTap}
      layout
      initial={{ opacity: 0, y: 3, scale: 0.9 }}
      animate={{ opacity: 1, y: selected ? -1.5 : 0, scale: selected ? 1.03 : 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="relative min-w-[28px] h-9 px-1.5 rounded-[7px] flex items-center justify-center text-[13px] text-ink-50 font-light tracking-tight tabular-nums"
      style={cardStyle(selected)}
    >
      {label}
      {order !== -1 && (
        <span
          className="absolute -top-[3px] -right-[3px] w-3 h-3 inline-flex items-center justify-center rounded-full text-[7px] font-mono"
          style={{
            background: "rgb(232,217,160)",
            color: "#1a1a20",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
          }}
        >
          {order + 1}
        </span>
      )}
    </motion.button>
  );
}

function cardStyle(selected: boolean): React.CSSProperties {
  return {
    background:
      "linear-gradient(180deg, rgba(70,70,82,0.85) 0%, rgba(36,36,44,0.85) 100%)",
    border: selected
      ? "1px solid rgba(232,217,160,0.5)"
      : "1px solid rgba(255,255,255,0.06)",
    boxShadow: selected
      ? "0 4px 10px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(232,217,160,0.22)"
      : "0 4px 10px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.07)",
  };
}
