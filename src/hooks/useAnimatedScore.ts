"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

const DURATION = 600; // ms

export function useAnimatedScore(target: number): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const from = 0;

    let raf: number;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / DURATION, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);

  return display;
}
