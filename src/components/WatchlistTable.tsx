"use client";

import { useState } from "react";
import { Trash2, Check, X, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { removeSymbol, updateMinPrice } from "@/app/actions";
import type { WatchlistRow } from "@/lib/types";

type Props = {
  watchlist: WatchlistRow[];
  latestPrices: Record<string, number>;
  changes: Record<string, number | null>;
  colors: string[];
};

export function WatchlistTable({ watchlist, latestPrices, changes, colors }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(row: WatchlistRow) {
    setEditingId(row.id);
    setEditValue(String(row.min_price));
  }

  async function saveEdit(symbol: string) {
    const val = parseFloat(editValue);
    if (!isNaN(val)) await updateMinPrice(symbol, val);
    setEditingId(null);
  }

  if (watchlist.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground font-mono">
        No stocks in watchlist — add one above
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6">
            <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Symbol</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Price</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">2h Chg</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Min Alert</th>
            <th className="text-center py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Status</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {watchlist.map((row, i) => {
            const color = colors[i % colors.length];
            const price = latestPrices[row.symbol];
            const change = changes[row.symbol];
            const below = price !== undefined && row.min_price > 0 && price < row.min_price;
            const hasData = price !== undefined;

            return (
              <tr key={row.id} className="group hover:bg-white/2 transition-colors">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono font-bold text-base" style={{ color }}>
                      {row.symbol}
                    </span>
                  </div>
                </td>

                <td className="py-3 px-3 text-right font-mono font-semibold text-foreground tabular-nums">
                  {hasData ? `$${price.toFixed(2)}` : "—"}
                </td>

                <td className="py-3 px-3 text-right">
                  {change !== null && change !== undefined ? (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-xs font-medium ${
                        change >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {change >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {change >= 0 ? "+" : ""}
                      {change.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">—</span>
                  )}
                </td>

                <td className="py-3 px-3 text-right">
                  {editingId === row.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        className="w-24 h-7 text-xs font-mono text-right bg-white/5 border-white/15"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(row.symbol);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button type="button" onClick={() => saveEdit(row.symbol)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/15 transition-colors">
                        <Check className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer tabular-nums"
                      onClick={() => startEdit(row)}
                      title="Click to edit"
                    >
                      {row.min_price > 0 ? `$${row.min_price.toFixed(2)}` : "—"}
                    </button>
                  )}
                </td>

                <td className="py-3 px-3 text-center">
                  {below ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                      ALERT
                    </span>
                  ) : hasData ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-white/5 text-muted-foreground border border-white/8">
                      NO DATA
                    </span>
                  )}
                </td>

                <td className="py-3 px-2">
                  <button
                    type="button"
                    onClick={() => removeSymbol(row.symbol)}
                    className="h-7 w-7 rounded-md flex items-center justify-center opacity-20 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
