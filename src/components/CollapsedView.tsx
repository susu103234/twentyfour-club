import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import { formatNumber, formatTime } from "@/lib/format";
import { combine, isOpLegal, type ReduceNode, type ReduceOp } from "@/features/game/reduce";
import { buildHint } from "@/features/game/hints";
import { OnboardingBubble } from "./OnboardingBubble";

/**
 * Tight interactive collapsed strip (340×64).
 *
 * Layout:
 *   [ card card card card ]  · score/ops ·  ? ⚙ ↶ ↻ ⛶
 *
 * The ? / ⚙ are always present; ↶ ↻ only appear after a reduction.
 * Opening settings from here auto-expands the window so the overlay
 * panel has room to render.
 */
export function CollapsedView() {
  const hand = useGame((s) => s.hand);
  const startNewHand = useGame((s) => s.startNewHand);
  const score = useGame((s) => s.score);
  const mode = useGame((s) => s.mode);
  const rushActive = useGame((s) => s.rushActive);
  const rushMs = useGame((s) => s.rushTimeMs);
  const inputMode = useGame((s) => s.preferences.inputMode);
  const bubbleDrag = useGame((s) => s.preferences.bubbleDrag);
  const pool = useGame((s) => s.reducePool);
  const selected = useGame((s) => s.reduceSelected);
  const toggle = useGame((s) => s.toggleReduceSelection);
  const applyOp = useGame((s) => s.applyReduceOp);
  const commit = useGame((s) => s.commitReduce);
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

  // Drag-mode state: which card is being dragged, which it's over, which
  // operator pill the pointer is currently hovering. When `targetId` is
  // set, the right-side icon cluster is swapped out for a 4-op row whose
  // buttons are the drop targets — it's all one continuous gesture.
  const stripRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const opRefs = useRef<Map<ReduceOp, HTMLElement>>(new Map());
  const [drag, setDrag] = useState<{
    id: string;
    targetId: string | null;
    op: ReduceOp | null;
  } | null>(null);

  const showOps = isReduce && !dragMode && selected.length === 2;
  const dragOps = dragMode && drag?.targetId !== null;
  const a = showOps
    ? pool.find((n) => n.id === selected[0])
    : drag && dragOps
      ? pool.find((n) => n.id === drag.id)
      : undefined;
  const b = showOps
    ? pool.find((n) => n.id === selected[1])
    : drag && dragOps && drag.targetId
      ? pool.find((n) => n.id === drag.targetId)
      : undefined;

  const onCardDrag = (id: string, info: PanInfo) => {
    const { clientX, clientY } = { clientX: info.point.x, clientY: info.point.y };
    // Find the nearest other card whose box contains the pointer (or whose
    // centre is within ~18 px of it — tiny targets deserve generous snap).
    let targetId: string | null = null;
    let bestDist = Infinity;
    for (const [otherId, el] of cardRefs.current) {
      if (otherId === id) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(cx - clientX, cy - clientY);
      if (d < bestDist) {
        bestDist = d;
        targetId = otherId;
      }
    }
    const onTarget = targetId !== null && bestDist < 26;

    // Hit-test the operator pills (only rendered while on a target).
    let op: ReduceOp | null = null;
    if (onTarget) {
      for (const [candidate, el] of opRefs.current) {
        const r = el.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          const aNode = pool.find((n) => n.id === id);
          const bNode = pool.find((n) => n.id === targetId!);
          if (aNode && bNode && isOpLegal(aNode, bNode, candidate)) {
            op = candidate;
          }
          break;
        }
      }
    }
    setDrag({ id, targetId: onTarget ? targetId : null, op });
  };

  const onCardDragEnd = () => {
    if (drag?.targetId && drag.op) {
      const aNode = pool.find((n) => n.id === drag.id);
      const bNode = pool.find((n) => n.id === drag.targetId);
      if (aNode && bNode && isOpLegal(aNode, bNode, drag.op)) {
        commit(aNode.id, bNode.id, drag.op);
      }
    }
    setDrag(null);
  };

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
    if (dragMode) {
      return pool.map((node) => {
        const isDragged = drag?.id === node.id;
        const isHoverTarget = drag?.targetId === node.id;
        return (
          <DragMiniCard
            key={node.id}
            node={node}
            isDragged={isDragged}
            isHoverTarget={isHoverTarget}
            registerRef={(el) => {
              if (el) cardRefs.current.set(node.id, el);
              else cardRefs.current.delete(node.id);
            }}
            onDragStart={() =>
              setDrag({ id: node.id, targetId: null, op: null })
            }
            onDrag={(info) => onCardDrag(node.id, info)}
            onDragEnd={onCardDragEnd}
          />
        );
      });
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
      ref={stripRef}
      data-tauri-drag-region
      onDoubleClick={() => setCollapsed(false)}
      className="relative flex items-center gap-2 px-2.5 py-[6px] flex-1 min-w-0"
    >
      <div className="flex items-center gap-[4px] shrink-0" data-no-drag>
        <AnimatePresence initial={false}>{renderCards()}</AnimatePresence>
      </div>

      <div className="flex-1 min-w-0" />

      <div className="flex items-center gap-1 shrink-0" data-no-drag>
        <AnimatePresence mode="wait" initial={false}>
          {dragOps && a && b ? (
            <motion.div
              key="drag-ops"
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-0.5"
            >
              {(["+", "-", "×", "÷"] as ReduceOp[]).map((op) => {
                const ok = isOpLegal(a, b, op);
                const preview = ok ? formatNumber(combine(a, b, op).node.value) : null;
                const active = drag?.op === op;
                const isTargetPreview =
                  preview !== null && Math.abs(Number(preview) - 24) < 1e-6;
                return (
                  <div
                    key={op}
                    ref={(el) => {
                      if (el) opRefs.current.set(op, el);
                      else opRefs.current.delete(op);
                    }}
                    className="w-6 h-7 rounded-[6px] flex flex-col items-center justify-center leading-none"
                    style={{
                      background: active
                        ? "radial-gradient(circle at 30% 30%, rgba(255,245,210,1) 0%, rgba(220,190,100,0.95) 100%)"
                        : isTargetPreview
                          ? "rgba(232,217,160,0.22)"
                          : "rgba(255,255,255,0.06)",
                      border:
                        active || isTargetPreview
                          ? "1px solid rgba(232,217,160,0.7)"
                          : "1px solid rgba(255,255,255,0.1)",
                      color:
                        active
                          ? "#1c1a10"
                          : ok
                            ? "rgb(240,240,248)"
                            : "rgba(240,240,248,0.25)",
                      transform: active ? "scale(1.08)" : "scale(1)",
                      transition: "transform 80ms ease, background 80ms ease",
                    }}
                  >
                    <span className="text-[12px]">
                      {op === "-" ? "−" : op}
                    </span>
                    {preview !== null && (
                      <span
                        className="text-[7px] font-mono tabular-nums"
                        style={{ opacity: 0.7 }}
                      >
                        {preview}
                      </span>
                    )}
                  </div>
                );
              })}
            </motion.div>
          ) : showOps ? (
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
                const preview =
                  ok && a && b ? formatNumber(combine(a, b, op).node.value) : null;
                return (
                  <button
                    key={op}
                    type="button"
                    disabled={!ok}
                    onClick={() => ok && applyOp(op)}
                    title={preview ? `${a?.value} ${op} ${b?.value} = ${preview}` : undefined}
                    className="token w-6 h-6 text-[14px]"
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
              className="flex items-center pr-0.5"
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

        {!showOps && (
          <SubtleIcon title="Hint" onClick={requestHint}>
            <HintGlyph level={hintLevel} />
          </SubtleIcon>
        )}
        {!showOps && (
          <SubtleIcon
            title="Settings"
            onClick={() => {
              setCollapsed(false);
              toggleSettings();
            }}
          >
            <GearGlyph />
          </SubtleIcon>
        )}
        {isReduce && historyLen > 0 && !showOps && (
          <>
            <SubtleIcon title="Undo" onClick={undo}>
              <UndoGlyph />
            </SubtleIcon>
            <SubtleIcon title="Reset" onClick={resetPool}>
              <ResetGlyph />
            </SubtleIcon>
          </>
        )}
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
 * Full-width hint overlay. Sits above the cards/icons row for 5s then fades.
 * We cover the strip (rather than float a tiny pill) because the 64px window
 * has no room for a pill that doesn't clip the cards underneath.
 */
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
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          data-no-drag
          className="absolute inset-x-1.5 top-1.5 bottom-1.5 rounded-[9px] px-3 flex items-center justify-center text-center text-[11px] font-mono backdrop-blur-md cursor-pointer"
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
      className="w-5 h-5 inline-flex items-center justify-center rounded-[6px] text-ink-300 hover:text-ink-50 hover:bg-white/6 transition-colors"
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
      className="min-w-[26px] h-8 px-1.5 rounded-[6px] flex items-center justify-center text-[13px] text-ink-50 font-light tracking-tight tabular-nums"
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
      animate={{ opacity: 1, y: selected ? -1.5 : 0, scale: selected ? 1.04 : 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="relative min-w-[26px] h-8 px-1.5 rounded-[6px] flex items-center justify-center text-[13px] text-ink-50 font-light tracking-tight tabular-nums"
      style={cardStyle(selected)}
    >
      {label}
      {order !== -1 && (
        <span
          className="absolute -top-[3px] -right-[3px] w-[11px] h-[11px] inline-flex items-center justify-center rounded-full text-[7px] font-mono"
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

/**
 * Collapsed-strip drag card: same look as MiniCard but grabbable. We keep
 * flex layout for non-dragged cards; Motion's `drag` just translates the
 * dragged card via transform so the strip doesn't reflow around it.
 */
function DragMiniCard({
  node,
  isDragged,
  isHoverTarget,
  registerRef,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  node: ReduceNode;
  isDragged: boolean;
  isHoverTarget: boolean;
  registerRef: (el: HTMLElement | null) => void;
  onDragStart: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: () => void;
}) {
  return (
    <motion.div
      ref={registerRef}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={onDragEnd}
      layout
      initial={{ opacity: 0, y: 3, scale: 0.9 }}
      animate={{
        opacity: 1,
        y: isDragged ? -1 : 0,
        scale: isDragged ? 1.12 : isHoverTarget ? 1.06 : 1,
        rotate: isDragged ? -3 : 0,
        zIndex: isDragged ? 30 : isHoverTarget ? 2 : 1,
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
      className="relative min-w-[26px] h-8 px-1.5 rounded-[6px] flex items-center justify-center text-[13px] text-ink-50 font-light tracking-tight tabular-nums"
      style={{
        ...cardStyle(isHoverTarget),
        cursor: isDragged ? "grabbing" : "grab",
        touchAction: "none",
        boxShadow: isHoverTarget
          ? "0 3px 9px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 2px rgba(232,217,160,0.55), 0 0 12px rgba(232,217,160,0.25)"
          : isDragged
            ? "0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)"
            : undefined,
      }}
    >
      <span style={{ pointerEvents: "none" }}>{formatNumber(node.value)}</span>
    </motion.div>
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
      ? "0 3px 9px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(232,217,160,0.22)"
      : "0 3px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.07)",
  };
}

/* ---------- line-only SVG glyphs ---------- */

function HintGlyph({ level }: { level: number }) {
  // A flame / spark with N dots beside it for hint tier indicator.
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
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
          fill={level >= 3 ? "rgb(232,217,160)" : level >= 2 ? "rgb(183,196,255)" : "currentColor"}
        />
      )}
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
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
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
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
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
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
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
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
