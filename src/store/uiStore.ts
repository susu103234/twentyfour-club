import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UiState {
  collapsed: boolean;
  settingsOpen: boolean;
  achievementsOpen: boolean;
  historyOpen: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  toggleSettings: () => void;
  toggleAchievements: () => void;
  toggleHistory: () => void;
  closeAllPanels: () => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      collapsed: true,
      settingsOpen: false,
      achievementsOpen: false,
      historyOpen: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
      toggleSettings: () =>
        set((s) => ({
          settingsOpen: !s.settingsOpen,
          achievementsOpen: false,
          historyOpen: false,
        })),
      toggleAchievements: () =>
        set((s) => ({
          achievementsOpen: !s.achievementsOpen,
          settingsOpen: false,
          historyOpen: false,
        })),
      toggleHistory: () =>
        set((s) => ({
          historyOpen: !s.historyOpen,
          settingsOpen: false,
          achievementsOpen: false,
        })),
      closeAllPanels: () =>
        set({
          settingsOpen: false,
          achievementsOpen: false,
          historyOpen: false,
        }),
    }),
    {
      name: "24club/ui",
      storage: createJSONStorage(() => localStorage),
      // Intentionally don't persist `collapsed` — every launch starts
      // collapsed for a calm, low-commitment entry point.
      partialize: () => ({}),
    }
  )
);
