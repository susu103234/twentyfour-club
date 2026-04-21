import { useGame } from "@/store/gameStore";
import { todayKey } from "@/lib/random";

/**
 * Three-mode toggle. Daily shows a subtle dot when today's hand is pending.
 */
export function ModeToggle() {
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);
  const done = useGame((s) => s.dailySolvedOn[todayKey()]);

  const modes: { id: "chill" | "rush" | "daily"; label: string }[] = [
    { id: "chill", label: "Chill" },
    { id: "rush", label: "Rush" },
    { id: "daily", label: "Daily" },
  ];

  return (
    <div className="inline-flex rounded-full glass-in p-[2px] text-xs">
      {modes.map((m) => {
        const active = mode === m.id;
        const showDot = m.id === "daily" && !done;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={
              "relative px-3 py-[3px] rounded-full transition-colors " +
              (active ? "bg-white/10 text-ink-50" : "text-ink-300 hover:text-ink-100")
            }
          >
            {m.label}
            {showDot && (
              <span
                className="absolute top-[3px] right-[6px] w-[4px] h-[4px] rounded-full"
                style={{ background: "rgba(159,179,255,0.7)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
