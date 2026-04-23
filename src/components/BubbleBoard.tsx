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
// Shared spring tuple so imperative animate() calls match the declarative
// CARD_SPRING used by <motion.div>'s transition prop.
const SPRING_ANIMATE_OPTS = {
  type: "spring" as const,
  stiffness: 320,
  damping: 30,
  mass: 0.6,
};
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
  /**
   * Grab offset: (pointer - card centre) captured at drag-start. Lets the
   * water-fusion layer anchor the "dragged" blob on the card's actual
   * centre (pointer − grabOffset) instead of on the pointer itself, so
   * the blob tracks the card body no matter where the user grabbed it.
   */
  grabOffsetX: number;
  grabOffsetY: number;
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
  draggedValue: number;
  targetValue: number;
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

    setDrag({
      id,
      px,
      py,
      grabOffsetX: drag?.grabOffsetX ?? 0,
      grabOffsetY: drag?.grabOffsetY ?? 0,
      targetId,
      op,
    });
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

  // Winning state: a single card left whose value is 24. Drives the gold
  // glow on the card and the one-shot WinBurst effect next to it.
  const winner =
    pool.length === 1 && Math.abs(pool[0].value - TARGET) < EPS
      ? pool[0]
      : null;
  const winnerSlot = winner ? slotMap.get(winner.id) : null;

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
        {/* Water-fusion layer: rendered behind the cards. Two soft cool-
            tinted droplets at the dragged-card and target-card centres,
            under a goo filter that fuses them when they're close. The
            effect only shows up while a target is actively locked, so
            the cards look like a pair of water beads coalescing at the
            moment of contact. */}
        {!reducedMotion &&
          drag &&
          drag.targetId &&
          targetNode &&
          (() => {
            const targetSlot = slotMap.get(drag.targetId);
            if (!targetSlot) return null;
            const blobSize = Math.round(cfg.cardH * 1.15);
            const targetCx = targetSlot.x + cfg.cardW / 2;
            const targetCy = targetSlot.y + cfg.cardH / 2;
            // Recover the dragged card's actual centre — the pointer minus
            // the grab offset captured at drag-start. Without this the
            // blob would anchor on the pointer (potentially near the card
            // edge) instead of the card body.
            const draggedCx = drag.px - drag.grabOffsetX;
            const draggedCy = drag.py - drag.grabOffsetY;
            // Surface-tension pull: as the dragged card approaches the
            // target, the target blob drifts a little toward the dragged
            // one. Reads like two droplets reaching for each other.
            const centerDist = Math.hypot(
              draggedCx - targetCx,
              draggedCy - targetCy
            );
            const proximity = Math.max(
              0,
              1 - centerDist / (blobSize * 1.3)
            );
            const pullX = (draggedCx - targetCx) * 0.18 * proximity;
            const pullY = (draggedCy - targetCy) * 0.18 * proximity;
            return (
              <div
                className="absolute inset-0 pointer-events-none"
                // zIndex 0 keeps the fusion layer beneath every card;
                // the water aura only peeks past the card edges.
                style={{ filter: "url(#card-fusion)", zIndex: 0 }}
              >
                {/* Dragged-card blob — follows the real card centre. */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    position: "absolute",
                    left: draggedCx - blobSize / 2,
                    top: draggedCy - blobSize / 2,
                    width: blobSize,
                    height: blobSize,
                    borderRadius: "9999px",
                    background: "rgba(186,206,255,0.6)",
                  }}
                />
                {/* Target-card blob — pulls toward the dragged blob on
                    proximity to simulate surface tension. */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    position: "absolute",
                    left: targetCx + pullX - blobSize / 2,
                    top: targetCy + pullY - blobSize / 2,
                    width: blobSize,
                    height: blobSize,
                    borderRadius: "9999px",
                    background: "rgba(186,206,255,0.6)",
                  }}
                />
              </div>
            );
          })()}

        <AnimatePresence initial={false}>
          {pool.map((node) => {
            const slot = slotMap.get(node.id);
            if (!slot) return null;
            const isDragged = drag?.id === node.id;
            const isHoverTarget = drag?.targetId === node.id;
            const isMergeResult =
              mergeCtx !== null && !prevPoolIds.has(node.id);
            const isWinner = winner?.id === node.id;
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
                isWinner={isWinner}
                reducedMotion={reducedMotion}
                onDragStart={(info) => {
                  const p = relPointer(info.point.x, info.point.y);
                  const px = p?.x ?? slot.x + cfg.cardW / 2;
                  const py = p?.y ?? slot.y + cfg.cardH / 2;
                  // grab offset = pointer − card centre at the moment
                  // the grab happens. Subtracted from the live pointer
                  // later to recover the card's centre during drag.
                  const grabOffsetX = px - (slot.x + cfg.cardW / 2);
                  const grabOffsetY = py - (slot.y + cfg.cardH / 2);
                  setDrag({
                    id: node.id,
                    px,
                    py,
                    grabOffsetX,
                    grabOffsetY,
                    targetId: null,
                    op: null,
                  });
                }}
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

        <AnimatePresence>
          {winner && winnerSlot && (
            <WinBurst
              key={winner.id}
              center={{
                x: winnerSlot.x + cfg.cardW / 2,
                y: winnerSlot.y + cfg.cardH / 2,
              }}
              reducedMotion={reducedMotion}
            />
          )}
        </AnimatePresence>
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
  isWinner: boolean;
  reducedMotion: boolean;
  onDragStart: (info: PanInfo) => void;
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
  isWinner,
  reducedMotion,
  onDragStart,
  onDrag,
  onDragEnd,
}: DragCardProps) {
  const isLeaf = node.children === undefined;
  // Dragged card stays fully opaque — the water-fusion layer behind the
  // cards is what communicates "these two are merging." Fading the card
  // (the old behaviour) made it read as half-committed to the action.
  void satellitesOpen;

  // Number morph: for a fresh merge result, show the value counting from
  // one of the source values to the final. Pick whichever source is
  // numerically closer so the morph direction feels continuous rather than
  // a jarring swing.
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
    // Mount-once morph: node identity is stable for the DragCard's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const initial = isMergeResult && mergeCtx
    ? { opacity: 0, scale: reducedMotion ? 0.92 : 0.6 }
    : { opacity: 0, scale: reducedMotion ? 0.96 : 0.88 };

  // Merge-result entrance: set the motion values to the target-slot delta
  // before paint, then animate them imperatively back to 0. Doing this on
  // the motion values directly (rather than via animate.x/y on the prop)
  // avoids a per-render conflict with framer's own drag writes — that
  // conflict was the source of the mid-drag flicker.
  useLayoutEffect(() => {
    if (!isMergeResult || !mergeCtx) return;
    const dx = mergeCtx.targetSlot.x - slot.x;
    const dy = mergeCtx.targetSlot.y - slot.y;
    x.set(dx);
    y.set(dy);
    const xCtl = animate(x, 0, SPRING_ANIMATE_OPTS);
    const yCtl = animate(y, 0, SPRING_ANIMATE_OPTS);
    return () => {
      xCtl.stop();
      yCtl.stop();
    };
    // Mount-once entrance; slot / mergeCtx are fresh per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      onDragStart={(_, info) => onDragStart(info)}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={onDragEnd}
      initial={initial}
      animate={{
        opacity: 1,
        // Hover-target gets a slow breathing scale (1.022 → 1.04 → 1.022)
        // to say "chosen, and listening." A static scale felt binary;
        // the breath gives the lock a heartbeat without being noisy.
        scale: isDragged
          ? 1.035
          : isHoverTarget
            ? reducedMotion
              ? 1.025
              : [1.022, 1.04, 1.022]
            : 1,
        // NOTE: x/y intentionally omitted. They're fully owned by the
        // motion values bound into style — framer's drag writes to them
        // during a gesture and `dragSnapToOrigin` springs them back on
        // release. Putting x/y: 0 here causes an animate-vs-drag race
        // and manifests as mid-drag flicker.
      }}
      exit={exit}
      transition={
        reducedMotion
          ? { duration: 0.14, ease: [0.4, 0, 0.2, 1] }
          : {
              default: CARD_SPRING,
              // Per-prop override: breathing scale runs on a loop, the
              // rest uses the standard settle spring.
              scale: isHoverTarget
                ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                : CARD_SPRING,
            }
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
          : isWinner
            ? "0 14px 32px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.14) inset, 0 -1px 0 rgba(0,0,0,0.45) inset, 0 0 0 2px rgba(232,217,160,0.85), 0 0 36px rgba(232,217,160,0.55)"
            : isHoverTarget
              ? "0 10px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.1) inset, 0 -1px 0 rgba(0,0,0,0.45) inset, 0 0 0 2px rgba(232,217,160,0.65), 0 0 22px rgba(232,217,160,0.28)"
              : primed
                ? "0 10px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.09) inset, 0 -1px 0 rgba(0,0,0,0.45) inset, 0 0 0 1px rgba(232,217,160,0.45)"
                : undefined,
      }}
      data-no-drag
    >
      <motion.span
        className="font-light leading-none tabular-nums"
        animate={{
          color: isWinner ? "rgb(244,228,164)" : "rgb(245,245,250)",
          textShadow: isWinner
            ? "0 0 18px rgba(232,217,160,0.75), 0 0 4px rgba(232,217,160,0.6)"
            : "0 0 0 rgba(232,217,160,0)",
          scale: isWinner ? [1, 1.18, 1.06] : 1,
        }}
        transition={
          isWinner
            ? {
                color: { duration: 0.28 },
                textShadow: { duration: 0.32 },
                scale: {
                  duration: 0.9,
                  times: [0, 0.35, 1],
                  ease: [0.2, 0.8, 0.2, 1],
                },
              }
            : { duration: 0.2 }
        }
        style={{ pointerEvents: "none", fontSize: cfg.valueText }}
      >
        {formatNumber(displayValue)}
      </motion.span>
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

        // Magnet scale: the satellite gains a touch of size as the pointer
        // approaches its centre (iOS Dock sensing). Pointer hit radius
        // `MAGNET_RANGE` tuned wider than the lock radius so the effect
        // is felt before activation.
        const sx = anchor.x + dx;
        const sy = anchor.y + dy;
        const dist = Math.hypot(pointer.x - sx, pointer.y - sy);
        const magnetT = reducedMotion
          ? 0
          : Math.max(0, 1 - dist / MAGNET_RANGE);
        const magnetScale = 1 + magnetT * 0.08;
        const targetScale = active ? 1.12 : magnetScale;

        return (
          <OpSatellite
            key={op}
            op={op}
            dx={dx}
            dy={dy}
            size={size}
            ok={ok}
            active={active}
            isTargetPreview={isTargetPreview}
            targetScale={targetScale}
            indexForStagger={i}
            reducedMotion={reducedMotion}
          />
        );
      })}
    </div>
  );
}

