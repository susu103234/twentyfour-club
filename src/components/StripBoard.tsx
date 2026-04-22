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
 * Horizontal-strip drag board for the collapsed HUD.
 *
 * Idle:
 *     [ 1 ][ 2 ][ 3 ][ 4 ]
 *
 * When the pointer drops onto another card (lock), bystander cards fade
 * away and four operator bubbles slide into their places. The target
 * card slips to the centre slot; two ops flank it on each side:
 *
 *     [ ÷ ][ − ][ 3 ][ + ][ × ]
 *
 * Sized for a ~240×60 window. Dimensions tuned tight enough that the
 * full 5-slot lock layout still fits above 220px of container width.
 */

const CARD_W = 38;
const CARD_H = 36;
const GAP = 5;

const OP_W = 30;
const LOCK_GAP = 3;

/** Slot width assignment for the locked 5-tile layout. */
const LOCK_WIDTHS = [OP_W, OP_W, CARD_W, OP_W, OP_W];
/** Which operator goes in which lock slot (null = target). */
const LOCK_OPS: (ReduceOp | null)[] = ["÷", "-", null, "+", "×"];

interface Slot {
  x: number;
  w: number;
}

interface DragState {
  id: string;
  targetId: string | null;
  op: ReduceOp | null;
}

export function StripBoard() {
  const pool = useGame((s) => s.reducePool);
  const commit = useGame((s) => s.commitReduce);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(220);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const idleSlots: Slot[] = useMemo(() => {
    const n = pool.length;
    if (n <= 0) return [];
    const total = n * CARD_W + (n - 1) * GAP;
    const start = (width - total) / 2;
    return Array.from({ length: n }, (_, i) => ({
      x: start + i * (CARD_W + GAP),
      w: CARD_W,
    }));
  }, [pool.length, width]);

  const lockSlots: Slot[] = useMemo(() => {
    const total =
      LOCK_WIDTHS.reduce((s, w) => s + w, 0) +
      (LOCK_WIDTHS.length - 1) * LOCK_GAP;
    const start = (width - total) / 2;
    const out: Slot[] = [];
    let x = start;
    for (const w of LOCK_WIDTHS) {
      out.push({ x, w });
      x += w + LOCK_GAP;
    }
    return out;
  }, [width]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const locked = drag?.targetId != null;

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

  const relPointer = (absX: number, absY: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: absX - box.left, y: absY - box.top };
  };

  const handleDrag = (id: string, info: PanInfo) => {
    const p = relPointer(info.point.x, info.point.y);
    if (!p) return;

    let targetId: string | null;

    if (drag?.targetId) {
      // Once the target is locked, keep it locked for the rest of the
      // drag. Bystander cards' idle slots overlap the lock-centre slot,
      // so re-running the sticky-target hit-test here would cause the
      // target to flip the moment the pointer crossed back into the
      // strip centre. Release-and-redrag to pick a different target.
      targetId = drag.targetId;
    } else {
      // Not yet locked: scan idle slots in pool order; first hit wins.
      let newTarget: string | null = null;
      for (let i = 0; i < pool.length; i++) {
        const n = pool[i];
        if (n.id === id) continue;
        const s = idleSlots[i];
        if (
          p.x >= s.x &&
          p.x <= s.x + s.w &&
          p.y >= -4 &&
          p.y <= CARD_H + 4
        ) {
          newTarget = n.id;
          break;
        }
      }
      targetId = newTarget;
    }

    let op: ReduceOp | null = null;
    if (targetId) {
      for (let i = 0; i < LOCK_OPS.length; i++) {
        const candidate = LOCK_OPS[i];
        if (!candidate) continue;
        const s = lockSlots[i];
        if (
          p.x >= s.x &&
          p.x <= s.x + s.w &&
          p.y >= -4 &&
          p.y <= CARD_H + 4
        ) {
          const a = pool.find((n) => n.id === id)!;
          const b = pool.find((n) => n.id === targetId)!;
          if (isOpLegal(a, b, candidate)) op = candidate;
          break;
        }
      }
    }

    setDrag({ id, targetId, op });
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

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ height: CARD_H, overflow: "visible" }}
      data-tauri-drag-region
    >
      {pool.map((node, i) => {
        const isDragged = drag?.id === node.id;
        const isTarget = drag?.targetId === node.id;
        const isBystander = locked && !isDragged && !isTarget;

        const slot =
          isTarget && locked
            ? lockSlots[2]
            : idleSlots[i] ?? { x: 0, w: CARD_W };

        return (
          <DragCard
            key={node.id}
            node={node}
            slot={slot}
            isDragged={isDragged}
            isTarget={isTarget}
            hidden={isBystander}
            primed={primed && !drag}
            onDragStart={() =>
              setDrag({ id: node.id, targetId: null, op: null })
            }
            onDrag={(info) => handleDrag(node.id, info)}
            onDragEnd={handleDragEnd}
          />
        );
      })}

      <AnimatePresence>
        {locked &&
          drag &&
          LOCK_OPS.map((op, i) => {
            if (!op) return null;
            const slot = lockSlots[i];
            const a = pool.find((n) => n.id === drag.id);
            const b = pool.find((n) => n.id === drag.targetId!);
            if (!a || !b) return null;
            const ok = isOpLegal(a, b, op);
            const val = ok ? combine(a, b, op).node.value : null;
            const isWinning = val !== null && Math.abs(val - TARGET) < EPS;
            const active = drag.op === op;
            return (
              <OpTile
                key={op}
                op={op}
                slot={slot}
                ok={ok}
                active={active}
                winning={isWinning}
              />
            );
          })}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------- DragCard ----------------------------------- */

