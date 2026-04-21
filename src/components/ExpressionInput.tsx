import { useEffect, useRef } from "react";
import { useGame } from "@/store/gameStore";
import { evaluateExpression } from "@/features/game/expression";
import { formatNumber } from "@/lib/format";
import { TARGET } from "@/lib/constants";

/**
 * Text surface the player types into. A live evaluator on the right edge
 * shows the current value — turns warm when it's 24 so the player gets a
 * subtle confirmation even before submitting.
 */
export function ExpressionInput() {
  const input = useGame((s) => s.input);
  const setInput = useGame((s) => s.setInput);
  const submit = useGame((s) => s.submit);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const preview = livePreview(input);

  return (
    <div className="relative glass-in rounded-xl flex items-center gap-2 px-3 py-2.5">
      <input
        ref={ref}
        value={input}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9+\-*/×÷() .]/g, "");
          setInput(cleaned);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="6 × 4 × (3 − 2)"
        className="flex-1 bg-transparent text-md font-mono text-ink-50 outline-none placeholder:text-ink-400/70"
        data-no-drag
        spellCheck={false}
        autoComplete="off"
      />
      <span
        className={[
          "font-mono text-sm tabular-nums tracking-tight min-w-[38px] text-right transition-colors",
          preview.isTarget
            ? "text-glow-300"
            : preview.valid
              ? "text-ink-200"
              : "text-ink-400/60",
        ].join(" ")}
      >
        {preview.text}
      </span>
    </div>
  );
}

function livePreview(raw: string): { text: string; valid: boolean; isTarget: boolean } {
  const t = raw.trim();
  if (!t) return { text: "—", valid: false, isTarget: false };
  try {
    const { value } = evaluateExpression(t);
    const txt = formatNumber(value);
    return { text: txt, valid: true, isTarget: Math.abs(value - TARGET) < 1e-6 };
  } catch {
    return { text: "—", valid: false, isTarget: false };
  }
}
