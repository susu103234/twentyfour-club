import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGame } from "@/store/gameStore";
import {
  combine,
  isOpLegal,
  type ReduceNode,
  type ReduceOp,
} from "@/features/game/reduce";
import { formatNumber } from "@/lib/format";
import { TARGET, EPS } from "@/lib/constants";

/**
 * Drag-bubble variant of ReduceBoard.
 *
 * Mental model: each card is a round bubble. Drag one onto another and
 * they're primed to merge — release, and a four-op radial menu appears at
 * the midpoint. Pick + / − / × / ÷ and the pair collapses into one bubble
 * carrying the result.
 *
 * When only two bubbles remain and some op between them hits 24, we gently
 * pulse both and auto-fuse after ~700 ms so the endgame feels inevitable
 * rather than fiddly. Any user interaction (drag/tap) cancels the timer.
 *
 * The gesture carries ordering: the *dragged* bubble is the left operand,
 * the *target* is the right. That matters for − and ÷, whose non-commutative
 * semantics we otherwise couldn't express without a second tap.
 */

const BUBBLE_RADIUS = 34; // visual radius; container is 68×68
const MERGE_SLACK = 10; // how far past touching the centres must close to snap

interface Center {
  cx: number;
  cy: number;
}

interface OpMenu {
  aId: string;
  bId: string;
  center: Center;
}

