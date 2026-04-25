"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { PriceChart } from "@/components/PriceChart";
import type { PriceTick } from "@/lib/types";

const PERIODS = ["2h", "1D", "1W", "1M", "3M"] as const;
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
  initialTicks: PriceTick[];
  currentPrice?: number;
  minPrice?: number;
};

export function StockChartPanel({
  symbol,
  color,
  initialTicks,
  currentPrice,
  minPrice = 0,
}: Props) {
  const [period, setPeriod] = useState<Period>("2h");
  const [ticks, setTicks] = useState<PriceTick[]>(initialTicks);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period === "2h") {
      setTicks(initialTicks);
      return;
    }
    setLoading(true);
    fetch(`/api/stock-bars?symbol=${symbol}&period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        setTicks(barsToTicks(data.bars ?? []));
      })
      .catch(() => setTicks([]))
      .finally(() => setLoading(false));
  }, [period, symbol, initialTicks]);

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
