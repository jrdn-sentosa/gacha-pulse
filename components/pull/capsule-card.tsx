"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { PowerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_COLORS, TIER_LABELS } from "@/lib/theme";
import { ShineSweep, CrackOverlay } from "@/components/pull/reveal-effects";
import { cardImage, heroObjectPosition, type PullCardData } from "@/lib/pull";

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
  const image = cardImage(game);

  return (
    <motion.div
      variants={itemVariants}
      initial={instant ? "visible" : "hidden"}
      animate={revealed || instant ? "visible" : "hidden"}
      onAnimationComplete={() => setShowEffect(true)}
      className={cn(
        "relative aspect-[3/4] overflow-hidden rounded-2xl border",
        game.is_eos && "grayscale"
      )}
      style={{
        borderColor: game.is_eos ? "rgba(148,152,200,0.25)" : color,
        boxShadow: game.is_eos
          ? "inset 0 0 24px rgba(0,0,0,0.35)"
          : `0 0 0 1px ${color}55, 0 10px 30px -10px ${color}99`,
      }}
    >
      {image ? (
        <Image
          src={image}
          alt={game.name}
          fill
          sizes="(min-width: 640px) 20vw, 45vw"
          className="object-cover"
          style={{ objectPosition: heroObjectPosition(game) }}
        />
      ) : (
        <div className="h-full w-full" style={{ backgroundColor: `${color}22` }} />
      )}

      {!game.is_eos && showEffect && <ShineSweep color={color} />}
      {game.is_eos && showEffect && <CrackOverlay />}

      <div className="absolute inset-x-0 top-0 flex justify-start p-2">
        {game.is_eos ? (
          <span className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[9px] font-bold tracking-wide text-muted-foreground">
            <PowerOff className="h-2.5 w-2.5" /> SERVICE ENDED
          </span>
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide text-background"
            style={{ backgroundColor: color }}
          >
            {TIER_LABELS[game.tier].toUpperCase()}
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-8">
        <p className="truncate text-xs font-semibold text-white sm:text-sm">{game.name}</p>
      </div>
    </motion.div>
  );
});
