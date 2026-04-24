"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import type { PriceTick } from "@/lib/types";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

type Props = {
  ticks: PriceTick[];
  symbols: string[];
};

export function PriceChart({ ticks, symbols }: Props) {
  // Pivot ticks into [{fetched_at, AAPL: 123, GOOG: 456}, ...]
  const byTime: Record<string, Record<string, number>> = {};
  for (const tick of ticks) {
    const key = tick.fetched_at;
    byTime[key] = byTime[key] ?? {};
    byTime[key][tick.symbol] = tick.price;
  }

  const data = Object.entries(byTime)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, prices]) => ({
      time: format(new Date(time), "HH:mm"),
      ...prices,
    }));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No price data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
          formatter={(v) => [`$${Number(v).toFixed(2)}`]}
        />
        {symbols.map((sym, i) => (
          <Line
            key={sym}
            type="monotone"
            dataKey={sym}
            stroke={COLORS[i % COLORS.length]}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
