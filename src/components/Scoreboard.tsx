import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/store/gameStore";

export function Scoreboard() {
  const score = useGame((s) => s.score);
  const streak = useGame((s) => s.stats.streak);
  const difficulty = useGame((s) => s.hand?.difficulty ?? "normal");

  return (
    <div className="flex items-center gap-4">
      <ScoreStat value={score} />
      <StreakStat value={streak} />
      <span className="pill capitalize">{difficulty}</span>
    </div>
  );
}

/**
 * Score value counts up via spring when it changes. A static snap to the
 * new number feels like a receipt; an animated tick feels earned.
 */
function ScoreStat({ value }: { value: number }) {
  const reduced = useReducedMotion() ?? false;
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === value) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const ctl = animate(prev, value, {
      duration: 0.55,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => ctl.stop();
  }, [value, reduced]);

  return (
    <div className="flex flex-col items-start leading-none gap-1">
      <span className="text-2xs text-ink-400">Score</span>
      <span className="text-base font-mono text-ink-50 tabular-nums">
        {display}
      </span>
    </div>
  );
}

/**
 * Streak value pops when it increments — a small bounce on the display
 * so a hot hand feels rewarding. Decrements fall back to a plain swap.
 */
function StreakStat({ value }: { value: number }) {
  const reduced = useReducedMotion() ?? false;
  const prevRef = useRef(value);
  const didIncrement = value > prevRef.current;
  useEffect(() => {
    prevRef.current = value;
  }, [value]);

  return (
    <div className="flex flex-col items-start leading-none gap-1">
      <span className="text-2xs text-ink-400">Streak</span>
      <motion.span
        key={value}
        className="text-base font-mono text-ink-50 tabular-nums"
        initial={
          didIncrement && !reduced
            ? { scale: 0.85, y: 3, opacity: 0.5 }
            : false
        }
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 22, mass: 0.5 }}
      >
        {value ? `×${value}` : "—"}
      </motion.span>
    </div>
  );
}
