import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
 * Drag-to-merge reduce board.
 *
 * Cards sit in fixed slots (no flex reshuffling during drag). Grab one,
 * pull it near another → four operator satellites bloom between the two;
 * keep dragging so the pointer hits a satellite → release to commit. If
 * you release over a card or over no satellite, the card springs back —
 * no modal, no second click.
 *
 * Gesture semantics:
 *   - dragged bubble = left operand, target = right operand (matters for
 *     − and ÷).
 *   - while the pointer is over a satellite we also light up that op on
 *     the card so the player has a preview of the committed value.
 *
 * Endgame:
 *   - when two bubbles remain and some op between them hits 24, the pair
 *     pulses gold and auto-fuses after ~750 ms. Touching the cards again
 *     cancels the countdown — we watch `dragging` for that.
 */

const CARD_W = 66;
const CARD_H = 84;
const GAP = 14;

const OP_DIST = 44;
const OP_RADIUS = 22;

const OP_LAYOUT: { op: ReduceOp; dx: number; dy: number }[] = [
  { op: "+", dx: 0, dy: -OP_DIST },
  { op: "×", dx: OP_DIST, dy: 0 },
  { op: "-", dx: 0, dy: OP_DIST },
  { op: "÷", dx: -OP_DIST, dy: 0 },
];

interface Slot {
  x: number;
  y: number;
}

interface DragState {
  id: string;
  /** Pointer in container coords — drives satellite placement. */
  px: number;
  py: number;
  targetId: string | null;
  op: ReduceOp | null;
}

function slotsFor(n: number, width: number, height: number): Slot[] {
  if (n <= 0) return [];
  const totalW = n * CARD_W + (n - 1) * GAP;
  const startX = Math.max(8, (width - totalW) / 2);
  const y = Math.max(0, (height - CARD_H) / 2);
  return Array.from({ length: n }, (_, i) => ({
    x: startX + i * (CARD_W + GAP),
    y,
  }));
}

