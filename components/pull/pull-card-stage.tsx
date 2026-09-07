"use client";

import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TIER_COLORS, TIER_LABELS } from "@/lib/theme";
import { ShineSweep, CrackOverlay } from "@/components/pull/reveal-effects";
import type { PullCardData } from "@/lib/pull";

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0, rotateY: 90 },
  visible: {
    opacity: 1,
    scale: 1,
    rotateY: 0,
    transition: { type: "spring", stiffness: 220, damping: 22 },
  },
};

const EFFECT_DURATION_MS = 650;

interface PullCardStageProps {
  card: PullCardData;
  index: number;
  total: number;
  onAdvance: () => void;
}

export function PullCardStage({ card, index, total, onAdvance }: PullCardStageProps) {
  const [showEffect, setShowEffect] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);
  const [imgError, setImgError] = useState(false);
  const color = TIER_COLORS[card.tier];
  const isLast = index === total - 1;

  useEffect(() => {
    if (!showEffect) return;
    const timer = setTimeout(() => setCanAdvance(true), EFFECT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showEffect]);

  function handleAdvance() {
    if (!canAdvance) return;
    onAdvance();
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        role="button"
        tabIndex={0}
        onClick={handleAdvance}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleAdvance()}
        className={cn("outline-none", canAdvance && "cursor-pointer")}
      >
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          onAnimationComplete={() => setShowEffect(true)}
          className={cn(
            "relative flex w-72 flex-col overflow-hidden rounded-3xl border bg-card sm:w-80",
            card.is_eos && "grayscale"
          )}
          style={{
            borderColor: card.is_eos ? "rgba(148,152,200,0.25)" : color,
            boxShadow: card.is_eos
              ? "inset 0 0 32px rgba(0,0,0,0.4)"
              : `0 0 0 1px ${color}55, 0 20px 50px -18px ${color}aa`,
          }}
        >
          {!card.is_eos && showEffect && <ShineSweep color={color} />}
          {card.is_eos && showEffect && <CrackOverlay />}

          <div className="relative h-36 w-full shrink-0 bg-muted sm:h-40">
            {card.headerImage && !imgError ? (
              <Image
                src={card.headerImage}
                alt={card.name}
                fill
                sizes="320px"
                className="object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="h-full w-full" style={{ backgroundColor: `${color}33` }} />
            )}
          </div>

          <div className="flex flex-col items-center gap-3 px-5 py-5 text-center">
            <span className="line-clamp-2 text-base font-semibold text-foreground">{card.name}</span>

            <span
              className="rounded-full px-3 py-1 text-xs font-semibold tracking-wide"
              style={{
                backgroundColor: card.is_eos ? "rgba(107,114,128,0.2)" : `${color}26`,
                color: card.is_eos ? "#9CA3AF" : color,
              }}
            >
              {card.is_eos ? "SERVICE ENDED" : TIER_LABELS[card.tier].toUpperCase()}
            </span>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {card.is_eos ? (
                <span>
                  Shutdown{" "}
                  {card.eosShutdownDate ? format(parseISO(card.eosShutdownDate), "MMM d, yyyy") : "unknown"}
                </span>
              ) : (
                <span className="font-mono tabular-nums">
                  {card.currentSentiment !== null ? `${card.currentSentiment.toFixed(0)}% positive` : "No data"}
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{card.reviewCount.toLocaleString()} reviews</span>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.button
        type="button"
        onClick={handleAdvance}
        initial={{ opacity: 0 }}
        animate={{ opacity: canAdvance ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        disabled={!canAdvance}
        className="rounded-full bg-secondary px-5 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:pointer-events-none"
      >
        {isLast ? "See Full Roster" : "Next"}
      </motion.button>

      <span className="text-xs text-muted-foreground/60">
        {index + 1} / {total}
      </span>
    </div>
  );
}
