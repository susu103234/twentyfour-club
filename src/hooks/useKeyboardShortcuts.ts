import { useEffect } from "react";
import { useGame } from "@/store/gameStore";
import { useUi } from "@/store/uiStore";
import type { ReduceOp } from "@/features/game/reduce";

/**
 * Global keyboard helpers.
 *
 * Always-on:
 *  - Esc: clear input / deselect reduction
 *  - Cmd/Ctrl+H: progressive hint
 *  - Cmd/Ctrl+N: next hand
 *  - Cmd/Ctrl+.: collapse/expand toggle
 *
 * Reduce mode (default):
 *  - 1..4: select the Nth card in the current pool
 *  - +, -, *, /: apply op when two cards are selected
 *  - u: undo last reduction
 *  - r: reset pool
 *
 * Typed mode:
 *  - Enter: submit (when not in an input)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputTarget =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      const game = useGame.getState();
      const ui = useUi.getState();
      const mod = e.metaKey || e.ctrlKey;
      const inReduce = game.preferences.inputMode === "reduce";

      if (mod && e.key.toLowerCase() === "h") {
        e.preventDefault();
        game.requestHint();
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        game.nextHand();
        return;
      }
      if (mod && e.key === ".") {
        e.preventDefault();
        ui.toggleCollapsed();
        return;
      }
      if (e.key === "Escape") {
        if (inReduce) game.resetReduce();
        else game.clearInput();
        return;
      }

      if (inReduce && !isInputTarget) {
        // Pool-index selection 1..N
        const digit = Number(e.key);
        if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
          const pool = game.reducePool;
          const target = pool[digit - 1];
          if (target) {
            e.preventDefault();
            game.toggleReduceSelection(target.id);
            return;
          }
        }
        const opMap: Record<string, ReduceOp> = {
          "+": "+",
          "-": "-",
          "*": "×",
          "x": "×",
          "X": "×",
          "/": "÷",
        };
        if (opMap[e.key]) {
          e.preventDefault();
          game.applyReduceOp(opMap[e.key]);
          return;
        }
        if (e.key === "u" || e.key === "U") {
          e.preventDefault();
          game.undoReduce();
          return;
        }
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          game.resetReduce();
          return;
        }
        return;
      }

      // Typed mode
      if (e.key === "Enter" && !isInputTarget) {
        e.preventDefault();
        game.submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
