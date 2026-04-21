import { useEffect, useRef } from "react";
import { useGame } from "@/store/gameStore";

/**
 * Advances the rush timer with requestAnimationFrame. Stops cleanly when
 * the rush session ends or the component unmounts.
 */
export function useRushTimer() {
  const tick = useGame((s) => s.tickRush);
  const rushActive = useGame((s) => s.rushActive);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (!rushActive) {
      lastRef.current = null;
      return;
    }
    let raf = 0;
    const step = (now: number) => {
      if (lastRef.current == null) lastRef.current = now;
      const dt = now - lastRef.current;
      lastRef.current = now;
      tick(dt);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rushActive, tick]);
}
