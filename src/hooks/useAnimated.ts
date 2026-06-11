import { useEffect, useRef, useState } from "react";

/** Spring-ish lerp toward a target value; drives count-ups and chart motion. */
export function useAnimatedNumber(target: number | null, durationMs = 600): number | null {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const raf = useRef(0);

  useEffect(() => {
    if (target == null) {
      setValue(null);
      fromRef.current = null;
      return;
    }
    const from = fromRef.current ?? target;
    const start = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * eased;
      setValue(v);
      fromRef.current = v;
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs]);

  return value;
}

export function useAnimatedArray(target: number[], durationMs = 450): number[] {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const raf = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target.map((x, i) => {
        const f = from[i] ?? x;
        return f + (x - f) * eased;
      });
      setValue(v);
      fromRef.current = v;
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(target), durationMs]);

  return value;
}
