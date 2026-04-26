"use client";
import { useMemo } from "react";
import { StocksTable, type Holding, type SymbolSignals, type PeriodChanges } from "@/components/StocksTable";
import { useRealtimeTicks } from "@/hooks/useRealtimeTicks";
import type { PriceTick } from "@/lib/types";
import type { HistoricalChanges } from "@/lib/alpaca";

interface RealtimeWatchlistProps {
  holdings: Holding[];
  initialLatestPrices: Record<string, number>;
  initialTicksBySymbol: Record<string, PriceTick[]>;
  historicalChanges: Record<string, HistoricalChanges>;
  colors: string[];
  signals?: Record<string, SymbolSignals>;
}

export function RealtimeWatchlist({
  holdings,
  initialTicksBySymbol,
  historicalChanges,
  colors,
  signals,
}: RealtimeWatchlistProps) {
  const symbols = holdings.map((h) => h.symbol);
  const { ticks, latestPrices } = useRealtimeTicks(symbols, initialTicksBySymbol);

  const periodChanges = useMemo(() => {
    const out: Record<string, PeriodChanges> = {};
    for (const sym of symbols) {
      const hist = historicalChanges[sym];
      const livePrice = latestPrices[sym];
      out[sym] = {
        day: hist?.prevClose && livePrice ? ((livePrice - hist.prevClose) / hist.prevClose) * 100 : null,
        week: hist?.weekChange ?? null,
        month: hist?.monthChange ?? null,
        ytd: hist?.ytdChange ?? null,
      };
    }
    return out;
  }, [latestPrices, historicalChanges, symbols]);

  return (
    <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
      <StocksTable
        holdings={holdings}
        latestPrices={latestPrices}
        periodChanges={periodChanges}
        colors={colors}
        ticksBySymbol={ticks}
        signals={signals}
      />
    </div>
  );
}
