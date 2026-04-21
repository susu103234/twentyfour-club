import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useUi } from "@/store/uiStore";

/**
 * One-shot hint on first launch explaining the two things a new user can't
 * easily discover on their own:
 *   1. ⌥+2 toggles the window — the app is designed to live hidden
 *   2. closing the window does NOT quit (it hides to the tray)
 *
 * Dismiss is persisted via `hasSeenOnboarding` so this only ever fires once
 * per install. We also auto-dismiss after 12s so a forgotten bubble doesn't
 * block the UI forever.
 */
export function OnboardingBubble() {
  const seen = useUi((s) => s.hasSeenOnboarding);
  const dismiss = useUi((s) => s.dismissOnboarding);
  const collapsed = useUi((s) => s.collapsed);

  useEffect(() => {
    if (seen) return;
    const t = window.setTimeout(dismiss, 12_000);
    return () => window.clearTimeout(t);
  }, [seen, dismiss]);

  // Only show on the compact entry view — once the user expands the app
  // they're already past the discovery phase.
  const visible = !seen && collapsed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={dismiss}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, delay: 0.3 }}
          data-no-drag
          className="absolute inset-x-1.5 top-1.5 bottom-1.5 rounded-[9px] px-3 flex items-center justify-center text-center text-[11px] font-mono backdrop-blur-md cursor-pointer"
          style={{
            background: "rgba(20,22,32,0.92)",
            border: "1px solid rgba(232,217,160,0.45)",
            color: "rgb(240,231,200)",
            lineHeight: 1.35,
            wordBreak: "break-word",
            zIndex: 30,
          }}
        >
          <span>
            <span style={{ color: "rgb(232,217,160)" }}>⌥+2</span>
            {" 随时呼出 · 关闭会收进托盘不退出 "}
            <span style={{ opacity: 0.6 }}>(点击关闭)</span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
