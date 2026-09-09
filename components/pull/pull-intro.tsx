"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyCounter } from "@/components/pull/currency-counter";
import { CapsuleGrid } from "@/components/pull/capsule-grid";
import { PullCardStage } from "@/components/pull/pull-card-stage";
import { PullBanner } from "@/components/pull/pull-banner";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { shuffle, toPullCardData, type PullCardData } from "@/lib/pull";

type Phase = "banner" | "counting" | "single" | "complete";

const SKIP_APPEAR_MS = 2000;
const CURRENCY = 1600;

export function PullIntro() {
  const router = useRouter();
  const { series, loading: seriesLoading, error } = useDashboardData();
  const [cards, setCards] = useState<PullCardData[] | null>(null);
  const [phase, setPhase] = useState<Phase>("banner");
  const [showSkip, setShowSkip] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    if (series.length > 0 && !cards) {
      setCards(shuffle(series.map(toPullCardData)));
    }
  }, [series, cards]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkip(true), SKIP_APPEAR_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase === "complete") {
      sessionStorage.setItem("pullComplete", "1");
    }
  }, [phase]);

  const pullCards = cards ?? [];
  const dataReady = pullCards.length > 0;

  function handlePull() {
    if (!dataReady || phase !== "banner") return;
    setPhase("counting");
  }

  function handleCounterDone() {
    setCurrentIndex(0);
    setPhase("single");
  }

  function handleAdvanceCard() {
    setCurrentIndex((i) => {
      const next = i + 1;
      if (next >= pullCards.length) {
        setPhase("complete");
        return i;
      }
      return next;
    });
  }

  function handleSkip() {
    setPhase("complete");
  }

  function handleViewDashboard() {
    if (navigating) return;
    setNavigating(true);
    router.push("/dashboard");
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <AnimatePresence>
        {showSkip && phase !== "banner" && phase !== "complete" && (
          <motion.button
            type="button"
            onClick={handleSkip}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute right-5 top-5 z-30 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground/70 underline-offset-4 transition-colors hover:text-muted-foreground hover:underline"
          >
            Skip <span aria-hidden="true">▶</span>
          </motion.button>
        )}
      </AnimatePresence>

      {phase === "banner" ? (
        <div className="flex w-full flex-col items-center gap-4">
          {error && (
            <div className="w-full max-w-5xl rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Failed to load games: {error}
            </div>
          )}
          <PullBanner
            cards={pullCards}
            currency={CURRENCY}
            ready={dataReady}
            loading={seriesLoading}
            onPull={handlePull}
          />
        </div>
      ) : phase === "single" ? (
        pullCards[currentIndex] && (
          <PullCardStage
            key={pullCards[currentIndex].id}
            card={pullCards[currentIndex]}
            index={currentIndex}
            total={pullCards.length}
            onAdvance={handleAdvanceCard}
          />
        )
      ) : (
        <div className="flex w-full max-w-3xl flex-col items-center gap-10 text-center">
          <div className="flex flex-col items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Gacha Pulse
            </h1>
            {phase !== "complete" && (
              <p className="text-sm text-muted-foreground">Charging your pull…</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Failed to load games: {error}
            </div>
          )}

          {phase === "counting" && (
            <div className="flex flex-col items-center gap-8">
              <CurrencyCounter onDone={handleCounterDone} />
            </div>
          )}

          {phase === "complete" && (
            <div className="flex w-full flex-col items-center gap-8">
              {pullCards.length > 0 ? (
                <CapsuleGrid games={pullCards} />
              ) : (
                <p className="text-sm text-muted-foreground">Loading roster…</p>
              )}

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Button
                  size="lg"
                  onClick={handleViewDashboard}
                  disabled={navigating}
                  className="h-12 gap-2 rounded-full px-8 text-base font-semibold"
                >
                  {navigating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {navigating ? "Loading Dashboard..." : "View Dashboard"}
                </Button>
              </motion.div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
