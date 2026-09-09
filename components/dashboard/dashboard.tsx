"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameCardRow } from "@/components/dashboard/game-card-row";
import { SentimentChart } from "@/components/dashboard/sentiment-chart";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import { HealthyVsEosChart } from "@/components/dashboard/healthy-vs-eos-chart";
import { GameDetail } from "@/components/dashboard/game-detail";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function Dashboard() {
  const { loading, error, series, referenceDate } = useDashboardData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedSeries = series.find((s) => s.game.id === selectedId) ?? null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
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
          <GameCardRow series={series} selectedId={selectedId} onSelect={setSelectedId} />

          <Tabs defaultValue="sentiment">
            <TabsList>
              <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
              <TabsTrigger value="volume">Volume</TabsTrigger>
              <TabsTrigger value="comparison">Healthy vs. EoS</TabsTrigger>
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
        </>
      )}
    </main>
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
