"use client";
import { useEffect, useState } from "react";
import { StocksTable, type Holding } from "@/components/StocksTable";
import { useRealtimeTicks } from "@/hooks/useRealtimeTicks";
import type { PriceTick } from "@/lib/types";

interface RealtimeWatchlistProps {
  holdings: Holding[];
  initialLatestPrices: Record<string, number>;
  initialChanges: Record<string, number | null>;
  initialTicksBySymbol: Record<string, PriceTick[]>;
  colors: string[];
}

export function RealtimeWatchlist({
  holdings,
  initialChanges,
  initialTicksBySymbol,
  colors,
}: RealtimeWatchlistProps) {
  const symbols = holdings.map((h) => h.symbol);
  const { ticks, latestPrices } = useRealtimeTicks(symbols, initialTicksBySymbol);

  const [changes, setChanges] = useState<Record<string, number | null>>(initialChanges);

  useEffect(() => {
    const newChanges: Record<string, number | null> = {};
    for (const h of holdings) {
      const symTicks = ticks[h.symbol];
      if (!symTicks?.length) {
        newChanges[h.symbol] = null;
        continue;
      }
      const first = symTicks[0].price;
      const last = symTicks[symTicks.length - 1].price;
      newChanges[h.symbol] = ((last - first) / first) * 100;
    }
    setChanges(newChanges);
  }, [ticks, holdings]);

  return (
    <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
      <StocksTable
        holdings={holdings}
        latestPrices={latestPrices}
        changes={changes}
        colors={colors}
        ticksBySymbol={ticks}
      />
    </div>
  );
}
