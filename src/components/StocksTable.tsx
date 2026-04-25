"use client";

import { useState } from "react";
import { Trash2, Check, X, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { removeSymbol, updateMinPrice } from "@/app/actions";
import { closePositionAction } from "@/app/alpaca-actions";
import type { WatchlistRow } from "@/lib/types";
import type { AlpacaPosition } from "@/lib/alpaca";

export type Holding = {
  symbol: string;
  watch: WatchlistRow | null;
  position: AlpacaPosition | null;
};

type Props = {
  holdings: Holding[];
  latestPrices: Record<string, number>;
  changes: Record<string, number | null>;
  colors: string[];
};

export function StocksTable({ holdings, latestPrices, changes, colors }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(watch: WatchlistRow) {
    setEditingId(watch.id);
    setEditValue(String(watch.min_price));
  }

  async function saveEdit(symbol: string) {
    const val = parseFloat(editValue);
    if (!isNaN(val)) await updateMinPrice(symbol, val);
    setEditingId(null);
  }

  if (holdings.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground font-mono">
        No stocks yet — add one to your watchlist or buy a position above
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
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Holding</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">P&amp;L</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Alert at</th>
            <th className="text-center py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Status</th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {holdings.map((h, i) => {
            const color = colors[i % colors.length];
            const tickPrice = latestPrices[h.symbol];
            const fallbackPrice = h.position ? parseFloat(h.position.current_price) : undefined;
            const price = tickPrice ?? fallbackPrice;
            const change = changes[h.symbol];

            const isWatch = h.watch !== null;
            const isOwned = h.position !== null;
            const minPrice = h.watch?.min_price ?? 0;
            const below = price !== undefined && minPrice > 0 && price < minPrice;

            const qty = h.position ? parseFloat(h.position.qty) : 0;
            const pl = h.position ? parseFloat(h.position.unrealized_pl) : 0;
            const plpc = h.position ? parseFloat(h.position.unrealized_plpc) * 100 : 0;
            const avgEntry = h.position ? parseFloat(h.position.avg_entry_price) : 0;

            return (
              <tr key={h.symbol} className="group hover:bg-white/2 transition-colors">
                {/* Symbol with type label */}
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex flex-col gap-0.5 leading-none">
                      <span className="font-mono font-bold text-base" style={{ color }}>
                        {h.symbol}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider">
                        {isWatch && isOwned ? (
                          <span className="text-primary/80">watch · owned</span>
                        ) : isOwned ? (
                          <span className="text-blue-400/80">owned</span>
                        ) : (
                          <span className="text-muted-foreground">watching</span>
                        )}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Price */}
                <td className="py-3 px-3 text-right font-mono font-semibold text-foreground tabular-nums">
                  {price !== undefined ? `$${price.toFixed(2)}` : "—"}
                </td>

                {/* 2h chg */}
                <td className="py-3 px-3 text-right">
                  {change !== null && change !== undefined ? (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-xs font-medium ${
                        change >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">—</span>
                  )}
                </td>

                {/* Holding (qty + avg entry) */}
                <td className="py-3 px-3 text-right font-mono text-xs tabular-nums">
                  {isOwned ? (
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-foreground">
                        {qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(4)} sh
                      </span>
                      <span className="text-muted-foreground/70 text-[10px]">
                        @ ${avgEntry.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* P&L */}
                <td className="py-3 px-3 text-right">
                  {isOwned ? (
                    <div
                      className={`font-mono tabular-nums text-xs leading-tight flex flex-col items-end ${
                        pl >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      <span>{pl >= 0 ? "+" : ""}${pl.toFixed(2)}</span>
                      <span className="opacity-70 text-[10px]">
                        ({plpc >= 0 ? "+" : ""}{plpc.toFixed(2)}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">—</span>
                  )}
                </td>

                {/* Alert at (editable when watching) */}
                <td className="py-3 px-3 text-right">
                  {isWatch && editingId === h.watch!.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        className="w-24 h-7 text-xs font-mono text-right bg-white/5 border-white/15"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(h.symbol);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button type="button" onClick={() => saveEdit(h.symbol)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/15 transition-colors">
                        <Check className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : isWatch ? (
                    <button
                      className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer tabular-nums"
                      onClick={() => startEdit(h.watch!)}
                      title="Click to edit"
                    >
                      {minPrice > 0 ? `$${minPrice.toFixed(2)}` : "—"}
                    </button>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">—</span>
                  )}
                </td>

                {/* Status */}
                <td className="py-3 px-3 text-center">
                  {below ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                      ALERT
                    </span>
                  ) : isWatch && price !== undefined ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      OK
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">—</span>
                  )}
                </td>

                {/* Actions (context-aware) */}
                <td className="py-3 px-2">
                  <div className="flex items-center justify-end gap-1 opacity-30 group-hover:opacity-100 transition-opacity">
                    {isOwned && (
                      <button
                        type="button"
                        onClick={() => closePositionAction(h.symbol)}
                        title="Sell (close position)"
                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isWatch && (
                      <button
                        type="button"
                        onClick={() => removeSymbol(h.symbol)}
                        title="Remove from watchlist"
                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
