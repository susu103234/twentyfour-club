import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { ExpandedView } from "./components/ExpandedView";
import { CollapsedView } from "./components/CollapsedView";
import { SettingsPanel } from "./components/SettingsPanel";
import { AchievementsPanel } from "./components/AchievementsPanel";
import { AchievementToast } from "./components/AchievementToast";
import { HistoryPanel } from "./components/HistoryPanel";
import { SolutionsPanel } from "./components/SolutionsPanel";
import { FeedbackToast } from "./components/FeedbackToast";
import { useUi } from "./store/uiStore";
import { useGame } from "./store/gameStore";
import { useRushTimer } from "./hooks/useRushTimer";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWindowPlacement } from "./hooks/useWindowPlacement";
import { useTrayBridge } from "./hooks/useTrayBridge";

export default function App() {
  const collapsed = useUi((s) => s.collapsed);
  const hand = useGame((s) => s.hand);
  const startNewHand = useGame((s) => s.startNewHand);

  useRushTimer();
  useKeyboardShortcuts();
  useWindowPlacement();
  useTrayBridge();

  useEffect(() => {
    if (!hand) startNewHand();
  }, [hand, startNewHand]);

  useEffect(() => {
    resizeWindow(collapsed).catch(() => void 0);
  }, [collapsed]);

  // Apply the persisted always-on-top preference once on launch so the
  // Tauri window actually sits above other apps when the user expects it.
  useEffect(() => {
    applyAlwaysOnTopOnMount().catch(() => void 0);
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* SVG filter for card-to-card water fusion. Softer than a standard
          "goo" filter (stdDeviation 8, gentler alpha threshold) so the
          merger reads as droplets coalescing rather than molten metal.
          Only applied when a drag is actively hovering a target. */}
      <svg
        aria-hidden
        width="0"
        height="0"
        style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter id="card-fusion">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="8"
              result="blur"
            />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -7"
            />
          </filter>
        </defs>
      </svg>
      <div className="relative flex flex-col glass rounded-[14px] overflow-hidden h-full">
        {!collapsed && <TitleBar />}
        {!collapsed && <div className="divider" />}
        <div className="relative flex-1 flex flex-col min-h-0">
          {collapsed ? (
            <div className="flex flex-1" data-tauri-drag-region>
              <CollapsedView />
            </div>
          ) : (
            <div className="flex flex-1 flex-col min-h-0">
              <ExpandedView />
            </div>
          )}
          <SettingsPanel />
          <AchievementsPanel />
          <HistoryPanel />
          <SolutionsPanel />
          <FeedbackToast />
        </div>
      </div>
      <AchievementToast />
    </div>
  );
}

async function resizeWindow(collapsed: boolean) {
  try {
    const { getCurrentWindow, LogicalSize } = await import(
      "@tauri-apps/api/window"
    );
    const win = getCurrentWindow();
    const size = collapsed
      ? new LogicalSize(280, 68)
      : new LogicalSize(360, 500);
    await win.setSize(size);
  } catch {
    // Browser preview — no Tauri runtime.
  }
}

async function applyAlwaysOnTopOnMount() {
  // Pull the current preference from the store rather than a prop so this
  // runs after persist has rehydrated.
  const { preferences } = (await import("./store/gameStore")).useGame.getState();
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setAlwaysOnTop(preferences.alwaysOnTop);
}