function DragCard({
  node,
  slot,
  isDragged,
  isTarget,
  hidden,
  primed,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  node: ReduceNode;
  slot: Slot;
  isDragged: boolean;
  isTarget: boolean;
  hidden: boolean;
  primed: boolean;
  onDragStart: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: () => void;
}) {
  return (
    <motion.div
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{
        opacity: hidden ? 0 : 1,
        scale: isDragged ? 1.06 : isTarget ? 1.04 : 1,
        rotate: isDragged ? -2 : 0,
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 24,
        mass: 0.7,
      }}
      className="absolute card-face"
      data-no-drag
      style={{
        left: slot.x,
        top: 0,
        width: slot.w,
        height: CARD_H,
        borderRadius: 7,
        cursor: "grab",
        zIndex: isDragged ? 30 : isTarget ? 10 : 1,
        touchAction: "none",
        pointerEvents: hidden ? "none" : "auto",
        transition:
          "left 240ms cubic-bezier(0.2,0.8,0.2,1), width 240ms cubic-bezier(0.2,0.8,0.2,1)",
        boxShadow: isTarget
          ? "0 6px 14px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.1) inset, 0 0 0 1.5px rgba(232,217,160,0.6), 0 0 12px rgba(232,217,160,0.25)"
          : primed
            ? "0 4px 10px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(232,217,160,0.4)"
            : isDragged
              ? "0 8px 18px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.1) inset"
              : undefined,
      }}
    >
      <span
        className="text-ink-50 font-light leading-none tabular-nums"
        style={{ pointerEvents: "none", fontSize: 15 }}
      >
        {formatNumber(node.value)}
      </span>
    </motion.div>
  );
}

/* ---------------------------- OpTile ------------------------------------- */

function OpTile({
  op,
  slot,
  ok,
  active,
  winning,
}: {
  op: ReduceOp;
  slot: Slot;
  ok: boolean;
  active: boolean;
  winning: boolean;
}) {
  const glyph = op === "-" ? "−" : op;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, x: slot.x, y: 0 }}
      animate={{
        opacity: ok ? 1 : 0.35,
        scale: active ? 1.12 : 1,
        x: slot.x,
        y: 0,
      }}
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.12 } }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 22,
        mass: 0.65,
      }}
      className="absolute rounded-full flex items-center justify-center pointer-events-none"
      style={{
        top: (CARD_H - OP_W) / 2,
        width: OP_W,
        height: OP_W,
        background: active
          ? "radial-gradient(circle at 30% 30%, rgba(255,245,210,1) 0%, rgba(220,190,100,0.95) 100%)"
          : winning
            ? "radial-gradient(circle at 30% 30%, rgba(240,225,170,0.98) 0%, rgba(190,160,80,0.9) 100%)"
            : "radial-gradient(circle at 30% 30%, rgba(84,84,96,0.98) 0%, rgba(36,36,46,0.98) 100%)",
        color: active || winning ? "#1c1a10" : "rgb(240,240,248)",
        border:
          active || winning
            ? "1px solid rgba(232,217,160,0.95)"
            : "1px solid rgba(255,255,255,0.14)",
        boxShadow: active
          ? "0 0 0 2px rgba(232,217,160,0.35), 0 6px 16px rgba(232,217,160,0.5)"
          : winning
            ? "0 0 0 1.5px rgba(232,217,160,0.3), 0 3px 10px rgba(232,217,160,0.3)"
            : "0 3px 10px rgba(0,0,0,0.45)",
        zIndex: 25,
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1, fontWeight: 300 }}>
        {glyph}
      </span>
    </motion.div>
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
