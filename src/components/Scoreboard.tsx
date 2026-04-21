import { useGame } from "@/store/gameStore";

export function Scoreboard() {
  const score = useGame((s) => s.score);
  const streak = useGame((s) => s.stats.streak);
  const difficulty = useGame((s) => s.hand?.difficulty ?? "normal");

  return (
    <div className="flex items-center gap-4">
      <Stat label="Score" value={String(score)} />
      <Stat label="Streak" value={streak ? `×${streak}` : "—"} />
      <span className="pill capitalize">{difficulty}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start leading-none gap-1">
      <span className="text-2xs text-ink-400">{label}</span>
      <span className="text-base font-mono text-ink-50 tabular-nums">
        {value}
      </span>
    </div>
  );
}
