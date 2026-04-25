"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import type { PriceTick } from "@/lib/types";

type Props = {
  ticks: PriceTick[];
  symbol: string;
  color: string;
};

export function PriceChart({ ticks, symbol, color }: Props) {
  if (ticks.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-muted-foreground font-mono">
        No price data yet
      </div>
    );
  }

  const data = [...ticks]
    .sort((a, b) => a.fetched_at.localeCompare(b.fetched_at))
    .map((tick) => ({
      time: format(new Date(tick.fetched_at), "HH:mm"),
      price: tick.price,
    }));

  const prices = data.map((d) => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const padding = (maxP - minP) * 0.15 || 1;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.04)"
          vertical={false}
        />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains)" }}
          axisLine={false}
          tickLine={false}
          domain={[minP - padding, maxP + padding]}
          tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          width={52}
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
          formatter={(v) => [`$${Number(v).toFixed(2)}`, symbol]}
          cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${symbol})`}
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
