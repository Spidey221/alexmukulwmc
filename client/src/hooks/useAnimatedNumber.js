import { useEffect, useRef, useState } from 'react';
import usePrefersReducedMotion from './usePrefersReducedMotion.js';

const DURATION_MS = 250;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Animates a number toward `target` over ~250ms ease-out. Jumps instantly
// when the viewer prefers reduced motion, or on the first render (nothing
// to animate from yet).
export default function useAnimatedNumber(target) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    if (target === fromRef.current) return;

    if (prefersReducedMotion || typeof target !== 'number' || Number.isNaN(target)) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    function tick(now) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = easeOutCubic(t);
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, prefersReducedMotion]);

  return display;
}
