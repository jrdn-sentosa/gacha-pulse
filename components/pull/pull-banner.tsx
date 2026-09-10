"use client";

import Image from "next/image";
import { Gem, Sparkles, Lock, PowerOff, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TIER_COLORS, TIER_LABELS, TIER_ICONS } from "@/lib/theme";
import { cardImage, heroObjectPosition, pickBannerSelection, type PullCardData } from "@/lib/pull";

interface PullBannerProps {
  cards: PullCardData[];
  currency: number;
  ready: boolean;
  loading: boolean;
  onPull: () => void;
}

export function PullBanner({ cards, currency, ready, loading, onPull }: PullBannerProps) {
  const { featured, supporting } = pickBannerSelection(cards);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      <div className="flex justify-end">
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 py-1.5 backdrop-blur">
          <Gem className="h-4 w-4 text-tier-gold" />
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {currency.toLocaleString()}
          </span>
        </div>
      </div>

      <div
        className="panel-cut relative overflow-hidden border border-white/10"
        style={{ background: "linear-gradient(135deg, #2a1f0f 0%, #241436 38%, #142238 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 12% 15%, rgba(242,183,5,0.28), transparent 45%), radial-gradient(circle at 55% 35%, rgba(168,85,247,0.24), transparent 50%), radial-gradient(circle at 92% 65%, rgba(56,189,248,0.24), transparent 50%)",
          }}
        />

        <div className="relative grid grid-cols-1 gap-6 p-6 sm:p-8 lg:grid-cols-[1.05fr_1.4fr] lg:gap-8 lg:p-10">
          <div className="flex flex-col justify-center gap-4">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tier-gold/15 px-3 py-1 text-xs font-semibold tracking-wide text-tier-gold">
              <Sparkles className="h-3.5 w-3.5" /> LIVE ROSTER PULL
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
              Gacha Pulse
            </h1>
            <div className="rounded-xl border border-tier-blue/30 bg-tier-blue/10 px-4 py-3 text-left text-sm leading-relaxed text-foreground/90">
              Every pull reveals one game from the tracked roster, not randomized. All 10 games
              are guaranteed to appear once, showing their current status: live and healthy, at
              risk, or already shut down.
            </div>
          </div>

          <div className="flex items-stretch gap-3">
            {featured && (
              <div
                className="card-cut relative h-72 flex-[1.6] overflow-hidden border-2 sm:h-80 lg:h-[440px]"
                style={{
                  borderColor: TIER_COLORS.gold,
                  boxShadow: `0 0 0 1px ${TIER_COLORS.gold}55, 0 20px 45px -18px ${TIER_COLORS.gold}aa`,
                }}
              >
                {cardImage(featured) ? (
                  <Image
                    src={cardImage(featured)!}
                    alt={featured.name}
                    fill
                    sizes="(min-width: 1024px) 360px, 60vw"
                    className="object-cover"
                    style={{ objectPosition: heroObjectPosition(featured) }}
                  />
                ) : (
                  <div className="h-full w-full bg-tier-gold/20" />
                )}
                <div className="absolute inset-x-0 top-0 flex justify-start p-3">
                  <span className="flex items-center gap-1 rounded-full bg-tier-gold px-2.5 py-1 text-[10px] font-bold tracking-wide text-background">
                    <Star className="h-2.5 w-2.5 fill-background" /> FEATURED
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-12">
                  <p className="truncate text-sm font-semibold text-white">{featured.name}</p>
                  <span className="text-[11px] font-medium" style={{ color: TIER_COLORS.gold }}>
                    {featured.currentSentiment !== null
                      ? `${featured.currentSentiment.toFixed(0)}% positive`
                      : TIER_LABELS.gold}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-1 flex-col gap-3">
              {supporting.map((game) => {
                const color = TIER_COLORS[game.tier];
                return (
                  <div
                    key={game.id}
                    className={cn(
                      "relative h-24 overflow-hidden rounded-xl border sm:h-28 lg:h-[136px]",
                      game.is_eos && "grayscale"
                    )}
                    style={{
                      borderColor: game.is_eos ? "rgba(148,152,200,0.4)" : color,
                      boxShadow: `0 0 0 1px ${game.is_eos ? "rgba(148,152,200,0.2)" : `${color}40`}`,
                    }}
                  >
                    {cardImage(game) ? (
                      <Image
                        src={cardImage(game)!}
                        alt={game.name}
                        fill
                        sizes="180px"
                        className="object-cover"
                        style={{ objectPosition: heroObjectPosition(game) }}
                      />
                    ) : (
                      <div className="h-full w-full" style={{ backgroundColor: `${color}22` }} />
                    )}
                    <div className="absolute inset-x-0 top-0 flex justify-start p-1.5">
                      {game.is_eos ? (
                        <span className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[9px] font-bold tracking-wide text-muted-foreground">
                          <PowerOff className="h-2.5 w-2.5" /> SERVICE ENDED
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide text-background"
                          style={{ backgroundColor: color }}
                        >
                          {(() => {
                            const TierIcon = TIER_ICONS[game.tier];
                            return <TierIcon className="h-2.5 w-2.5" />;
                          })()}
                          {TIER_LABELS[game.tier].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
                      <p className="truncate text-xs font-semibold text-white">{game.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative flex justify-end gap-3 border-t border-white/10 bg-black/20 px-6 py-4 sm:px-8">
          <Button
            disabled
            size="lg"
            variant="secondary"
            className="h-11 gap-2 rounded-full px-5 opacity-50"
          >
            <Lock className="h-4 w-4" /> Pull x1
          </Button>
          <Button
            size="lg"
            disabled={!ready}
            onClick={onPull}
            className="h-11 gap-2 rounded-full px-8 text-base font-semibold"
            style={ready ? { boxShadow: "0 0 32px -6px rgba(168,85,247,0.75)" } : undefined}
          >
            {ready && <Sparkles className="h-4 w-4" />}
            {ready ? "Pull x10" : loading ? "Loading roster…" : "Charging…"}
          </Button>
        </div>
      </div>
    </div>
  );
}
