import { motion } from "motion/react";
import { useGame } from "@/store/gameStore";

interface Props {
  value: number;
  used?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}

/**
 * A single playing card. Hover lifts it, tap inserts its value. When the
 * current submission is marked correct, all cards briefly glow and rise.
 */
export function Card({ value, used, onClick, size = "md" }: Props) {
  const feedback = useGame((s) => s.feedback);
  const isCorrect = feedback.kind === "correct";

  const dims =
    size === "sm" ? "w-9 h-12 text-base" : "w-[68px] h-[92px] text-[32px]";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={used}
      whileHover={used ? undefined : { y: -3 }}
      whileTap={used ? undefined : { scale: 0.97 }}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className={[
        "card-face font-light tracking-tight",
        dims,
        used ? "card-used" : "",
        isCorrect && !used ? "card-glow anim-rise" : "",
      ].join(" ")}
      data-no-drag
      aria-label={`card ${value}`}
    >
      <span className="text-ink-50">{value}</span>
      <span className="absolute top-1.5 left-2 text-[10px] font-medium tracking-widest text-ink-300/70">
        {value}
      </span>
    </motion.button>
  );
}
