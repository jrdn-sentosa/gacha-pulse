"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Gem } from "lucide-react";

interface CurrencyCounterProps {
  target?: number;
  steps?: number;
  durationMs?: number;
  onDone?: () => void;
}

/**
 * Isolated so its per-tick re-renders never touch the capsule grid — it's only
 * ever mounted during the counting phase, before any capsules exist.
 */
export function CurrencyCounter({
  target = 1600,
  steps = 16,
  durationMs = 1600,
  onDone,
}: CurrencyCounterProps) {
  const [value, setValue] = useState(0);
  const [tick, setTick] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let i = 0;
    const stepValue = target / steps;
    const interval = setInterval(() => {
      i++;
      setValue(Math.min(target, Math.round(stepValue * i)));
      setTick((t) => t + 1);
      if (i >= steps) {
        clearInterval(interval);
        onDoneRef.current?.();
      }
    }, durationMs / steps);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, steps, durationMs]);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-tier-gold/25 bg-card/60 px-6 py-4 backdrop-blur">
      <motion.div
        key={tick}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.28, 1] }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-tier-gold/15"
        style={{ boxShadow: "0 0 24px -4px rgba(242,183,5,0.6)" }}
      >
        <Gem className="h-6 w-6 text-tier-gold" />
      </motion.div>
      <span className="font-mono text-4xl font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
    </div>
  );
}
