import {
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
 * Drag-to-merge reduce board.
 *
 * Cards sit in fixed slots (no flex reshuffling during drag). Grab one,
 * pull it onto another → four operator satellites appear anchored on the
 * *target* card (not the pointer) so they stay put while you aim; keep
 * dragging so the pointer hits a satellite → release to commit.
 *
 * Variants:
 *   - row: single row (used in the expanded window).
 *   - compact: up to 2×2 grid (used in the collapsed window).
 */

type Variant = "row" | "compact";

interface BubbleConfig {
  cardW: number;
  cardH: number;
  gap: number;
  opDist: number;
  opRadius: number;
  opSize: number;
  valueText: string;
  exprText: string;
  indexText: string;
  containerH: number;
  statusHeight: number;
  hGap: boolean;
  /** Show `#N` badges + expression subtitle on cards. Off in compact. */
  showMeta: boolean;
}

const ROW_CFG: BubbleConfig = {
  cardW: 66,
  cardH: 84,
  gap: 14,
  opDist: 44,
  opRadius: 21,
  opSize: 42,
  valueText: "24px",
  exprText: "8.5px",
  indexText: "8px",
  containerH: 118,
  statusHeight: 14,
  hGap: true,
  showMeta: true,
};

const COMPACT_CFG: BubbleConfig = {
  cardW: 50,
  cardH: 58,
  gap: 8,
  opDist: 36,
  opRadius: 25,
  opSize: 50,
  valueText: "18px",
  exprText: "7px",
  indexText: "0px",
  containerH: 150,
  statusHeight: 0,
  hGap: false,
  showMeta: false,
};

/**
 * Spring presets. Tuned for an "arrives and settles" feel — low overshoot,
 * quick to damp, no lingering bounce. Mirrors iOS UIKit defaults more than
 * framer-motion's playful defaults.
 */
const CARD_SPRING = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.6,
} as const;

const SATELLITE_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 28,
  mass: 0.55,
} as const;

/** Snap-back after a released drag. A touch softer than the active-pickup
 *  spring so the card "floats home" instead of snapping. */
const SNAP_BACK = {
  bounceStiffness: 240,
  bounceDamping: 26,
} as const;

/** CSS easing that matches the spring's feel — used for properties that
 *  motion doesn't animate (box-shadow, left, top on slot reshuffle). */
const EASE_CSS = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function opLayout(cfg: BubbleConfig): { op: ReduceOp; dx: number; dy: number }[] {
  const d = cfg.opDist;
  return [
    { op: "+", dx: 0, dy: -d },
    { op: "×", dx: d, dy: 0 },
    { op: "-", dx: 0, dy: d },
    { op: "÷", dx: -d, dy: 0 },
  ];
}

interface Slot {
  x: number;
  y: number;
}

interface DragState {
  id: string;
  /** Pointer in container coords — used for op-satellite hit tests. */
  px: number;
  py: number;
  targetId: string | null;
  op: ReduceOp | null;
}

/**
 * Short-lived choreography context recorded at merge time. Used so the
 * dragged card can fly into the target's slot (exit) and the freshly
 * spawned result can bloom out from that same spot (enter).
 */
interface MergeCtx {
  draggedId: string;
  targetId: string;
  targetSlot: Slot;
  draggedSlot: Slot;
}

function slotsFor(
  n: number,
  width: number,
  height: number,
  cfg: BubbleConfig,
  variant: Variant
): Slot[] {
  if (n <= 0) return [];
  const { cardW, cardH, gap } = cfg;

  if (variant === "compact") {
    // 2×2 when n=4, 2+1 (centered bottom) when n=3, single centered row
    // for n≤2. Keeping bottom row aligned with top for n=3 keeps the
    // centre-of-mass stable as cards fuse.
    const rows = n > 2 ? 2 : 1;
    const topCount = n > 2 ? 2 : n;
    const bottomCount = n > 2 ? n - 2 : 0;

    const gridH = rows * cardH + (rows - 1) * gap;
    const startY = Math.max(0, (height - gridH) / 2);

    const slot = (row: number, col: number, totalInRow: number): Slot => {
      const rowW = totalInRow * cardW + (totalInRow - 1) * gap;
      const sx = (width - rowW) / 2;
      return {
        x: sx + col * (cardW + gap),
        y: startY + row * (cardH + gap),
      };
    };

    const out: Slot[] = [];
    for (let i = 0; i < topCount; i++) out.push(slot(0, i, topCount));
    for (let i = 0; i < bottomCount; i++) out.push(slot(1, i, bottomCount));
    return out;
  }

  const totalW = n * cardW + (n - 1) * gap;
  const startX = Math.max(8, (width - totalW) / 2);
  const y = Math.max(0, (height - cardH) / 2);
  return Array.from({ length: n }, (_, i) => ({
    x: startX + i * (cardW + gap),
    y,
  }));
}

