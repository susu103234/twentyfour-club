import { useEffect } from "react";
import { useGame } from "@/store/gameStore";

/**
 * Receives tray-menu action events from the Rust side and dispatches them
 * to the game store. No-op outside Tauri.
 */
export function useTrayBridge() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<string>("tray-action", (e) => {
          const action = e.payload;
          const game = useGame.getState();
          if (action === "new_hand") game.nextHand();
          else if (action === "rush") game.setMode("rush");
          else if (action === "daily") game.setMode("daily");
        });
      } catch {
        // Not running under Tauri.
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);
}
