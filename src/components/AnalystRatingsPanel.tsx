"use client";

import { useEffect, useState } from "react";
import type { AnalystRatings } from "@/app/api/analyst-ratings/route";

type Props = { symbol: string; currency: string };

export function AnalystRatingsPanel({ symbol, currency }: Props) {
  const [data, setData] = useState<AnalystRatings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    fetch(`/api/analyst-ratings?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground font-mono animate-pulse">
        Loading analyst data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-4 text-center text-xs text-red-400 font-mono">
        {error ?? "No analyst data available"}
      </div>
    );
  }

  const total = data.strongBuy + data.buy + data.hold + data.sell + data.strongSell;
  const bars = [
    { label: "Strong Buy", value: data.strongBuy, color: "bg-emerald-500" },
    { label: "Buy", value: data.buy, color: "bg-emerald-400" },
    { label: "Hold", value: data.hold, color: "bg-amber-400" },
    { label: "Sell", value: data.sell, color: "bg-red-400" },
    { label: "Strong Sell", value: data.strongSell, color: "bg-red-600" },
  ];

  const fmt = (v: number | null) =>
    v != null ? `${currency === "EUR" ? "€" : "$"}${v.toFixed(2)}` : "—";

  const upside =
    data.targetMean && data.currentPrice && data.currentPrice > 0
      ? ((data.targetMean - data.currentPrice) / data.currentPrice) * 100
      : null;

  return (
    <div className="py-3 px-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
      {/* Recommendation breakdown */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Analyst Recommendations
          </span>
          {data.numberOfAnalysts != null && (
            <span className="text-[10px] font-mono text-muted-foreground/60">
              {data.numberOfAnalysts} analysts
            </span>
          )}
        </div>
        <div className="space-y-2">
          {bars.map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-20 text-[10px] font-mono text-muted-foreground/80 text-right shrink-0">
                {label}
              </span>
              <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: total > 0 ? `${(value / total) * 100}%` : "0%" }}
                />
              </div>
              <span className="w-5 text-[10px] font-mono tabular-nums text-foreground/70 text-right shrink-0">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Price targets */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Price Targets
        </div>
        <div className="space-y-2.5">
          {[
            { label: "Current", value: fmt(data.currentPrice) },
            { label: "Target (mean)", value: fmt(data.targetMean) },
            { label: "Target (median)", value: fmt(data.targetMedian) },
            { label: "High", value: fmt(data.targetHigh) },
            { label: "Low", value: fmt(data.targetLow) },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground/70">{label}</span>
              <span className="text-xs font-mono font-semibold tabular-nums text-foreground">
                {value}
              </span>
            </div>
          ))}
          {upside !== null && (
            <div className="pt-1 border-t border-white/6 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground/70">Upside (mean)</span>
              <span
                className={`text-xs font-mono font-bold tabular-nums ${upside >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {upside >= 0 ? "+" : ""}
                {upside.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
