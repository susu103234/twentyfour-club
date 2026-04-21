import { useEffect } from "react";

/**
 * Restores window position/size on launch and saves it as the user moves
 * the window. Uses Tauri's window API; does nothing in the browser.
 *
 * Also implements soft edge-snapping: if the user finishes a drag within
 * SNAP_PX of a screen edge, the window snaps to that edge so the app
 * actually sits flush like a floating utility.
 */
const KEY = "24club/placement";
const SNAP_PX = 24;
const SETTLE_MS = 180;

interface Placement {
  x: number;
  y: number;
}

export function useWindowPlacement() {
  useEffect(() => {
    let stopListener: (() => void) | null = null;
    let settleTimer: number | null = null;

    async function wire() {
      try {
        const winApi = await import("@tauri-apps/api/window");
        const { LogicalPosition } = winApi;
        const win = winApi.getCurrentWindow();

        // Restore saved position.
        const raw = localStorage.getItem(KEY);
        if (raw) {
          try {
            const saved = JSON.parse(raw) as Placement;
            if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
              await win.setPosition(new LogicalPosition(saved.x, saved.y));
            }
          } catch {
            // ignore corrupt placement
          }
        }

        const onMoved = async () => {
          if (settleTimer !== null) window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(async () => {
            try {
              const pos = await win.outerPosition();
              const size = await win.outerSize();
              const scale = await win.scaleFactor();
              const monitor = await winApi.currentMonitor();
              const logical = { x: pos.x / scale, y: pos.y / scale };

              let finalX = logical.x;
              let finalY = logical.y;
              if (monitor) {
                const monW = monitor.size.width / scale;
                const monH = monitor.size.height / scale;
                const monX = monitor.position.x / scale;
                const monY = monitor.position.y / scale;
                const winW = size.width / scale;
                const winH = size.height / scale;

                // Left edge
                if (Math.abs(logical.x - monX) < SNAP_PX) finalX = monX;
                // Right edge
                else if (Math.abs(monX + monW - (logical.x + winW)) < SNAP_PX) {
                  finalX = monX + monW - winW;
                }
                // Top edge
                if (Math.abs(logical.y - monY) < SNAP_PX) finalY = monY;
                // Bottom edge
                else if (Math.abs(monY + monH - (logical.y + winH)) < SNAP_PX) {
                  finalY = monY + monH - winH;
                }

                if (finalX !== logical.x || finalY !== logical.y) {
                  await win.setPosition(new LogicalPosition(finalX, finalY));
                }
              }

              localStorage.setItem(
                KEY,
                JSON.stringify({ x: finalX, y: finalY })
              );
            } catch {
              // Monitor info or window call failed — skip silently.
            }
          }, SETTLE_MS);
        };

        const unlisten = await win.onMoved(onMoved);
        stopListener = unlisten;
      } catch {
        // Not running under Tauri (e.g. vite dev in the browser).
      }
    }

    wire();
    return () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      if (stopListener) stopListener();
    };
  }, []);
}
