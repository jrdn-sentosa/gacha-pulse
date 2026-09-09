"use client";

import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TIER_COLORS, TIER_LABELS } from "@/lib/theme";
import { ShineSweep, CrackOverlay } from "@/components/pull/reveal-effects";
import { cardImage, heroObjectPosition, type PullCardData } from "@/lib/pull";

const artVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6, rotateY: 90 },
  visible: {
    opacity: 1,
    scale: 1,
    rotateY: 0,
    transition: { type: "spring", stiffness: 200, damping: 22 },
  },
};

const textVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, delay: 0.15 } },
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
  const primaryImage = cardImage(card);
  const fallbackImage = card.heroImage ? card.headerImage : null;
  const [imgSrc, setImgSrc] = useState(primaryImage);
  const color = TIER_COLORS[card.tier];
  const isLast = index === total - 1;
  const statusLabel = card.is_eos ? "SERVICE ENDED" : TIER_LABELS[card.tier].toUpperCase();

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
    <div
      role="button"
      tabIndex={0}
      onClick={handleAdvance}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleAdvance()}
      className={cn("absolute inset-0 flex flex-col overflow-hidden outline-none", canAdvance && "cursor-pointer")}
    >
      <div className="absolute inset-0 bg-background" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 75% 45%, ${color}45, transparent 55%), radial-gradient(circle at 20% 65%, ${color}20, transparent 60%)`,
        }}
      />

      <div className="relative flex flex-1 flex-col-reverse lg:flex-row lg:items-center">
        <motion.div
          variants={textVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-1 flex-col justify-center gap-3 px-8 pb-8 pt-4 sm:px-12 lg:justify-end lg:gap-4 lg:px-16 lg:pb-28 lg:pt-0"
        >
          <h1 className="font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
            {card.name}
          </h1>

          <span
            className="w-fit rounded-lg px-3 py-1.5 text-lg font-extrabold tracking-wide sm:text-2xl"
            style={{
              backgroundColor: card.is_eos ? "rgba(107,114,128,0.18)" : `${color}22`,
              color: card.is_eos ? "#9CA3AF" : color,
            }}
          >
            {statusLabel}
          </span>

          <div className="flex items-center gap-3 text-sm text-muted-foreground sm:text-base">
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
        </motion.div>

        <div className="relative flex flex-1 items-center justify-center px-8 pt-10 sm:pt-14 lg:justify-end lg:px-14 lg:pt-0">
          <div
            className={cn(
              "relative aspect-[3/4] w-[68vw] max-w-xs overflow-hidden rounded-[1.75rem] sm:max-w-sm lg:w-[34vw] lg:max-w-xl",
            )}
            style={{
              transform: "rotate(-4deg)",
              boxShadow: card.is_eos
                ? "0 30px 80px -20px rgba(0,0,0,0.7)"
                : `0 0 0 2px ${color}66, 0 30px 90px -20px ${color}99, 0 0 70px -12px ${color}88`,
            }}
          >
            <motion.div
              variants={artVariants}
              initial="hidden"
              animate="visible"
              onAnimationComplete={() => setShowEffect(true)}
              className={cn("relative h-full w-full bg-muted", card.is_eos && "grayscale")}
            >
              {imgSrc ? (
                <Image
                  src={imgSrc}
                  alt={card.name}
                  fill
                  sizes="(min-width: 1024px) 34vw, 68vw"
                  className="object-cover"
                  style={{ objectPosition: imgSrc === primaryImage ? heroObjectPosition(card) : "center" }}
                  onError={() => setImgSrc(imgSrc === primaryImage ? fallbackImage : null)}
                />
              ) : (
                <div className="h-full w-full" style={{ backgroundColor: `${color}33` }} />
              )}

              {!card.is_eos && showEffect && <ShineSweep color={color} />}
              {card.is_eos && showEffect && <CrackOverlay />}
            </motion.div>
          </div>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleAdvance();
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: canAdvance ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        disabled={!canAdvance}
        className="absolute bottom-6 right-6 z-10 flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:pointer-events-none sm:bottom-8 sm:right-8"
      >
        {isLast ? "See Full Roster" : "Continue"}
        <ArrowRight className="h-4 w-4" />
      </motion.button>

      <span className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-xs text-muted-foreground/60 sm:bottom-9">
        {index + 1} / {total}
      </span>
    </div>
  );
}
