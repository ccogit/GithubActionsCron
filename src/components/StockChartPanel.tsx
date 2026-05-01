"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { PriceChart } from "@/components/PriceChart";
import { createClient } from "@supabase/supabase-js";
import type { PriceTick } from "@/lib/types";

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PERIODS = ["1D", "1W", "1M", "3M"] as const;
type Period = (typeof PERIODS)[number];

type Bar = { time: string; price: number };

function barsToTicks(bars: Bar[]): PriceTick[] {
  return bars.map((b, i) => ({
    id: i,
    symbol: "",
    price: b.price,
    fetched_at: b.time,
  }));
}

type Props = {
  symbol: string;
  color: string;
  currentPrice?: number;
  minPrice?: number;
};

export function StockChartPanel({
  symbol,
  color,
  currentPrice,
  minPrice = 0,
}: Props) {
  const [period, setPeriod] = useState<Period>("1D");
  const [ticks, setTicks] = useState<PriceTick[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBars = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true);
    fetch(`/api/stock-bars?symbol=${symbol}&period=${period}`)
      .then((r) => r.json())
      .then((data) => setTicks(barsToTicks(data.bars ?? [])))
      .catch(() => { if (showLoading) setTicks([]); })
      .finally(() => { if (showLoading) setLoading(false); });
  }, [symbol, period]);

  // Load on period / symbol change
  useEffect(() => { fetchBars(true); }, [fetchBars]);

  // Subscribe to price_ticks for this symbol — silently refresh bars when Alpaca data is pushed.
  // Only active on 1D (5-min bars); coarser periods don't need sub-minute updates.
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || period !== "1D") return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = supabase
      .channel(`stock_bars_rt_${symbol}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "price_ticks",
        filter: `symbol=eq.${symbol}`,
      }, () => fetchBars())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [symbol, period, fetchBars]);

  const prices = ticks.map((t) => t.price);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = first && last ? ((last - first) / first) * 100 : null;

  return (
    <div
      className="rounded-lg border border-white/8 bg-card p-5 overflow-hidden"
      style={{ borderTopColor: color, borderTopWidth: "2px" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-mono font-bold text-sm tracking-widest" style={{ color }}>
            {symbol}
          </div>
          <div className="font-mono font-semibold text-2xl text-foreground mt-0.5 tabular-nums">
            {currentPrice !== undefined ? `$${currentPrice.toFixed(2)}` : "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {change !== null ? (
            <div className={`flex items-center gap-1 font-mono text-sm font-semibold tabular-nums ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </div>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">No data</span>
          )}
          <div className="flex items-center gap-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  period === p
                    ? "text-foreground bg-white/12"
                    : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/6"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-[140px] flex items-center justify-center text-xs text-muted-foreground font-mono animate-pulse">
          Loading…
        </div>
      ) : (
        <PriceChart ticks={ticks} symbol={symbol} color={color} />
      )}

      {minPrice > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
          <span>Alert threshold:</span>
          <span className={currentPrice !== undefined && currentPrice < minPrice ? "text-red-400 font-medium" : "text-foreground"}>
            ${minPrice.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
