import { useUi } from "@/store/uiStore";

/**
 * Draggable top strip. Whole strip is a Tauri drag region; buttons opt out
 * via data-no-drag. Exposes: history, achievements, settings, collapse.
 */
export function TitleBar() {
  const toggleCollapsed = useUi((s) => s.toggleCollapsed);
  const toggleSettings = useUi((s) => s.toggleSettings);
  const toggleAchievements = useUi((s) => s.toggleAchievements);
  const toggleHistory = useUi((s) => s.toggleHistory);
  const toggleSolutions = useUi((s) => s.toggleSolutions);
  const collapsed = useUi((s) => s.collapsed);

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between px-3 py-2 select-none"
    >
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-[5px]"
          style={{
            background: "rgba(159,179,255,0.35)",
            boxShadow:
              "inset 0 0 0 1px rgba(159,179,255,0.55), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        />
        <div className="text-sm font-medium text-ink-100 tracking-tight">
          24club
        </div>
      </div>
      <div className="flex items-center gap-0.5" data-no-drag>
        <IconBtn onClick={toggleSolutions} title="All solutions" glyph="∑" />
        <IconBtn onClick={toggleHistory} title="Recent hands" glyph="⟳" />
        <IconBtn onClick={toggleAchievements} title="Achievements" glyph="◉" />
        <IconBtn onClick={toggleSettings} title="Settings" glyph="⚙" />
        <IconBtn
          onClick={toggleCollapsed}
          title={collapsed ? "Expand" : "Collapse"}
          glyph={collapsed ? "▢" : "▭"}
        />
      </div>
    </div>
  );
}

function IconBtn({
  glyph,
  onClick,
  title,
}: {
  glyph: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-6 h-6 inline-flex items-center justify-center rounded-md text-ink-300 hover:text-ink-50 hover:bg-white/6 transition-colors text-[11px]"
    >
      {glyph}
    </button>
  );
}
