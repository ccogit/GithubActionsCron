"use client";

import { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import type { PortfolioPoint } from "@/lib/alpaca";

type Range = "1D" | "1W" | "1Y" | "MAX";

const RANGES: Range[] = ["1D", "1W", "1Y", "MAX"];

const TICK_FORMAT: Record<Range, (ts: number) => string> = {
  "1D":  (ts) => format(ts, "HH:mm"),
  "1W":  (ts) => format(ts, "EEE HH:mm"),
  "1Y":  (ts) => format(ts, "MMM d"),
  "MAX": (ts) => format(ts, "MMM yyyy"),
};

const TOOLTIP_FORMAT: Record<Range, (ts: number) => string> = {
  "1D":  (ts) => format(ts, "HH:mm, MMM d"),
  "1W":  (ts) => format(ts, "EEE HH:mm, MMM d"),
  "1Y":  (ts) => format(ts, "MMM d, yyyy"),
  "MAX": (ts) => format(ts, "MMM d, yyyy"),
};

const ACCENT = "#00c896";

export function BudgetHistoryWidget() {
  const [range, setRange] = useState<Range>("1D");
  const [points, setPoints] = useState<PortfolioPoint[]>([]);
  const [baseValue, setBaseValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portfolio-history?range=${range}`)
      .then((r) => r.json())
      .then(({ points, baseValue }) => {
        setPoints(points ?? []);
        setBaseValue(baseValue ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range]);

  const lastValue  = points.at(-1)?.value ?? 0;
  const firstValue = points[0]?.value ?? baseValue;
  const delta      = lastValue - firstValue;
  const deltaPct   = firstValue > 0 ? (delta / firstValue) * 100 : 0;
  const isUp       = delta >= 0;

  const data = points.map((p) => ({ ts: p.timestamp, value: p.value }));

  const values  = points.map((p) => p.value);
  const minVal  = values.length ? Math.min(...values) : 0;
  const maxVal  = values.length ? Math.max(...values) : 1;
  const padding = (maxVal - minVal) * 0.12 || maxVal * 0.05 || 1;

  return (
    <div className="rounded-lg border border-white/8 bg-card p-5 col-span-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-3.5 w-3.5" style={{ color: ACCENT }} />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Portfolio Value
          </span>
        </div>

        {/* Period switcher */}
        <div className="flex items-center gap-0.5 bg-white/4 rounded-md p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                range === r
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Key metric */}
      <div className="flex items-baseline gap-3 mb-5">
        <span className="text-3xl font-mono font-semibold text-foreground tabular-nums">
          {loading ? "—" : `$${lastValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </span>
        {!loading && lastValue > 0 && (
          <span className={`flex items-center gap-1 text-sm font-mono tabular-nums ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {isUp ? "+" : ""}${Math.abs(delta).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs opacity-75">({isUp ? "+" : ""}{deltaPct.toFixed(2)}%)</span>
          </span>
        )}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <span className="text-xs text-muted-foreground font-mono animate-pulse">Loading…</span>
        </div>
      ) : data.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <span className="text-xs text-muted-foreground font-mono">No data for this period</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={192}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="budget-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={ACCENT} stopOpacity={0.2} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="ts"
              tickFormatter={(ts) => TICK_FORMAT[range](ts)}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)" }}
              axisLine={false}
              tickLine={false}
              domain={[minVal - padding, maxVal + padding]}
              tickFormatter={(v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.1 0.022 248)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                fontSize: "11px",
                fontFamily: "var(--font-jetbrains), monospace",
                color: "rgba(255,255,255,0.85)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.4)", marginBottom: 2 }}
              labelFormatter={(ts) => TOOLTIP_FORMAT[range](ts)}
              formatter={(v) => [`$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Value"]}
              cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={ACCENT}
              strokeWidth={1.5}
              fill="url(#budget-grad)"
              dot={false}
              activeDot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
