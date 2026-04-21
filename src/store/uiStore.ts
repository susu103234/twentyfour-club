import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UiState {
  collapsed: boolean;
  settingsOpen: boolean;
  achievementsOpen: boolean;
  historyOpen: boolean;
  solutionsOpen: boolean;
  hasSeenOnboarding: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  toggleSettings: () => void;
  toggleAchievements: () => void;
  toggleHistory: () => void;
  toggleSolutions: () => void;
  closeAllPanels: () => void;
  dismissOnboarding: () => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      collapsed: true,
      settingsOpen: false,
      achievementsOpen: false,
      historyOpen: false,
      solutionsOpen: false,
      hasSeenOnboarding: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
      toggleSettings: () =>
        set((s) => ({
          settingsOpen: !s.settingsOpen,
          achievementsOpen: false,
          historyOpen: false,
          solutionsOpen: false,
        })),
      toggleAchievements: () =>
        set((s) => ({
          achievementsOpen: !s.achievementsOpen,
          settingsOpen: false,
          historyOpen: false,
          solutionsOpen: false,
        })),
      toggleHistory: () =>
        set((s) => ({
          historyOpen: !s.historyOpen,
          settingsOpen: false,
          achievementsOpen: false,
          solutionsOpen: false,
        })),
      toggleSolutions: () =>
        set((s) => ({
          solutionsOpen: !s.solutionsOpen,
          settingsOpen: false,
          achievementsOpen: false,
          historyOpen: false,
        })),
      closeAllPanels: () =>
        set({
          settingsOpen: false,
          achievementsOpen: false,
          historyOpen: false,
          solutionsOpen: false,
        }),
      dismissOnboarding: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: "24club/ui",
      storage: createJSONStorage(() => localStorage),
      // Persist only the one-shot onboarding flag — `collapsed` and panel
      // toggles always start fresh for a calm, low-commitment entry point.
      partialize: (s) => ({ hasSeenOnboarding: s.hasSeenOnboarding }),
    }
  )
);