export function BubbleBoard() {
  const pool = useGame((s) => s.reducePool);
  const commit = useGame((s) => s.commitReduce);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 128 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slots = useMemo(
    () => slotsFor(pool.length, size.w, size.h),
    [pool.length, size.w, size.h]
  );
  const slotMap = useMemo(() => {
    const m = new Map<string, Slot>();
    pool.forEach((n, i) => m.set(n.id, slots[i]));
    return m;
  }, [pool, slots]);

  const [drag, setDrag] = useState<DragState | null>(null);

  // Auto-finish: exactly two bubbles remain and some op between them hits
  // 24 — schedule a commit, cancellable by picking up a bubble.
  const isDragging = drag !== null;
  useEffect(() => {
    if (pool.length !== 2 || isDragging) return;
    const [a, b] = pool;
    const winner = findWinningOp(a, b);
    if (!winner) return;
    const t = window.setTimeout(() => {
      commit(winner.aId, winner.bId, winner.op);
    }, 750);
    return () => window.clearTimeout(t);
  }, [pool, isDragging, commit]);

  const relPointer = (absX: number, absY: number): Slot | null => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: absX - box.left, y: absY - box.top };
  };

  const handleDrag = (id: string, info: PanInfo) => {
    const p = relPointer(info.point.x, info.point.y);
    if (!p) return;
    const px = p.x;
    const py = p.y;

    // 1) nearest other bubble to the pointer
    let targetId: string | null = null;
    let bestDist = Infinity;
    for (const n of pool) {
      if (n.id === id) continue;
      const s = slotMap.get(n.id);
      if (!s) continue;
      const cx = s.x + CARD_W / 2;
      const cy = s.y + CARD_H / 2;
      const d = Math.hypot(cx - px, cy - py);
      if (d < bestDist) {
        bestDist = d;
        targetId = n.id;
      }
    }
    const withinTarget = targetId !== null && bestDist < CARD_W * 0.95;

    // 2) if over a target, check which operator satellite the pointer hits
    let op: ReduceOp | null = null;
    if (withinTarget && targetId) {
      const anchor = satelliteAnchor(px, py, slotMap.get(targetId)!);
      for (const sat of OP_LAYOUT) {
        const sx = anchor.x + sat.dx;
        const sy = anchor.y + sat.dy;
        if (Math.hypot(px - sx, py - sy) < OP_RADIUS) {
          const a = pool.find((n) => n.id === id)!;
          const b = pool.find((n) => n.id === targetId)!;
          if (isOpLegal(a, b, sat.op)) op = sat.op;
          break;
        }
      }
    }

    setDrag({
      id,
      px,
      py,
      targetId: withinTarget ? targetId : null,
      op,
    });
  };

  const handleDragEnd = () => {
    if (drag?.targetId && drag.op) {
      const a = pool.find((n) => n.id === drag.id);
      const b = pool.find((n) => n.id === drag.targetId);
      if (a && b && isOpLegal(a, b, drag.op)) {
        commit(a.id, b.id, drag.op);
      }
    }
    setDrag(null);
  };

  const primed =
    pool.length === 2 && !drag && !!findWinningOp(pool[0], pool[1]);

  const draggedNode = drag ? pool.find((n) => n.id === drag.id) : null;
  const targetNode = drag?.targetId
    ? pool.find((n) => n.id === drag.targetId)
    : null;
  const satellitePos =
    drag?.targetId && targetNode
      ? satelliteAnchor(drag.px, drag.py, slotMap.get(drag.targetId)!)
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ height: CARD_H + 34 }}
      >
        <AnimatePresence initial={false}>
          {pool.map((node) => {
            const slot = slotMap.get(node.id);
            if (!slot) return null;
            const isDragged = drag?.id === node.id;
            const isHoverTarget = drag?.targetId === node.id;
            return (
              <DragCard
                key={node.id}
                node={node}
                slot={slot}
                isDragged={isDragged}
                isHoverTarget={isHoverTarget}
                primed={primed}
                onDragStart={() =>
                  setDrag({
                    id: node.id,
                    px: slot.x + CARD_W / 2,
                    py: slot.y + CARD_H / 2,
                    targetId: null,
                    op: null,
                  })
                }
                onDrag={(info) => handleDrag(node.id, info)}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </AnimatePresence>

        {draggedNode && targetNode && satellitePos && (
          <OpSatellites
            anchor={satellitePos}
            a={draggedNode}
            b={targetNode}
            activeOp={drag?.op ?? null}
          />
        )}
      </div>

      <div className="flex items-center justify-center px-2 min-h-[14px]">
        <span className="text-[11px] text-ink-400 text-center">
          {statusText(pool, drag)}
        </span>
      </div>
    </div>
  );
}

/**
 * Anchor point for the 4-op satellite menu: midway between the pointer
 * (i.e. the dragged card's centre) and the target card's centre. Using the
 * pointer rather than the dragged card's slot means the satellites track
 * the card as it moves — feels like the ops are spawned by the collision.
 */
function satelliteAnchor(px: number, py: number, targetSlot: Slot): Slot {
  const tx = targetSlot.x + CARD_W / 2;
  const ty = targetSlot.y + CARD_H / 2;
  return { x: (px + tx) / 2, y: (py + ty) / 2 };
}

function statusText(pool: ReduceNode[], drag: DragState | null): string {
  if (pool.length === 1) {
    const only = pool[0];
    return Math.abs(only.value - TARGET) < EPS
      ? ""
      : `Ended at ${formatNumber(only.value)} — Undo to adjust`;
  }
  if (drag?.op) return "Release to commit";
  if (drag?.targetId) return "Drag onto an operator";
  if (drag) return "…";
  if (pool.length === 2 && findWinningOp(pool[0], pool[1]))
    return "Two left — they'll merge automatically…";
  return "Drag a card onto another";
}

/* ---------------------------- DragCard ----------------------------------- */

interface DragCardProps {
  node: ReduceNode;
  slot: Slot;
  isDragged: boolean;
  isHoverTarget: boolean;
  primed: boolean;
  onDragStart: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: () => void;
}

function DragCard({
  node,
  slot,
  isDragged,
  isHoverTarget,
  primed,
  onDragStart,
  onDrag,
  onDragEnd,
}: DragCardProps) {
  const isLeaf = node.children === undefined;
  return (
    <motion.div
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: 1,
        scale: isDragged ? 1.06 : isHoverTarget ? 1.04 : 1,
        left: slot.x,
        top: slot.y,
        rotate: isDragged ? -2 : 0,
      }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{
        type: "spring",
        stiffness: 380,
        damping: 28,
        mass: 0.7,
      }}
      whileTap={{ scale: 1.02 }}
      className="absolute card-face flex-col gap-0.5"
      style={{
        width: CARD_W,
        height: CARD_H,
        cursor: "grab",
        zIndex: isDragged ? 20 : 1,
        touchAction: "none",
        boxShadow: isHoverTarget
          ? "0 10px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.1) inset, 0 -1px 0 rgba(0,0,0,0.45) inset, 0 0 0 2px rgba(232,217,160,0.65), 0 0 22px rgba(232,217,160,0.28)"
          : primed
            ? "0 10px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.09) inset, 0 -1px 0 rgba(0,0,0,0.45) inset, 0 0 0 1px rgba(232,217,160,0.45)"
            : isDragged
              ? "0 14px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.12) inset, 0 -1px 0 rgba(0,0,0,0.5) inset"
              : undefined,
      }}
      data-no-drag
    >
      <span
        className="text-[24px] text-ink-50 font-light leading-none tabular-nums"
        style={{ pointerEvents: "none" }}
      >
        {formatNumber(node.value)}
      </span>
      {!isLeaf && (
        <span
          className="text-[8.5px] font-mono text-ink-300 mt-0.5 px-1 text-center leading-[1.15]"
          style={{
            pointerEvents: "none",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {node.expr}
        </span>
      )}
      {isLeaf && node.cardIndex !== undefined && (
        <span
          className="absolute bottom-1 left-1.5 text-[8px] uppercase tracking-[0.15em] text-ink-400/70"
          style={{ pointerEvents: "none" }}
        >
          #{node.cardIndex + 1}
        </span>
      )}
    </motion.div>
  );
}

/* --------------------------- OpSatellites -------------------------------- */

function OpSatellites({
  anchor,
  a,
  b,
  activeOp,
}: {
  anchor: Slot;
  a: ReduceNode;
  b: ReduceNode;
  activeOp: ReduceOp | null;
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: anchor.x, top: anchor.y, zIndex: 15 }}
    >
      {OP_LAYOUT.map(({ op, dx, dy }, i) => {
        const ok = isOpLegal(a, b, op);
        const val = ok ? formatNumber(combine(a, b, op).node.value) : null;
        const isTargetPreview =
          val !== null && Math.abs(Number(val) - TARGET) < EPS;
        const active = activeOp === op;
        const size = 34;
        return (
          <motion.div
            key={op}
            initial={{ opacity: 0, scale: 0.4, x: -size / 2, y: -size / 2 }}
            animate={{
              opacity: ok ? 1 : 0.4,
              scale: active ? 1.18 : 1,
              x: dx - size / 2,
              y: dy - size / 2,
            }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 24,
              delay: i * 0.025,
            }}
            className="absolute rounded-full flex flex-col items-center justify-center"
            style={{
              width: size,
              height: size,
              background: active
                ? "radial-gradient(circle at 30% 30%, rgba(255,245,210,1) 0%, rgba(220,190,100,0.95) 100%)"
                : isTargetPreview
                  ? "radial-gradient(circle at 30% 30%, rgba(240,225,170,0.98) 0%, rgba(190,160,80,0.9) 100%)"
                  : "radial-gradient(circle at 30% 30%, rgba(84,84,96,0.98) 0%, rgba(36,36,46,0.98) 100%)",
              color:
                active || isTargetPreview ? "#1c1a10" : "rgb(240,240,248)",
              border:
                active || isTargetPreview
                  ? "1px solid rgba(232,217,160,0.95)"
                  : "1px solid rgba(255,255,255,0.14)",
              boxShadow: active
                ? "0 0 0 3px rgba(232,217,160,0.35), 0 8px 22px rgba(232,217,160,0.5)"
                : isTargetPreview
                  ? "0 0 0 2px rgba(232,217,160,0.3), 0 4px 14px rgba(232,217,160,0.3)"
                  : "0 4px 14px rgba(0,0,0,0.45)",
            }}
          >
            <span className="text-[15px] leading-none font-light">
              {op === "-" ? "−" : op}
            </span>
            {val !== null && (
              <span
                className="text-[7.5px] font-mono leading-none mt-[1px] tabular-nums"
                style={{ opacity: 0.85 }}
              >
                {val}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------ helpers --------------------------------- */

interface Winner {
  aId: string;
  bId: string;
  op: ReduceOp;
}

function findWinningOp(a: ReduceNode, b: ReduceNode): Winner | null {
  const OPS: ReduceOp[] = ["+", "×", "-", "÷"];
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as [ReduceNode, ReduceNode][]) {
    for (const op of OPS) {
      if (!isOpLegal(x, y, op)) continue;
      const v = combine(x, y, op).node.value;
      if (Math.abs(v - TARGET) < EPS) return { aId: x.id, bId: y.id, op };
    }
  }
  return null;
}