/* ----------------------------- OpSatellite -------------------------------- */

function OpSatellite({
  op,
  dx,
  dy,
  size,
  ok,
  active,
  isTargetPreview,
  targetScale,
  indexForStagger,
  reducedMotion,
}: {
  op: ReduceOp;
  dx: number;
  dy: number;
  size: number;
  ok: boolean;
  active: boolean;
  isTargetPreview: boolean;
  targetScale: number;
  indexForStagger: number;
  reducedMotion: boolean;
}) {
  const glyphSize = Math.round(size * 0.48);

  // Activation ring pulse: one-shot ring that fires every time the
  // satellite transitions from inactive → active. We key a nested ring
  // element by a counter that bumps on each activation, so the
  // AnimatePresence beneath sees a fresh mount and plays the ring out.
  const [pulseKey, setPulseKey] = useState(0);
  const prevActiveRef = useRef(false);
  useEffect(() => {
    if (active && !prevActiveRef.current) setPulseKey((k) => k + 1);
    prevActiveRef.current = active;
  }, [active]);

  return (
    <motion.div
      initial={{
        opacity: 0,
        scale: reducedMotion ? 0.92 : 0.82,
        // Start ~35 % of the way to the final slot — no messy stack
        // at the card centre, just a short "already on the way" slide
        // that lets the stagger breathe.
        x: dx * 0.35 - size / 2,
        y: dy * 0.35 - size / 2,
      }}
      animate={{
        opacity: ok ? 1 : 0.35,
        scale: targetScale,
        x: dx - size / 2,
        y: dy - size / 2,
      }}
      exit={{
        opacity: 0,
        // Pull back toward the card on exit so the dismissal reverses
        // the emergence cleanly.
        scale: reducedMotion ? 0.92 : 0.75,
        x: dx * 0.35 - size / 2,
        y: dy * 0.35 - size / 2,
        transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
      }}
      transition={
        reducedMotion
          ? { duration: 0.14, ease: [0.4, 0, 0.2, 1] }
          : { ...SATELLITE_SPRING, delay: indexForStagger * 0.028 }
      }
      className="absolute rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        // Three-state visual, stripped back to a glass language:
        //  • default  — dark translucent glass, crisp white glyph
        //  • preview  — same glass, gold border + soft halo (hint, not
        //               fill) so the winning op doesn't shout
        //  • active   — warm gold fill, dark glyph (earned, not
        //               previewed)
        background: active
          ? "linear-gradient(180deg, rgba(255,245,210,0.97) 0%, rgba(220,190,100,0.92) 100%)"
          : "linear-gradient(180deg, rgba(36,38,48,0.78) 0%, rgba(18,20,28,0.82) 100%)",
        backdropFilter: active ? undefined : "blur(14px) saturate(130%)",
        WebkitBackdropFilter: active
          ? undefined
          : "blur(14px) saturate(130%)",
        color: active
          ? "rgba(38,28,10,1)"
          : isTargetPreview
            ? "rgba(244,228,164,0.98)"
            : "rgba(248,248,252,0.92)",
        border: active
          ? "1px solid rgba(232,217,160,0.95)"
          : isTargetPreview
            ? "1px solid rgba(232,217,160,0.55)"
            : "1px solid rgba(255,255,255,0.14)",
        boxShadow: active
          ? "0 10px 26px rgba(232,217,160,0.55), 0 0 0 2px rgba(232,217,160,0.28), 0 1px 0 rgba(255,245,210,0.55) inset"
          : isTargetPreview
            ? "0 6px 18px rgba(0,0,0,0.35), 0 0 22px rgba(232,217,160,0.22), 0 1px 0 rgba(255,255,255,0.1) inset, 0 -1px 0 rgba(0,0,0,0.3) inset"
            : "0 6px 18px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.3) inset",
        transition: `background 220ms ${EASE_CSS}, box-shadow 220ms ${EASE_CSS}, border-color 220ms ${EASE_CSS}, color 220ms ${EASE_CSS}`,
      }}
    >
      <span
        className="leading-none font-light relative"
        style={{ fontSize: glyphSize }}
      >
        {op === "-" ? "−" : op}
      </span>
      {/* Activation ring: single radiating pulse each time the satellite
          becomes active. Keyed by a counter so successive activations
          remount this element and replay the outward fade. */}
      {!reducedMotion && (
        <AnimatePresence>
          {pulseKey > 0 && (
            <motion.div
              key={pulseKey}
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.55, opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: "9999px",
                border: "1.5px solid rgba(255,245,210,0.9)",
                pointerEvents: "none",
              }}
            />
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

/* ------------------------------ helpers --------------------------------- */

interface Winner {
  aId: string;
  bId: string;
  op: ReduceOp;
}

/* ---------------------------- WinBurst ---------------------------------- */

/**
 * One-shot celebration overlay rendered at the winning card's centre.
 * Two expanding gold rings + a ring of gold particles. Auto-fades on its
 * own; unmounts cleanly if the user undoes the winning move.
 */
function WinBurst({
  center,
  reducedMotion,
}: {
  center: Slot;
  reducedMotion: boolean;
}) {
  if (reducedMotion) return null;

  const RING_COUNT = 2;
  const PARTICLE_COUNT = 8;
  const PARTICLE_DIST = 58;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: center.x, top: center.y, zIndex: 25 }}
    >
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <motion.div
          key={`ring-${i}`}
          initial={{ scale: 0.7, opacity: 0.55 }}
          animate={{ scale: 3.2 + i * 0.2, opacity: 0 }}
          transition={{
            duration: 1.0 + i * 0.15,
            ease: [0.2, 0.8, 0.2, 1],
            delay: i * 0.22,
          }}
          style={{
            position: "absolute",
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            borderRadius: "9999px",
            border: "1.5px solid rgba(232,217,160,0.75)",
            boxShadow: "0 0 18px rgba(232,217,160,0.35)",
          }}
        />
      ))}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        // Start pointing up, go clockwise — evenly distributed.
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 - Math.PI / 2;
        const dx = Math.cos(angle) * PARTICLE_DIST;
        const dy = Math.sin(angle) * PARTICLE_DIST;
        return (
          <motion.div
            key={`p-${i}`}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: dx, y: dy, opacity: 0, scale: 0.35 }}
            transition={{
              duration: 0.9,
              ease: [0.2, 0.8, 0.2, 1],
              delay: 0.04 * i,
            }}
            style={{
              position: "absolute",
              left: -3.5,
              top: -3.5,
              width: 7,
              height: 7,
              borderRadius: "9999px",
              background:
                "radial-gradient(circle at 30% 30%, rgba(255,245,210,1) 0%, rgba(232,217,160,0.45) 60%, transparent 100%)",
              boxShadow: "0 0 10px rgba(232,217,160,0.7)",
            }}
          />
        );
      })}
    </div>
  );
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
