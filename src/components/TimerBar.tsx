import { useGame } from "@/store/gameStore";
import { RUSH_SECONDS } from "@/lib/constants";
import { formatTime } from "@/lib/format";

export function TimerBar() {
  const active = useGame((s) => s.rushActive);
  const ms = useGame((s) => s.rushTimeMs);
  if (!active && ms === RUSH_SECONDS * 1000) return null;

  const pct = Math.max(0, Math.min(1, ms / (RUSH_SECONDS * 1000)));
  const low = pct < 0.25;

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 h-[3px] rounded-full bg-white/5 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: low
              ? "linear-gradient(90deg, #F0B49E, #E6879C)"
              : "linear-gradient(90deg, #C3D0FF, #7A93FF)",
            transition: "width 100ms linear",
          }}
        />
      </div>
      <span
        className={[
          "text-xs font-mono tabular-nums w-10 text-right",
          low ? "text-glow-300 anim-pulse" : "text-ink-200",
        ].join(" ")}
      >
        {formatTime(ms)}
      </span>
    </div>
  );
}
