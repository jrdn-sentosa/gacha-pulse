"use client";

import { useState } from "react";
import { Info, TrendingUp, BarChart3, ArrowLeftRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Starfield } from "@/components/ui/starfield";
import { OrnamentalDivider } from "@/components/ui/ornamental-divider";
import { GameCardRow } from "@/components/dashboard/game-card-row";
import { SentimentChart } from "@/components/dashboard/sentiment-chart";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import { HealthyVsEosChart } from "@/components/dashboard/healthy-vs-eos-chart";
import { WhyEosSection } from "@/components/dashboard/why-eos-section";
import { GameDetail } from "@/components/dashboard/game-detail";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { TIER_COLORS } from "@/lib/theme";

export function Dashboard() {
  const { loading, error, series, referenceDate } = useDashboardData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedSeries = series.find((s) => s.game.id === selectedId) ?? null;

  return (
    <div className="relative isolate min-h-svh overflow-hidden bg-background">
      <Starfield density="sparse" className="-z-10" />
      <main className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
            Gacha Pulse
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Gacha Pulse checks the &ldquo;pulse&rdquo; of gacha games: free-to-play, live-service
            video games where you spend in-game currency (and sometimes real money) to make
            randomized &ldquo;pulls&rdquo; for characters. These games have a limited lifespan;
            without enough players or financial support, they inevitably reach End of Service (EoS)
            and shut down.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Trend arrows compare each game&rsquo;s trailing 4-week sentiment against the 4 weeks before that.
          </p>
          <p className="text-xs text-muted-foreground/70">Review data refreshes automatically once daily.</p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground/70">
            <span>Status bands:</span>
            <TierDot color={TIER_COLORS.gold} />
            <span>Healthy &ge;85% positive</span>
            <span aria-hidden="true">&middot;</span>
            <TierDot color={TIER_COLORS.purple} />
            <span>Stable 70&ndash;84%</span>
            <span aria-hidden="true">&middot;</span>
            <TierDot color={TIER_COLORS.blue} />
            <span>At Risk &lt;70% (live games only)</span>
            <span aria-hidden="true">&middot;</span>
            <TierDot color={TIER_COLORS.gray} />
            <span>Service Ended for EoS titles, regardless of past sentiment.</span>
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load data: {error}
          </div>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : selectedSeries ? (
          <GameDetail series={selectedSeries} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            <OrnamentalDivider />

            <GameCardRow series={series} selectedId={selectedId} onSelect={setSelectedId} />

            <OrnamentalDivider />

            <WhyEosSection />

            <OrnamentalDivider />

            <Tabs defaultValue="sentiment">
              <TabsList>
                <TabsTrigger value="sentiment" className="gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Sentiment
                </TabsTrigger>
                <TabsTrigger value="volume" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" /> Volume
                </TabsTrigger>
                <TabsTrigger value="comparison" className="gap-1.5">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Healthy vs. EoS
                </TabsTrigger>
              </TabsList>
              <TabsContent value="sentiment" className="mt-4">
                <SentimentChart series={series} />
              </TabsContent>
              <TabsContent value="volume" className="mt-4">
                <VolumeChart series={series} />
              </TabsContent>
              <TabsContent value="comparison" className="mt-4">
                <HealthyVsEosChart series={series} referenceDate={referenceDate} />
              </TabsContent>
            </Tabs>

            <OrnamentalDivider />

            <LimitationsSection />
          </>
        )}
      </main>
    </div>
  );
}

const LIMITATIONS = [
  "All review data comes from Steam. Most of these games are primarily mobile titles, and Steam represents a smaller, PC-specific slice of the actual player base. The sentiment data here may not reflect the broader (often much larger) mobile audience.",
  "This project uses Steam review data specifically because Steam offers a clean, official public API (appreviews) with deep historical data, and no comparable option exists for mobile platforms. Google Play has no official reviews API (only unofficial scrapers of uncertain reliability), and Apple's App Store feed, while official, only exposes a shallow recent window (~500 reviews) rather than full history. Incorporating mobile review data would be a natural next step for a more complete picture, but was out of scope here given the reliability and depth tradeoffs involved.",
  "Most gacha end-of-service cases happen on mobile-only titles that never had a Steam release. The 5 EoS games tracked here are the subset that happened to have Steam presence and not necessarily a representative sample of gacha shutdowns overall.",
  "Steam reviewers are self-selected, not a random sample of players. Reviews left tend to reveal opinions of more engaged or more vocal segments of the player base.",
  "Smaller titles (Battle Star & Gran Saga) have far fewer reviews than the larger games, so their trend lines should be read with more caution.",
  "A ‘Healthy’ status here reflects review sentiment only; it is not a financial health indicator. A game can have strongly positive reviews and still reach End of Service if player spending, revenue, or operating costs don't support it. Sentiment is a possible leading indicator, not a guarantee of continued operation.",
];

function TierDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />;
}

function LimitationsSection() {
  return (
    <section>
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Info className="h-4 w-4" /> Limitations
      </h2>
      <ul className="mt-2 flex max-w-3xl list-disc flex-col gap-2 pl-4 marker:text-muted-foreground/40">
        {LIMITATIONS.map((point, i) => (
          <li key={i} className="text-xs leading-relaxed text-muted-foreground/70">
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-2.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-11 w-40 animate-pulse rounded-full bg-card" />
        ))}
      </div>
      <div className="h-[400px] w-full animate-pulse rounded-xl bg-card" />
    </div>
  );
}
