"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGameSeries } from "@/lib/aggregate";
import { supabase } from "@/lib/supabase";
import type { Game, GameSeries, RawReview } from "@/lib/types";

const PAGE_SIZE = 1000;
const CONCURRENCY = 10;

async function fetchAllReviews(): Promise<RawReview[]> {
  const { count, error: countError } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const rows: RawReview[] = [];

  // .order() below is required, not cosmetic: without an explicit sort, Postgres/PostgREST
  // don't guarantee a stable row order between separate queries on the same table, so two
  // concurrent .range() slices (or the same query run twice, e.g. once on /pull and once on
  // /dashboard) can silently return overlapping and/or missing rows — corrupting every
  // downstream aggregate (sentiment %, review counts) differently on each page load.
  for (let pageStart = 0; pageStart < totalPages; pageStart += CONCURRENCY) {
    const pageIndexes = Array.from(
      { length: Math.min(CONCURRENCY, totalPages - pageStart) },
      (_, i) => pageStart + i
    );
    const results = await Promise.all(
      pageIndexes.map((page) => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        return supabase
          .from("reviews")
          .select("game_id,voted_up,created_at,playtime_forever")
          .order("id", { ascending: true })
          .range(from, to);
      })
    );
    for (const r of results) {
      if (r.error) throw r.error;
      if (r.data) rows.push(...(r.data as RawReview[]));
    }
  }

  return rows;
}

interface DashboardData {
  loading: boolean;
  error: string | null;
  series: GameSeries[];
  referenceDate: Date;
}

export function useDashboardData(): DashboardData {
  const [games, setGames] = useState<Game[] | null>(null);
  const [reviews, setReviews] = useState<RawReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referenceDate] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [{ data: gamesData, error: gamesError }, reviewRows] = await Promise.all([
          supabase.from("games").select("*").order("name"),
          fetchAllReviews(),
        ]);
        if (gamesError) throw gamesError;
        if (cancelled) return;
        setGames((gamesData as Game[]) ?? []);
        setReviews(reviewRows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load data");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const series = useMemo(() => {
    if (!games || !reviews) return [];
    return buildGameSeries(games, reviews);
  }, [games, reviews]);

  return {
    loading: !error && (games === null || reviews === null),
    error,
    series,
    referenceDate,
  };
}
