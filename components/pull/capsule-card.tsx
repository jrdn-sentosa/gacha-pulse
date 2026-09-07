"use client";

import { memo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { PowerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_COLORS, TIER_LABELS } from "@/lib/theme";
import { ShineSweep, CrackOverlay } from "@/components/pull/reveal-effects";
import type { PullCardData } from "@/lib/pull";

const itemVariants: Variants = {
  hidden: { opacity: 0, scale: 0, rotateY: 90 },
  visible: {
    opacity: 1,
    scale: 1,
    rotateY: 0,
    transition: { type: "spring", stiffness: 240, damping: 20 },
  },
};

interface CapsuleCardProps {
  game: PullCardData;
  /** Whether this capsule has been reached in the reveal sequence. */
  revealed: boolean;
  /** Skip entrance animation and land straight on the revealed state (used by Skip). */
  instant?: boolean;
}

export const CapsuleCard = memo(function CapsuleCard({ game, revealed, instant }: CapsuleCardProps) {
  const [showEffect, setShowEffect] = useState(!!instant);
  const color = TIER_COLORS[game.tier];

  return (
    <motion.div
      variants={itemVariants}
      initial={instant ? "visible" : "hidden"}
      animate={revealed || instant ? "visible" : "hidden"}
      onAnimationComplete={() => setShowEffect(true)}
      className={cn(
        "relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-2xl border bg-card px-3 py-4 text-center",
        game.is_eos && "grayscale"
      )}
      style={{
        borderColor: game.is_eos ? "rgba(148,152,200,0.25)" : color,
        boxShadow: game.is_eos
          ? "inset 0 0 24px rgba(0,0,0,0.35)"
          : `0 0 0 1px ${color}55, 0 10px 30px -10px ${color}99`,
      }}
    >
      {!game.is_eos && showEffect && <ShineSweep color={color} />}
      {game.is_eos && showEffect && <CrackOverlay />}

      {game.is_eos ? (
        <div className="flex flex-col items-center gap-2 opacity-70">
          <PowerOff className="h-6 w-6 text-muted-foreground" />
          <span className="max-w-[7rem] truncate text-sm font-medium text-foreground">
            {game.name}
          </span>
          <span className="rounded-full bg-tier-gray/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
            SERVICE ENDED
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 14px ${color}` }}
          />
          <span className="max-w-[7rem] truncate text-sm font-medium text-foreground">
            {game.name}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
            style={{ backgroundColor: `${color}26`, color }}
          >
            {TIER_LABELS[game.tier].toUpperCase()}
          </span>
        </div>
      )}
    </motion.div>
  );
});
