import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
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
 * Sized for a ~280×68 window. Animation feel matches BubbleBoard: physics
 * drag with weighty shadow, magnetic op tiles, choreographed merge.
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

const CARD_SPRING = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.6,
} as const;

const OP_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 28,
  mass: 0.55,
} as const;

const SNAP_BACK = {
  bounceStiffness: 240,
  bounceDamping: 26,
} as const;

const EASE_CSS = "cubic-bezier(0.2, 0.8, 0.2, 1)";

interface Slot {
  x: number;
  w: number;
}

interface DragState {
  id: string;
  /** Pointer in container coords — used for op-tile magnetism. */
  px: number;
  py: number;
  targetId: string | null;
  op: ReduceOp | null;
}

interface MergeCtx {
  draggedId: string;
  targetId: string;
  draggedSlot: Slot;
  targetSlot: Slot;
  draggedValue: number;
  targetValue: number;
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
  const [mergeCtx, setMergeCtx] = useState<MergeCtx | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  const locked = drag?.targetId != null;

  const prevPoolIdsRef = useRef<Set<string>>(new Set());
  const prevPoolIds = prevPoolIdsRef.current;
  useEffect(() => {
    prevPoolIdsRef.current = new Set(pool.map((n) => n.id));
  }, [pool]);

  useEffect(() => {
    if (!mergeCtx) return;
    const t = window.setTimeout(() => setMergeCtx(null), 420);
    return () => window.clearTimeout(t);
  }, [mergeCtx]);

