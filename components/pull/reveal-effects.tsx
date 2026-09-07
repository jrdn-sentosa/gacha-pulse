"use client";

import { motion } from "framer-motion";

export function ShineSweep({ color }: { color: string }) {
  return (
    <motion.div
      initial={{ x: "-120%" }}
      animate={{ x: "220%" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="pointer-events-none absolute inset-y-0 w-1/3 skew-x-[-20deg]"
      style={{
        background: `linear-gradient(90deg, transparent, ${color}66, transparent)`,
      }}
    />
  );
}

export function CrackOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      viewBox="0 0 100 130"
      fill="none"
      preserveAspectRatio="none"
    >
      <motion.path
        d="M50 0 L45 30 L60 45 L40 65 L55 90 L48 130"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
      <motion.path
        d="M20 40 L35 55 L15 75"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15, ease: "easeInOut" }}
      />
    </svg>
  );
}