export function BubbleBoard() {
  const pool = useGame((s) => s.reducePool);
  const commit = useGame((s) => s.commitReduce);

  const containerRef = useRef<HTMLDivElement>(null);
  const centers = useRef<Map<string, Center>>(new Map());

  const [hover, setHover] = useState<{
    dragId: string;
    targetId: string;
  } | null>(null);
  const [opMenu, setOpMenu] = useState<OpMenu | null>(null);
  const [dragging, setDragging] = useState(false);

  // Reset hover/menu whenever the pool shape changes (after a commit/undo).
  useEffect(() => {
    setHover(null);
    setOpMenu(null);
  }, [pool]);

  // Auto-finish: if exactly two bubbles remain and some op between them
  // reaches 24, schedule the combine. The user can pre-empt by dragging
  // (which flips `dragging` and re-runs this effect, clearing the timer)
  // or by opening the op menu themselves.
  useEffect(() => {
    if (pool.length !== 2 || opMenu || dragging) return;
    const [a, b] = pool;
    const winner = findWinningOp(a, b);
    if (!winner) return;
    const t = window.setTimeout(() => {
      commit(winner.aId, winner.bId, winner.op);
    }, 750);
    return () => window.clearTimeout(t);
  }, [pool, commit, opMenu, dragging]);

  const toContainer = (cx: number, cy: number): Center => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return { cx, cy };
    return { cx: cx - box.left, cy: cy - box.top };
  };

  const onBubbleDrag = (id: string, cx: number, cy: number) => {
    centers.current.set(id, { cx, cy });
    let best: { id: string; dist: number } | null = null;
    for (const other of pool) {
      if (other.id === id) continue;
      const c = centers.current.get(other.id);
      if (!c) continue;
      const dist = Math.hypot(c.cx - cx, c.cy - cy);
      if (!best || dist < best.dist) best = { id: other.id, dist };
    }
    const threshold = BUBBLE_RADIUS * 2 - MERGE_SLACK;
    if (best && best.dist < threshold) {
      if (!hover || hover.dragId !== id || hover.targetId !== best.id) {
        setHover({ dragId: id, targetId: best.id });
      }
    } else if (hover) {
      setHover(null);
    }
  };

  const onBubbleRelease = (id: string, cx: number, cy: number) => {
    if (!hover || hover.dragId !== id) {
      setHover(null);
      return;
    }
    const targetId = hover.targetId;
    const target = centers.current.get(targetId);
    setHover(null);
    if (!target) return;
    const mid = toContainer((cx + target.cx) / 2, (cy + target.cy) / 2);
    setOpMenu({ aId: id, bId: targetId, center: mid });
  };

  const aNode =
    opMenu && pool.find((n) => n.id === opMenu.aId) !== undefined
      ? pool.find((n) => n.id === opMenu.aId)!
      : null;
  const bNode =
    opMenu && pool.find((n) => n.id === opMenu.bId) !== undefined
      ? pool.find((n) => n.id === opMenu.bId)!
      : null;

  const primed = pool.length === 2 && !!findWinningOp(pool[0], pool[1]);

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative min-h-[148px] flex items-center justify-center gap-3 select-none"
        onClick={() => opMenu && setOpMenu(null)}
      >
        <AnimatePresence initial={false}>
          {pool.map((node) => (
            <Bubble
              key={node.id}
              node={node}
              hoverTarget={hover?.targetId === node.id}
              hoverDragger={hover?.dragId === node.id}
              primed={primed}
              disabled={!!opMenu}
              onCenterChange={(cx, cy) =>
                centers.current.set(node.id, { cx, cy })
              }
              onDragStart={() => setDragging(true)}
              onDrag={(cx, cy) => onBubbleDrag(node.id, cx, cy)}
              onRelease={(cx, cy) => {
                setDragging(false);
                onBubbleRelease(node.id, cx, cy);
              }}
            />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {opMenu && aNode && bNode && (
            <RadialOps
              center={opMenu.center}
              a={aNode}
              b={bNode}
              onPick={(op) => {
                setOpMenu(null);
                commit(opMenu.aId, opMenu.bId, op);
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center px-2 min-h-[14px]">
        <span className="text-[11px] text-ink-400 text-center">
          {statusText(pool, hover !== null, opMenu !== null, primed)}
        </span>
      </div>
    </div>
  );
}

function statusText(
  pool: ReduceNode[],
  hovering: boolean,
  menuOpen: boolean,
  primed: boolean
): string {
  if (pool.length === 1) {
    const only = pool[0];
    return Math.abs(only.value - TARGET) < EPS
      ? ""
      : `Ended at ${formatNumber(only.value)} — Undo to adjust`;
  }
  if (menuOpen) return "Pick an operator";
  if (hovering) return "Release to merge";
  if (primed) return "Two left — they'll merge automatically…";
  return "Drag a bubble onto another";
}

/* ------------------------------- Bubble -------------------------------- */

interface BubbleProps {
  node: ReduceNode;
  hoverTarget: boolean;
  hoverDragger: boolean;
  primed: boolean;
  disabled: boolean;
  onCenterChange: (cx: number, cy: number) => void;
  onDragStart: () => void;
  onDrag: (cx: number, cy: number) => void;
  onRelease: (cx: number, cy: number) => void;
}

function Bubble({
  node,
  hoverTarget,
  hoverDragger,
  primed,
  disabled,
  onCenterChange,
  onDragStart,
  onDrag,
  onRelease,
}: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isLeaf = node.children === undefined;

  // Keep the parent's centre-map warm on layout and after animations, so
  // non-dragging bubbles still contribute to hit-testing.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const emit = () => {
      const r = el.getBoundingClientRect();
      onCenterChange(r.left + r.width / 2, r.top + r.height / 2);
    };
    emit();
    const ro = new ResizeObserver(emit);
    ro.observe(el);
    window.addEventListener("resize", emit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", emit);
    };
  }, [onCenterChange]);

  const center = () => {
    const el = ref.current;
    if (!el) return { cx: 0, cy: 0 };
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  return (
    <motion.div
      ref={ref}
      layout
      drag={!disabled}
      dragMomentum={false}
      dragElastic={0.12}
      whileDrag={{ scale: 1.08, zIndex: 10 }}
      onDragStart={onDragStart}
      onDrag={() => {
        const { cx, cy } = center();
        onDrag(cx, cy);
      }}
      onDragEnd={() => {
        const { cx, cy } = center();
        onRelease(cx, cy);
      }}
      onLayoutAnimationComplete={() => {
        const { cx, cy } = center();
        onCenterChange(cx, cy);
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: 1,
        scale: 1,
        boxShadow: hoverTarget
          ? "0 0 0 2px rgba(232,217,160,0.85), 0 8px 24px rgba(232,217,160,0.30), inset 0 1px 0 rgba(255,255,255,0.14)"
          : primed
            ? "0 0 0 1px rgba(232,217,160,0.55), 0 6px 20px rgba(232,217,160,0.22), inset 0 1px 0 rgba(255,255,255,0.12)"
            : hoverDragger
              ? "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.14)"
              : "0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)",
      }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
      className="relative w-[68px] h-[68px] rounded-full flex flex-col items-center justify-center cursor-grab active:cursor-grabbing"
      style={{
        background:
          "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.18) 0%, rgba(70,70,82,0.85) 55%, rgba(30,30,38,0.92) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        touchAction: "none",
      }}
      data-no-drag
    >
      <span
        className="text-[22px] text-ink-50 font-light leading-none tabular-nums"
        style={{ pointerEvents: "none" }}
      >
        {formatNumber(node.value)}
      </span>
      {!isLeaf && (
        <span
          className="text-[8px] font-mono text-ink-300 mt-0.5 px-1 text-center leading-[1.1]"
          style={{
            pointerEvents: "none",
            maxWidth: 60,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.expr}
        </span>
      )}
    </motion.div>
  );
}

/* ----------------------------- RadialOps -------------------------------- */

const RADIAL: { op: ReduceOp; dx: number; dy: number }[] = [
  { op: "+", dx: 0, dy: -38 },
  { op: "×", dx: 38, dy: 0 },
  { op: "-", dx: 0, dy: 38 },
  { op: "÷", dx: -38, dy: 0 },
];

function RadialOps({
  center,
  a,
  b,
  onPick,
}: {
  center: Center;
  a: ReduceNode;
  b: ReduceNode;
  onPick: (op: ReduceOp) => void;
}) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: center.cx, top: center.cy }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
    >
      {RADIAL.map(({ op, dx, dy }, i) => {
        const ok = isOpLegal(a, b, op);
        const val = ok ? formatNumber(combine(a, b, op).node.value) : null;
        const isTargetPreview =
          val !== null && Math.abs(Number(val) - TARGET) < EPS;
        return (
          <motion.button
            key={op}
            type="button"
            disabled={!ok}
            onClick={(e) => {
              e.stopPropagation();
              if (ok) onPick(op);
            }}
            initial={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
            animate={{
              opacity: ok ? 1 : 0.3,
              scale: 1,
              x: dx - 18,
              y: dy - 18,
            }}
            exit={{ opacity: 0, scale: 0.6, x: 0, y: 0 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 24,
              delay: i * 0.03,
            }}
            className="absolute w-9 h-9 rounded-full flex flex-col items-center justify-center text-[15px] text-ink-50 pointer-events-auto"
            style={{
              background: isTargetPreview
                ? "radial-gradient(circle at 30% 30%, rgba(250,240,200,0.95) 0%, rgba(200,170,80,0.85) 100%)"
                : "radial-gradient(circle at 30% 30%, rgba(90,90,104,0.95) 0%, rgba(40,40,50,0.95) 100%)",
              color: isTargetPreview ? "#1c1b14" : "rgb(240,240,248)",
              border: isTargetPreview
                ? "1px solid rgba(232,217,160,0.8)"
                : "1px solid rgba(255,255,255,0.12)",
              boxShadow: isTargetPreview
                ? "0 0 0 2px rgba(232,217,160,0.35), 0 6px 18px rgba(232,217,160,0.35)"
                : "0 4px 14px rgba(0,0,0,0.45)",
              cursor: ok ? "pointer" : "default",
            }}
          >
            <span className="leading-none font-light">
              {op === "-" ? "−" : op}
            </span>
            {val !== null && (
              <span
                className="text-[8px] font-mono leading-none mt-[1px] tabular-nums"
                style={{ opacity: 0.8 }}
              >
                {val}
              </span>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

/* ------------------------------ helpers --------------------------------- */

interface Winner {
  aId: string;
  bId: string;
  op: ReduceOp;
}

/**
 * For the two-bubble endgame, return the first (a, b, op) triple that hits
 * 24 — trying both orderings so we also accept non-commutative wins like
 * `a − b = 24` where `b − a ≠ 24`.
 */
function findWinningOp(a: ReduceNode, b: ReduceNode): Winner | null {
  const OPS: ReduceOp[] = ["+", "×", "-", "÷"];
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as [ReduceNode, ReduceNode][]) {
    for (const op of OPS) {
      if (!isOpLegal(x, y, op)) continue;
      const v = combine(x, y, op).node.value;
      if (Math.abs(v - TARGET) < EPS) {
        return { aId: x.id, bId: y.id, op };
      }
    }
  }
  return null;
}
