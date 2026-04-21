import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { combine, isOpLegal, type ReduceNode, type ReduceOp } from "@/features/game/reduce";
import { formatNumber } from "@/lib/format";
import { TARGET, EPS } from "@/lib/constants";

/**
 * Reduce Mode: instead of typing an expression, the player taps two cards,
 * then an operator. The chosen pair collapses into one intermediate card.
 * When the pool shrinks to a single card, its value is submitted.
 *
 * This is the default input mode because it eliminates parentheses entirely
 * — the reduction order IS the parenthesisation — and it fits a small
 * floating window without a text input surface.
 */
export function ReduceBoard() {
  const pool = useGame((s) => s.reducePool);
  const selected = useGame((s) => s.reduceSelected);
  const toggle = useGame((s) => s.toggleReduceSelection);
  const applyOp = useGame((s) => s.applyReduceOp);

  const canPickOp = selected.length === 2;
  const a = canPickOp ? pool.find((n) => n.id === selected[0]) : undefined;
  const b = canPickOp ? pool.find((n) => n.id === selected[1]) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-2.5 min-h-[104px]">
        <AnimatePresence initial={false}>
          {pool.map((node) => {
            const order = selected.indexOf(node.id);
            return (
              <ReduceCard
                key={node.id}
                node={node}
                selected={order !== -1}
                selectionOrder={order}
                onTap={() => toggle(node.id)}
              />
            );
          })}
        </AnimatePresence>
      </div>

      <OperatorRow
        active={canPickOp}
        legal={(op) => (a && b ? isOpLegal(a, b, op) : false)}
        preview={(op) =>
          a && b && isOpLegal(a, b, op)
            ? formatNumber(combine(a, b, op).node.value)
            : null
        }
        onPick={applyOp}
      />

      <div className="flex items-center justify-center px-2 min-h-[14px]">
        <span className="text-[11px] text-ink-400 text-center">
          {statusText(pool, selected.length)}
        </span>
      </div>
    </div>
  );
}

/**
 * Single authoritative status line. Ending-state wins over selection hints
 * so the player never sees "Tap another card" next to "Ended at -24".
 */
function statusText(
  pool: ReduceNode[],
  selectedCount: number
): string {
  if (pool.length === 1) {
    return isTarget(pool[0])
      ? ""
      : `Ended at ${formatNumber(pool[0].value)} — Undo to adjust`;
  }
  if (selectedCount === 2) return "Pick an operator";
  if (selectedCount === 1) return "Tap another card";
  return "Tap two cards to combine";
}

interface CardProps {
  node: ReduceNode;
  selected: boolean;
  selectionOrder: number;
  onTap: () => void;
}

function ReduceCard({ node, selected, selectionOrder, onTap }: CardProps) {
  const isLeaf = node.children === undefined;
  const size = "w-[74px] h-[98px]";
  return (
    <motion.button
      type="button"
      onClick={onTap}
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{
        opacity: 1,
        scale: selected ? 1.03 : 1,
        y: selected ? -4 : 0,
      }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      whileHover={{ y: selected ? -4 : -2 }}
      whileTap={{ scale: 0.97 }}
      className={`card-face ${size} flex-col gap-0.5 ${selected ? "card-glow" : ""}`}
      data-no-drag
    >
      {/* big value */}
      <span className="text-[28px] text-ink-50 font-light leading-none">
        {formatNumber(node.value)}
      </span>
      {/* sub-expression for inner nodes — wraps up to 2 lines so long
          end-state expressions stay legible instead of being ellipsed */}
      {!isLeaf && (
        <span
          className="text-[9.5px] font-mono text-ink-300 mt-1 px-1.5 text-center leading-[1.2] break-words"
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {node.expr}
        </span>
      )}
      {/* selection order badge */}
      {selectionOrder !== -1 && (
        <span
          className="absolute top-1.5 right-1.5 w-4 h-4 inline-flex items-center justify-center rounded-full text-[9px] font-mono"
          style={{
            background: "rgba(232,217,160,0.18)",
            color: "rgb(240,231,200)",
            border: "1px solid rgba(232,217,160,0.4)",
          }}
        >
          {selectionOrder + 1}
        </span>
      )}
      {/* leaf corner pip */}
      {isLeaf && node.cardIndex !== undefined && (
        <span className="absolute bottom-1.5 left-2 text-[9px] uppercase tracking-widest text-ink-400/70">
          card {node.cardIndex + 1}
        </span>
      )}
    </motion.button>
  );
}

const OP_LIST: ReduceOp[] = ["+", "-", "×", "÷"];

interface OpRowProps {
  active: boolean;
  legal: (op: ReduceOp) => boolean;
  preview: (op: ReduceOp) => string | null;
  onPick: (op: ReduceOp) => void;
}

function OperatorRow({ active, legal, preview, onPick }: OpRowProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="flex items-center justify-center gap-1.5"
          data-no-drag
        >
          {OP_LIST.map((op) => {
            const ok = legal(op);
            const val = ok ? preview(op) : null;
            const isTargetPreview =
              val !== null && Math.abs(Number(val) - TARGET) < EPS;
            return (
              <button
                key={op}
                type="button"
                disabled={!ok}
                onClick={() => ok && onPick(op)}
                className="token w-12 h-11 text-lg flex flex-col items-center justify-center gap-[1px] leading-none"
                style={{
                  opacity: ok ? 1 : 0.25,
                  cursor: ok ? "pointer" : "default",
                  borderColor: isTargetPreview
                    ? "rgba(232,217,160,0.55)"
                    : undefined,
                  boxShadow: isTargetPreview
                    ? "0 0 0 1px rgba(232,217,160,0.28), 0 2px 10px rgba(232,217,160,0.18)"
                    : undefined,
                }}
              >
                <span>{op === "-" ? "−" : op}</span>
                {val !== null && (
                  <span
                    className="text-[9px] font-mono tabular-nums"
                    style={{
                      color: isTargetPreview
                        ? "rgb(240,231,200)"
                        : "rgba(230,230,240,0.55)",
                    }}
                  >
                    {val}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function isTarget(node: ReduceNode): boolean {
  return Math.abs(node.value - TARGET) < EPS;
}