  const isDragging = drag !== null;
  useEffect(() => {
    if (pool.length !== 2 || isDragging) return;
    const [a, b] = pool;
    const winner = findWinningOp(a, b);
    if (!winner) return;
    const t = window.setTimeout(() => {
      const aIdx = pool.findIndex((n) => n.id === winner.aId);
      const bIdx = pool.findIndex((n) => n.id === winner.bId);
      const aSlot = idleSlots[aIdx];
      const bSlot = idleSlots[bIdx];
      const aNode = pool.find((n) => n.id === winner.aId);
      const bNode = pool.find((n) => n.id === winner.bId);
      if (aSlot && bSlot && aNode && bNode) {
        flushSync(() => {
          setMergeCtx({
            draggedId: winner.aId,
            targetId: winner.bId,
            draggedSlot: aSlot,
            targetSlot: bSlot,
            draggedValue: aNode.value,
            targetValue: bNode.value,
          });
        });
      }
      commit(winner.aId, winner.bId, winner.op);
    }, 750);
    return () => window.clearTimeout(t);
  }, [pool, isDragging, commit, idleSlots]);

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
      // Sticky lock — bystander idle slots overlap the lock-centre slot so
      // re-hit-testing would flip the target mid-gesture.
      targetId = drag.targetId;
    } else {
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

    setDrag({ id, px: p.x, py: p.y, targetId, op });
  };

  const handleDragEnd = () => {
    if (drag?.targetId && drag.op) {
      const a = pool.find((n) => n.id === drag.id);
      const b = pool.find((n) => n.id === drag.targetId);
      if (a && b && isOpLegal(a, b, drag.op)) {
        const aIdx = pool.findIndex((n) => n.id === a.id);
        const bIdx = pool.findIndex((n) => n.id === b.id);
        const draggedSlot = idleSlots[aIdx];
        const targetSlot = idleSlots[bIdx];
        if (draggedSlot && targetSlot) {
          flushSync(() => {
            setMergeCtx({
              draggedId: a.id,
              targetId: b.id,
              draggedSlot,
              targetSlot,
              draggedValue: a.value,
              targetValue: b.value,
            });
          });
        }
        commit(a.id, b.id, drag.op);
      }
    }
    setDrag(null);
  };

  const primed =
    pool.length === 2 && !drag && !!findWinningOp(pool[0], pool[1]);

  const winner =
    pool.length === 1 && Math.abs(pool[0].value - TARGET) < EPS
      ? pool[0]
      : null;

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
        const isMergeResult = mergeCtx !== null && !prevPoolIds.has(node.id);
        const isWinner = winner?.id === node.id;

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
            mergeCtx={mergeCtx}
            isMergeResult={isMergeResult}
            isWinner={isWinner}
            reducedMotion={reducedMotion}
            onDragStart={() =>
              setDrag({
                id: node.id,
                px: slot.x + slot.w / 2,
                py: CARD_H / 2,
                targetId: null,
                op: null,
              })
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
            // Magnet scale: pointer distance from the tile centre.
            const tileCx = slot.x + slot.w / 2;
            const tileCy = CARD_H / 2;
            const dist = Math.hypot(drag.px - tileCx, drag.py - tileCy);
            const magnetT = reducedMotion
              ? 0
              : Math.max(0, 1 - dist / (OP_W * 1.6));
            return (
              <OpTile
                key={op}
                op={op}
                slot={slot}
                ok={ok}
                active={active}
                winning={isWinning}
                magnetT={magnetT}
                reducedMotion={reducedMotion}
              />
            );
          })}
      </AnimatePresence>

      <AnimatePresence>
        {winner && (
          <WinGlow
            key={winner.id}
            slot={
              idleSlots[pool.findIndex((n) => n.id === winner.id)] ??
              idleSlots[0] ?? { x: 0, w: CARD_W }
            }
            reducedMotion={reducedMotion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------- DragCard ----------------------------------- */

interface DragCardProps {
  node: ReduceNode;
  slot: Slot;
  isDragged: boolean;
  isTarget: boolean;
  hidden: boolean;
  primed: boolean;
  mergeCtx: MergeCtx | null;
  isMergeResult: boolean;
  isWinner: boolean;
  reducedMotion: boolean;
  onDragStart: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: () => void;
}

function DragCard({
  node,
  slot,
  isDragged,
  isTarget,
  hidden,
  primed,
  mergeCtx,
  isMergeResult,
  isWinner,
  reducedMotion,
  onDragStart,
  onDrag,
  onDragEnd,
}: DragCardProps) {
  // Number morph: merge result counts from the closer source value up to
  // its final value. Matches BubbleBoard behaviour.
  const [displayValue, setDisplayValue] = useState(() => {
    if (isMergeResult && mergeCtx) {
      const { draggedValue, targetValue } = mergeCtx;
      return Math.abs(draggedValue - node.value) <
        Math.abs(targetValue - node.value)
        ? draggedValue
        : targetValue;
    }
    return node.value;
  });
  useEffect(() => {
    if (!isMergeResult || !mergeCtx) return;
    const { draggedValue, targetValue } = mergeCtx;
    const start =
      Math.abs(draggedValue - node.value) <
      Math.abs(targetValue - node.value)
        ? draggedValue
        : targetValue;
    if (Math.abs(start - node.value) < EPS) return;
    setDisplayValue(start);
    const controls = animate(start, node.value, {
      duration: reducedMotion ? 0.16 : 0.42,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setDisplayValue(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag physics — identical pattern to BubbleBoard. Motion values drive
  // tilt and shadow via useTransform so both settle naturally on release.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-70, 0, 70], [2.5, 0, -2.5], {
    clamp: true,
  });
  const shadowStrength = useTransform(
    [x, y] as const,
    (latest) => {
      const [lx, ly] = latest as [number, number];
      return Math.min(1, Math.hypot(lx, ly) / 90);
    }
  );
  const shadowBlur = useTransform(shadowStrength, (s) => 12 + s * 16);
  const shadowLift = useTransform(shadowStrength, (s) => 6 + s * 10);
  const shadowAlpha = useTransform(shadowStrength, (s) => 0.36 + s * 0.22);
  const liftedBoxShadow = useTransform(
    [shadowLift, shadowBlur, shadowAlpha] as const,
    (latest) => {
      const [lift, blur, alpha] = latest as [number, number, number];
      return `0 ${lift}px ${blur}px rgba(0,0,0,${alpha}), 0 1px 0 rgba(255,255,255,0.12) inset`;
    }
  );

  // Merge-choreography role for this card.
  const isMergeDragged = mergeCtx?.draggedId === node.id;
  const isMergeTarget = mergeCtx?.targetId === node.id;

  const initial = (() => {
    if (isMergeResult && mergeCtx) {
      return {
        opacity: 0,
        scale: reducedMotion ? 0.92 : 0.55,
        x: mergeCtx.targetSlot.x - slot.x,
        y: 0,
      };
    }
    return { opacity: 0, scale: reducedMotion ? 0.96 : 0.7, x: 0, y: 0 };
  })();

  const exit = (() => {
    if (isMergeDragged && mergeCtx) {
      return {
        opacity: 0,
        scale: 0.6,
        x: mergeCtx.targetSlot.x - slot.x,
        y: 0,
        transition: {
          duration: reducedMotion ? 0.14 : 0.22,
          ease: [0.4, 0, 0.2, 1] as const,
        },
      };
    }
    if (isMergeTarget) {
      return {
        opacity: 0,
        scale: 0.5,
        transition: {
          duration: reducedMotion ? 0.14 : 0.22,
          ease: [0.4, 0, 0.2, 1] as const,
        },
      };
    }
    return { opacity: 0, scale: 0.5 };
  })();

  return (
    <motion.div
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      dragTransition={SNAP_BACK}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={onDragEnd}
      initial={initial}
      animate={{
        opacity: hidden ? 0 : 1,
        scale: isDragged ? 1.04 : isTarget ? 1.03 : 1,
        x: 0,
        y: 0,
      }}
      exit={exit}
      transition={
        reducedMotion
          ? { duration: 0.14, ease: [0.4, 0, 0.2, 1] }
          : CARD_SPRING
      }
      className="absolute card-face"
      data-no-drag
      style={{
        left: slot.x,
        top: 0,
        width: slot.w,
        height: CARD_H,
        borderRadius: 7,
        cursor: "grab",
        zIndex: isDragged ? 30 : isTarget ? 10 : isMergeDragged ? 15 : 1,
        touchAction: "none",
        pointerEvents: hidden ? "none" : "auto",
        x,
        y,
        rotate: isDragged ? rotate : 0,
        transition: `left 240ms ${EASE_CSS}, width 240ms ${EASE_CSS}, box-shadow 220ms ${EASE_CSS}`,
        boxShadow: isDragged
          ? liftedBoxShadow
          : isWinner
            ? "0 8px 18px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.12) inset, 0 0 0 1.5px rgba(232,217,160,0.85), 0 0 18px rgba(232,217,160,0.5)"
            : isTarget
              ? "0 6px 14px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.1) inset, 0 0 0 1.5px rgba(232,217,160,0.6), 0 0 12px rgba(232,217,160,0.25)"
              : primed
                ? "0 4px 10px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(232,217,160,0.4)"
                : undefined,
      }}
    >
      <motion.span
        className="font-light leading-none tabular-nums"
        animate={{
          color: isWinner ? "rgb(244,228,164)" : "rgb(245,245,250)",
          textShadow: isWinner
            ? "0 0 12px rgba(232,217,160,0.75), 0 0 3px rgba(232,217,160,0.6)"
            : "0 0 0 rgba(232,217,160,0)",
          scale: isWinner ? [1, 1.16, 1.05] : 1,
        }}
        transition={
          isWinner
            ? {
                color: { duration: 0.28 },
                textShadow: { duration: 0.32 },
                scale: {
                  duration: 0.85,
                  times: [0, 0.35, 1],
                  ease: [0.2, 0.8, 0.2, 1],
                },
              }
            : { duration: 0.2 }
        }
        style={{ pointerEvents: "none", fontSize: 15 }}
      >
        {formatNumber(displayValue)}
      </motion.span>
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
  magnetT,
  reducedMotion,
}: {
  op: ReduceOp;
  slot: Slot;
  ok: boolean;
  active: boolean;
  winning: boolean;
  magnetT: number;
  reducedMotion: boolean;
}) {
  const glyph = op === "-" ? "−" : op;
  const magnetScale = 1 + magnetT * 0.08;
  const targetScale = active ? 1.12 : magnetScale;
  return (
    <motion.div
      initial={{
        opacity: 0,
        scale: reducedMotion ? 0.92 : 0.6,
        x: slot.x,
        y: 0,
      }}
      animate={{
        opacity: ok ? 1 : 0.35,
        scale: targetScale,
        x: slot.x,
        y: 0,
      }}
      exit={{
        opacity: 0,
        scale: reducedMotion ? 0.92 : 0.55,
        transition: { duration: 0.12 },
      }}
      transition={
        reducedMotion
          ? { duration: 0.14, ease: [0.4, 0, 0.2, 1] }
          : OP_SPRING
      }
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
        transition: `background 180ms ${EASE_CSS}, box-shadow 180ms ${EASE_CSS}, border-color 180ms ${EASE_CSS}, color 180ms ${EASE_CSS}`,
        zIndex: 25,
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1, fontWeight: 300 }}>
        {glyph}
      </span>
    </motion.div>
  );
}

/* ---------------------------- WinGlow ----------------------------------- */

/**
 * Compact celebration for the strip HUD: a single pulsing ring behind
 * the winning card. The strip is too narrow for orbital particles, so the
 * card's own gold glow does the heavy lifting.
 */
function WinGlow({
  slot,
  reducedMotion,
}: {
  slot: Slot;
  reducedMotion: boolean;
}) {
  if (reducedMotion) return null;
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0.5 }}
      animate={{ scale: 1.9, opacity: 0 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      style={{
        position: "absolute",
        left: slot.x - 4,
        top: -4,
        width: slot.w + 8,
        height: CARD_H + 8,
        borderRadius: 10,
        border: "1.5px solid rgba(232,217,160,0.6)",
        pointerEvents: "none",
        zIndex: 4,
      }}
    />
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
