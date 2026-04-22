import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import { formatNumber, formatTime } from "@/lib/format";
import { buildHint } from "@/features/game/hints";
import { BubbleBoard } from "./BubbleBoard";
import { OnboardingBubble } from "./OnboardingBubble";

/**
 * Minimal 180×200 HUD.
 *
 * There is no dedicated icon bar — tool glyphs float in the top-right as
 * a dim cluster (hover to emphasise), and the bubble grid fills the
 * whole window beneath them. The entire background is a tauri-drag-
 * region; only interactive leaves (icons, cards) opt out with
 * data-no-drag, so the user can grab the window by any empty pixel.
 */
export function CollapsedView() {
  const hand = useGame((s) => s.hand);
  const startNewHand = useGame((s) => s.startNewHand);
  const mode = useGame((s) => s.mode);
  const rushActive = useGame((s) => s.rushActive);
  const rushMs = useGame((s) => s.rushTimeMs);
  const inputMode = useGame((s) => s.preferences.inputMode);
  const bubbleDrag = useGame((s) => s.preferences.bubbleDrag);
  const undo = useGame((s) => s.undoReduce);
  const resetPool = useGame((s) => s.resetReduce);
  const historyLen = useGame((s) => s.reduceHistory.length);
  const requestHint = useGame((s) => s.requestHint);
  const hintLevel = useGame((s) => s.hintLevel);
  const setCollapsed = useUi((s) => s.setCollapsed);
  const toggleSettings = useUi((s) => s.toggleSettings);

  if (!hand) startNewHand();

  const isReduce = inputMode === "reduce";
  const dragMode = isReduce && bubbleDrag;

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={() => setCollapsed(false)}
      className="relative flex-1 min-w-0 min-h-0"
    >
      <div className="absolute inset-0 flex items-center justify-center px-1 py-1">
        {dragMode ? (
          <div className="w-full">
            <BubbleBoard variant="compact" hideStatus />
          </div>
        ) : (
          <StaticCardGrid onExpand={() => setCollapsed(false)} />
        )}
      </div>

      {/* Floating tool cluster — sits above empty top space, dim until
          the cursor is over it. The wrapping div stays drag-region so
          gaps between icons still drag the window. */}
      <div className="absolute top-1 right-1 flex items-center opacity-45 hover:opacity-100 transition-opacity z-10">
        {mode === "rush" && rushActive && (
          <span className="font-mono tabular-nums text-[10px] text-accent-300 pr-1 pointer-events-none">
            {formatTime(rushMs)}
          </span>
        )}
        <SubtleIcon title="Hint" onClick={requestHint}>
          <HintGlyph level={hintLevel} />
        </SubtleIcon>
        {isReduce && historyLen > 0 && (
          <SubtleIcon title="Undo" onClick={undo}>
            <UndoGlyph />
          </SubtleIcon>
        )}
        {isReduce && historyLen > 0 && (
          <SubtleIcon title="Reset" onClick={resetPool}>
            <ResetGlyph />
          </SubtleIcon>
        )}
        <SubtleIcon
          title="Settings"
          onClick={() => {
            setCollapsed(false);
            toggleSettings();
          }}
        >
          <GearGlyph />
        </SubtleIcon>
        <SubtleIcon title="Expand" onClick={() => setCollapsed(false)}>
          <ExpandGlyph />
        </SubtleIcon>
      </div>

      <HintBubble />
      <OnboardingBubble />
    </div>
  );
}

/**
 * Fallback grid for non-drag modes: any tap opens the main window since
 * the tap-reduce op picker and the typed keypad both need more room.
 */
function StaticCardGrid({ onExpand }: { onExpand: () => void }) {
  const hand = useGame((s) => s.hand);
  if (!hand) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {hand.cards.map((c, i) => (
        <motion.button
          key={`${hand.id}-${i}`}
          type="button"
          onClick={onExpand}
          data-no-drag
          initial={{ opacity: 0, y: 4, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            delay: i * 0.04,
            type: "spring",
            stiffness: 260,
            damping: 24,
          }}
          className="card-face"
          style={{ width: 50, height: 58 }}
        >
          <span className="text-[18px] text-ink-50 font-light leading-none tabular-nums">
            {formatNumber(c)}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

function HintBubble() {
  const hand = useGame((s) => s.hand);
  const hintLevel = useGame((s) => s.hintLevel);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (hintLevel === 0 || !hand) {
      setVisible(false);
      return;
    }
    setVisible(true);
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, 5000);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hintLevel, hand?.id]);

  return (
    <AnimatePresence>
      {visible && hand && hintLevel > 0 && (
        <motion.button
          type="button"
          onClick={() => setVisible(false)}
          data-no-drag
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-2 rounded-[9px] px-3 flex items-center justify-center text-center text-[11px] font-mono backdrop-blur-md cursor-pointer"
          style={{
            background: "rgba(24,26,36,0.88)",
            border: "1px solid rgba(159,179,255,0.35)",
            color: "rgb(200,210,255)",
            lineHeight: 1.3,
            wordBreak: "break-word",
            zIndex: 20,
          }}
        >
          {buildHint(hand.solutions[0], hintLevel).text}
        </motion.button>
      )}
    </AnimatePresence>
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
      data-no-drag
      className="w-[18px] h-[18px] inline-flex items-center justify-center rounded-[5px] text-ink-300 hover:text-ink-50 hover:bg-white/10 transition-colors"
    >
      {children}
    </button>
  );
}

/* ---------- line-only SVG glyphs ---------- */

function HintGlyph({ level }: { level: number }) {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path
        d="M6 2 L6 6 M6 8 L6 8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {level > 0 && (
        <circle
          cx="10"
          cy="2"
          r="1"
          fill={
            level >= 3
              ? "rgb(232,217,160)"
              : level >= 2
                ? "rgb(183,196,255)"
                : "currentColor"
          }
        />
      )}
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M6 1 V2.5 M6 9.5 V11 M1 6 H2.5 M9.5 6 H11 M2.5 2.5 L3.5 3.5 M8.5 8.5 L9.5 9.5 M2.5 9.5 L3.5 8.5 M8.5 3.5 L9.5 2.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UndoGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path
        d="M4 3 L1 6 L4 9 M1 6 H9 a2 2 0 0 1 2 2 V11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResetGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6 a4 4 0 1 1 1.5 3.1 M2 3 V6 H5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path
        d="M1 5 V1 H5 M7 11 H11 V7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
