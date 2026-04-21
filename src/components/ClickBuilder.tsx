import { useGame } from "@/store/gameStore";

const OPS: { label: string; token: string }[] = [
  { label: "+", token: "+" },
  { label: "−", token: "-" },
  { label: "×", token: "×" },
  { label: "÷", token: "÷" },
  { label: "(", token: "(" },
  { label: ")", token: ")" },
];

/**
 * Operator token row + backspace/clear. Card digits are inserted by tapping
 * the cards themselves; this row only handles operators.
 */
export function ClickBuilder() {
  const append = useGame((s) => s.appendToken);
  const backspace = useGame((s) => s.backspace);
  const clear = useGame((s) => s.clearInput);

  return (
    <div className="flex items-center gap-2" data-no-drag>
      <div className="grid grid-cols-6 gap-1 flex-1">
        {OPS.map((o) => (
          <button
            key={o.token}
            type="button"
            onClick={() => append(o.token)}
            className="token h-8 text-md"
          >
            {o.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={backspace}
        className="btn-ghost !py-1 !px-2 text-xs"
        title="Delete last token"
      >
        ⌫
      </button>
      <button
        type="button"
        onClick={clear}
        className="btn-ghost !py-1 !px-2 text-xs"
        title="Clear"
      >
        Clear
      </button>
    </div>
  );
}