export interface BubbleBoardProps {
  variant?: Variant;
  /** Hide status line under the board. */
  hideStatus?: boolean;
}

export function BubbleBoard({
  variant = "row",
  hideStatus = false,
}: BubbleBoardProps = {}) {
  const pool = useGame((s) => s.reducePool);
  const commit = useGame((s) => s.commitReduce);

  const cfg = variant === "compact" ? COMPACT_CFG : ROW_CFG;
  const ops = useMemo(() => opLayout(cfg), [cfg]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: cfg.containerH });

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
    () => slotsFor(pool.length, size.w, size.h, cfg, variant),
    [pool.length, size.w, size.h, cfg, variant]
  );
  const slotMap = useMemo(() => {
    const m = new Map<string, Slot>();
    pool.forEach((n, i) => m.set(n.id, slots[i]));
    return m;
  }, [pool, slots]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [mergeCtx, setMergeCtx] = useState<MergeCtx | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  // Remember which node ids were in the pool on the previous render so the
  // current render can spot a freshly-spawned merge result. Used to bloom
  // the new card from the merge spot instead of wherever its new slot lands.
  const prevPoolIdsRef = useRef<Set<string>>(new Set());
  const prevPoolIds = prevPoolIdsRef.current;
  useEffect(() => {
    prevPoolIdsRef.current = new Set(pool.map((n) => n.id));
  }, [pool]);

  // Merge choreography window: once the merge has visually landed, clear
  // the context so subsequent renders behave normally.
  useEffect(() => {
    if (!mergeCtx) return;
    const t = window.setTimeout(() => setMergeCtx(null), 420);
    return () => window.clearTimeout(t);
  }, [mergeCtx]);

  // Auto-finish: exactly two bubbles left and some op hits 24. Picking up
  // a bubble (isDragging) cancels the countdown.
  const isDragging = drag !== null;
  useEffect(() => {
    if (pool.length !== 2 || isDragging) return;
    const [a, b] = pool;
    const winner = findWinningOp(a, b);
    if (!winner) return;
    const t = window.setTimeout(() => {
      // Auto-finish uses the same choreography as a manual drag-release
      // merge so both paths look consistent.
      const aSlot = slotMap.get(winner.aId);
      const bSlot = slotMap.get(winner.bId);
      if (aSlot && bSlot) {
        flushSync(() => {
          setMergeCtx({
            draggedId: winner.aId,
            targetId: winner.bId,
            draggedSlot: aSlot,
            targetSlot: bSlot,
          });
        });
      }
      commit(winner.aId, winner.bId, winner.op);
    }, 750);
    return () => window.clearTimeout(t);
  }, [pool, isDragging, commit, slotMap]);

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

    // Sticky-target: a new target only locks in when the pointer enters
    // another card's bbox. Once locked it stays locked until another
    // card's bbox takes over, so the satellites remain stable while the
    // player aims at one.
    let newTarget: string | null = null;
    for (const n of pool) {
      if (n.id === id) continue;
      const s = slotMap.get(n.id);
      if (!s) continue;
      const cx = s.x + cfg.cardW / 2;
      const cy = s.y + cfg.cardH / 2;
      if (
        Math.abs(px - cx) < cfg.cardW / 2 &&
        Math.abs(py - cy) < cfg.cardH / 2
      ) {
        newTarget = n.id;
        break;
      }
    }
    const targetId = newTarget ?? drag?.targetId ?? null;

    let op: ReduceOp | null = null;
    if (targetId) {
      const anchor = satelliteAnchor(slotMap.get(targetId)!, cfg);
      for (const sat of ops) {
        const sx = anchor.x + sat.dx;
        const sy = anchor.y + sat.dy;
        if (Math.hypot(px - sx, py - sy) < cfg.opRadius) {
          const a = pool.find((n) => n.id === id)!;
          const b = pool.find((n) => n.id === targetId)!;
          if (isOpLegal(a, b, sat.op)) op = sat.op;
          break;
        }
      }
    }

    setDrag({ id, px, py, targetId, op });
  };

  const handleDragEnd = () => {
    if (drag?.targetId && drag.op) {
      const a = pool.find((n) => n.id === drag.id);
      const b = pool.find((n) => n.id === drag.targetId);
      if (a && b && isOpLegal(a, b, drag.op)) {
        const draggedSlot = slotMap.get(a.id);
        const targetSlot = slotMap.get(b.id);
        if (draggedSlot && targetSlot) {
          // flushSync forces mergeCtx into the DOM before the commit-driven
          // render — so the affected cards render once *with* merge-aware
          // exit props *before* they're removed from the tree. Without
          // this, React batches setMergeCtx + commit into one render and
          // AnimatePresence reads stale exit props from the prior render.
          flushSync(() => {
            setMergeCtx({
              draggedId: a.id,
              targetId: b.id,
              draggedSlot,
              targetSlot,
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

  const draggedNode = drag ? pool.find((n) => n.id === drag.id) : null;
  const targetNode = drag?.targetId
    ? pool.find((n) => n.id === drag.targetId)
    : null;
  const satellitePos =
    drag?.targetId && targetNode
      ? satelliteAnchor(slotMap.get(drag.targetId)!, cfg)
      : null;

  const rootClass = cfg.hGap ? "flex flex-col gap-3" : "flex flex-col gap-1";

  return (
    <div className={rootClass}>
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ height: cfg.containerH, overflow: "visible" }}
      >
        <AnimatePresence initial={false}>
          {pool.map((node) => {
            const slot = slotMap.get(node.id);
            if (!slot) return null;
            const isDragged = drag?.id === node.id;
            const isHoverTarget = drag?.targetId === node.id;
            const isMergeResult =
              mergeCtx !== null && !prevPoolIds.has(node.id);
            return (
              <DragCard
                key={node.id}
                node={node}
                slot={slot}
                cfg={cfg}
                isDragged={isDragged}
                isHoverTarget={isHoverTarget}
                satellitesOpen={drag?.targetId != null}
                primed={primed}
                mergeCtx={mergeCtx}
                isMergeResult={isMergeResult}
                reducedMotion={reducedMotion}
                onDragStart={() =>
                  setDrag({
                    id: node.id,
                    px: slot.x + cfg.cardW / 2,
                    py: slot.y + cfg.cardH / 2,
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

        {draggedNode && targetNode && satellitePos && drag && (
          <OpSatellites
            anchor={satellitePos}
            pointer={{ x: drag.px, y: drag.py }}
            a={draggedNode}
            b={targetNode}
            activeOp={drag.op ?? null}
            cfg={cfg}
            layout={ops}
            reducedMotion={reducedMotion}
          />
        )}
      </div>

      {!hideStatus && cfg.statusHeight > 0 && (
        <div
          className="flex items-center justify-center px-2"
          style={{ minHeight: cfg.statusHeight }}
        >
          <span className="text-[11px] text-ink-400 text-center">
            {statusText(pool, drag)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Satellite menu anchor: always the *target card's centre*. Pointer-
 * dependent anchors drift mid-drag, turning operator pills into a moving
 * target the player can't reliably aim at.
 */
function satelliteAnchor(targetSlot: Slot, cfg: BubbleConfig): Slot {
  return {
    x: targetSlot.x + cfg.cardW / 2,
    y: targetSlot.y + cfg.cardH / 2,
  };
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
  cfg: BubbleConfig;
  isDragged: boolean;
  isHoverTarget: boolean;
  /** Any satellites are open — let the dragged card fade so they show. */
  satellitesOpen: boolean;
  primed: boolean;
  mergeCtx: MergeCtx | null;
  isMergeResult: boolean;
  reducedMotion: boolean;
  onDragStart: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: () => void;
}

function DragCard({
  node,
  slot,
  cfg,
  isDragged,
  isHoverTarget,
  satellitesOpen,
  primed,
  mergeCtx,
  isMergeResult,
  reducedMotion,
  onDragStart,
  onDrag,
  onDragEnd,
}: DragCardProps) {
  const isLeaf = node.children === undefined;
  const fadeForSatellites = isDragged && satellitesOpen;

  // Shared motion values for drag offset. Binding these to motion.div via
  // `style.x/y` (below) lets framer drive them during drag *and* lets us
  // derive rotate + shadow depth off the same physics — so tilt and depth
  // settle back to 0 together on release without extra bookkeeping.
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Displacement-based tilt — tracks lateral drag like a tilted index card.
  // Returns to 0 automatically when snap-to-origin brings x back to 0.
  const rotate = useTransform(x, [-90, 0, 90], [3, 0, -3], { clamp: true });
  // Depth shadow: stronger the farther from home (simulates "lifted off").
  const shadowStrength = useTransform(
    [x, y] as const,
    (latest) => {
      const [lx, ly] = latest as [number, number];
      return Math.min(1, Math.hypot(lx, ly) / 120);
    }
  );
  const shadowBlur = useTransform(shadowStrength, (s) => 16 + s * 24);
  const shadowLift = useTransform(shadowStrength, (s) => 8 + s * 16);
  const shadowAlpha = useTransform(shadowStrength, (s) => 0.32 + s * 0.22);
  const liftedBoxShadow = useTransform(
    [shadowLift, shadowBlur, shadowAlpha] as const,
    (latest) => {
      const [lift, blur, alpha] = latest as [number, number, number];
      return `0 ${lift}px ${blur}px rgba(0,0,0,${alpha}), 0 1px 0 rgba(255,255,255,0.12) inset, 0 -1px 0 rgba(0,0,0,0.5) inset`;
    }
  );

  // --- Merge choreography -------------------------------------------------
  //
  // Three roles a card can play during a merge:
  //   • dragged  → fly into the target slot, then fade
  //   • target   → shrink in place with a soft fade
  //   • result   → bloom out of the target slot into its new home
  // All other cards animate normally via CSS left/top on the reshuffle.
  const isMergeDragged = mergeCtx?.draggedId === node.id;
  const isMergeTarget = mergeCtx?.targetId === node.id;

  const initial = (() => {
    if (isMergeResult && mergeCtx) {
      // Start visually at the target slot, then slide home.
      return {
        opacity: 0,
        scale: reducedMotion ? 0.92 : 0.6,
        x: mergeCtx.targetSlot.x - slot.x,
        y: mergeCtx.targetSlot.y - slot.y,
      };
    }
    return { opacity: 0, scale: reducedMotion ? 0.96 : 0.88, x: 0, y: 0 };
  })();

  const exit = (() => {
    if (isMergeDragged && mergeCtx) {
      // Fly from current (own) slot into the target slot — the exit transform
      // is the delta between the two anchors.
      return {
        opacity: 0,
        scale: 0.65,
        x: mergeCtx.targetSlot.x - slot.x,
        y: mergeCtx.targetSlot.y - slot.y,
        transition: {
          duration: reducedMotion ? 0.14 : 0.22,
          ease: [0.4, 0, 0.2, 1] as const,
        },
      };
    }
    if (isMergeTarget) {
      return {
        opacity: 0,
        scale: 0.55,
        transition: {
          duration: reducedMotion ? 0.14 : 0.22,
          ease: [0.4, 0, 0.2, 1] as const,
        },
      };
    }
    return { opacity: 0, scale: 0.7 };
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
        opacity: fadeForSatellites ? 0.55 : 1,
        scale: isDragged ? 1.035 : isHoverTarget ? 1.025 : 1,
        // Keep x/y on 0 when not dragging; motion's drag handler writes to
        // the motionValue directly while dragging, so `x/y: 0` in animate is
        // the "home" target for snap-back / merge-result entrance.
        x: 0,
        y: 0,
      }}
      exit={exit}
      transition={
        reducedMotion
          ? { duration: 0.14, ease: [0.4, 0, 0.2, 1] }
          : CARD_SPRING
      }
      className="absolute card-face flex-col gap-0.5"
      style={{
        left: slot.x,
        top: slot.y,
        width: cfg.cardW,
        height: cfg.cardH,
        cursor: "grab",
        zIndex: isDragged ? 20 : isMergeDragged ? 15 : 1,
        touchAction: "none",
        x,
        y,
        rotate: isDragged ? rotate : 0,
        transition: `left 260ms ${EASE_CSS}, top 260ms ${EASE_CSS}, box-shadow 220ms ${EASE_CSS}`,
        // When dragged, the shadow is driven by a motion value that tracks
        // drag distance — gives the card a lifted, weighty feel that settles
        // back to rest as x/y snap home on release.
        boxShadow: isDragged
          ? liftedBoxShadow
          : isHoverTarget
            ? "0 10px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.1) inset, 0 -1px 0 rgba(0,0,0,0.45) inset, 0 0 0 2px rgba(232,217,160,0.65), 0 0 22px rgba(232,217,160,0.28)"
            : primed
              ? "0 10px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.09) inset, 0 -1px 0 rgba(0,0,0,0.45) inset, 0 0 0 1px rgba(232,217,160,0.45)"
              : undefined,
      }}
      data-no-drag
    >
      <span
        className="text-ink-50 font-light leading-none tabular-nums"
        style={{ pointerEvents: "none", fontSize: cfg.valueText }}
      >
        {formatNumber(node.value)}
      </span>
      {cfg.showMeta && !isLeaf && (
        <span
          className="font-mono text-ink-300 mt-0.5 px-1 text-center leading-[1.15]"
          style={{
            pointerEvents: "none",
            fontSize: cfg.exprText,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {node.expr}
        </span>
      )}
      {cfg.showMeta && isLeaf && node.cardIndex !== undefined && (
        <span
          className="absolute bottom-1 left-1.5 uppercase tracking-[0.15em] text-ink-400/70"
          style={{ pointerEvents: "none", fontSize: cfg.indexText }}
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
  pointer,
  a,
  b,
  activeOp,
  cfg,
  layout,
  reducedMotion,
}: {
  anchor: Slot;
  pointer: Slot;
  a: ReduceNode;
  b: ReduceNode;
  activeOp: ReduceOp | null;
  cfg: BubbleConfig;
  layout: { op: ReduceOp; dx: number; dy: number }[];
  reducedMotion: boolean;
}) {
  // Magnet range: a satellite within MAGNET_RANGE px of the pointer gets
  // pulled scale-wise toward the pointer, giving the iOS Dock "sensing"
  // feel. Inside opRadius the active-state scale takes over.
  const MAGNET_RANGE = cfg.opRadius * 1.9;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: anchor.x, top: anchor.y, zIndex: 30 }}
    >
      {layout.map(({ op, dx, dy }, i) => {
        const ok = isOpLegal(a, b, op);
        const val = ok ? combine(a, b, op).node.value : null;
        const isTargetPreview = val !== null && Math.abs(val - TARGET) < EPS;
        const active = activeOp === op;
        const size = cfg.opSize;
        const glyphSize = Math.round(size * 0.48);

        // Satellites live inside a container positioned at `anchor`, so the
        // pointer is still in container-coords and the satellite centre is
        // (anchor + {dx,dy}).
        const sx = anchor.x + dx;
        const sy = anchor.y + dy;
        const dist = Math.hypot(pointer.x - sx, pointer.y - sy);
        const magnetT = reducedMotion
          ? 0
          : Math.max(0, 1 - dist / MAGNET_RANGE);
        const magnetScale = 1 + magnetT * 0.08;
        const targetScale = active ? 1.12 : magnetScale;

        return (
          <motion.div
            key={op}
            initial={{
              opacity: 0,
              scale: reducedMotion ? 0.92 : 0.72,
              x: -size / 2,
              y: -size / 2,
            }}
            animate={{
              opacity: ok ? 1 : 0.35,
              scale: targetScale,
              x: dx - size / 2,
              y: dy - size / 2,
            }}
            exit={{
              opacity: 0,
              scale: reducedMotion ? 0.92 : 0.7,
              transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
            }}
            transition={
              reducedMotion
                ? { duration: 0.14, ease: [0.4, 0, 0.2, 1] }
                : { ...SATELLITE_SPRING, delay: i * 0.022 }
            }
            className="absolute rounded-full flex items-center justify-center"
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
                ? "0 0 0 3px rgba(232,217,160,0.35), 0 10px 26px rgba(232,217,160,0.5)"
                : isTargetPreview
                  ? "0 0 0 2px rgba(232,217,160,0.3), 0 6px 18px rgba(232,217,160,0.3)"
                  : "0 6px 18px rgba(0,0,0,0.45)",
              transition: `background 200ms ${EASE_CSS}, box-shadow 200ms ${EASE_CSS}, border-color 200ms ${EASE_CSS}, color 200ms ${EASE_CSS}`,
            }}
          >
            <span
              className="leading-none font-light"
              style={{ fontSize: glyphSize }}
            >
              {op === "-" ? "−" : op}
            </span>
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
