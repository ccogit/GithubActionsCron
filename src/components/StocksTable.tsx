"use client";

import { useState, Fragment, type ReactNode } from "react";
import { Trash2, Check, X, TrendingUp, TrendingDown, ArrowDownToLine, ShoppingCart, ChevronDown, Newspaper, Landmark, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { removeSymbol, updateMinPrice } from "@/app/actions";
import { closePositionAction, placeOrderAction } from "@/app/alpaca-actions";
import { StockChartPanel } from "@/components/StockChartPanel";
import type { WatchlistRow, PriceTick } from "@/lib/types";
import type { AlpacaPosition } from "@/lib/alpaca";

export type Holding = {
  symbol: string;
  watch: WatchlistRow | null;
  position: AlpacaPosition | null;
};

export type SymbolSignals = {
  upside_pct?: number | null;
  news_sentiment?: number | null;
  buy_count?: number;
  sell_count?: number;
  trends_direction?: string | null;
};

type Props = {
  holdings: Holding[];
  latestPrices: Record<string, number>;
  changes: Record<string, number | null>;
  colors: string[];
  ticksBySymbol: Record<string, PriceTick[]>;
  signals?: Record<string, SymbolSignals>;
};

function SignalPill({
  icon,
  children,
  tone,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  tone: "green" | "red" | "yellow" | "blue" | "gray";
  title?: string;
}) {
  const tones = {
    green: "bg-green-500/10 text-green-300",
    red: "bg-red-500/10 text-red-300",
    yellow: "bg-yellow-500/10 text-yellow-300",
    blue: "bg-blue-500/10 text-blue-300",
    gray: "bg-white/5 text-muted-foreground",
  };
  return (
    <div
      title={title}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${tones[tone]}`}
    >
      <span className="opacity-80">{icon}</span>
      {children}
    </div>
  );
}

function SignalsCell({ s }: { s?: SymbolSignals }) {
  if (!s) return <span className="text-muted-foreground font-mono text-xs">—</span>;

  const congressTotal = (s.buy_count ?? 0) + (s.sell_count ?? 0);
  const hasAny =
    s.upside_pct != null ||
    s.news_sentiment != null ||
    congressTotal > 0 ||
    (s.trends_direction && s.trends_direction !== "stable");

  if (!hasAny) return <span className="text-muted-foreground font-mono text-xs">—</span>;

  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {s.upside_pct != null && (
        <SignalPill
          icon={<Sparkles className="w-2.5 h-2.5" />}
          tone={s.upside_pct > 5 ? "green" : s.upside_pct < -3 ? "red" : "gray"}
          title="Analyst upside"
        >
          {s.upside_pct > 0 ? "+" : ""}
          {s.upside_pct.toFixed(0)}%
        </SignalPill>
      )}
      {congressTotal > 0 && (
        <SignalPill
          icon={<Landmark className="w-2.5 h-2.5" />}
          tone={(s.buy_count ?? 0) > (s.sell_count ?? 0) ? "green" : (s.sell_count ?? 0) > (s.buy_count ?? 0) ? "red" : "yellow"}
          title="Congressional trades (buys / sells)"
        >
          {s.buy_count ?? 0}/{s.sell_count ?? 0}
        </SignalPill>
      )}
      {s.news_sentiment != null && (
        <SignalPill
          icon={<Newspaper className="w-2.5 h-2.5" />}
          tone={s.news_sentiment > 0.1 ? "green" : s.news_sentiment < -0.1 ? "red" : "yellow"}
          title="News sentiment"
        >
          {(s.news_sentiment * 100).toFixed(0)}%
        </SignalPill>
      )}
      {s.trends_direction && s.trends_direction !== "stable" && (
        <SignalPill
          icon={
            s.trends_direction === "rising" ? (
              <TrendingUp className="w-2.5 h-2.5" />
            ) : (
              <TrendingDown className="w-2.5 h-2.5" />
            )
          }
          tone={s.trends_direction === "rising" ? "green" : "red"}
          title="Search interest trend"
        >
          {s.trends_direction}
        </SignalPill>
      )}
    </div>
  );
}

export function StocksTable({ holdings, latestPrices, changes, colors, ticksBySymbol, signals }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [buyingSymbol, setBuyingSymbol] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState("1");

  function toggleChart(symbol: string) {
    setSelectedSymbol((prev) => (prev === symbol ? null : symbol));
    setEditingId(null);
    setBuyingSymbol(null);
  }

  function startEdit(watch: WatchlistRow) {
    setBuyingSymbol(null);
    setEditingId(watch.id);
    setEditValue(String(watch.min_price));
  }

  async function saveEdit(symbol: string) {
    const val = parseFloat(editValue);
    if (!isNaN(val)) await updateMinPrice(symbol, val);
    setEditingId(null);
  }

  function startBuy(symbol: string) {
    setEditingId(null);
    setBuyingSymbol(symbol);
    setBuyQty("1");
  }

  async function confirmBuy(symbol: string) {
    const qty = parseInt(buyQty, 10);
    if (!qty || qty < 1) return;
    const fd = new FormData();
    fd.set("symbol", symbol);
    fd.set("qty", String(qty));
    fd.set("side", "buy");
    fd.set("type", "market");
    await placeOrderAction(fd);
    setBuyingSymbol(null);
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
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Signals</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Alert at</th>
            <th className="text-center py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Status</th>
            <th className="w-36" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {[...holdings]
            .sort((a, b) => {
              const rank = (h: Holding) =>
                h.watch && !h.position ? 0 : h.watch && h.position ? 1 : 2;
              return rank(a) - rank(b);
            })
            .map((h, i) => {
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

            const isSelected = selectedSymbol === h.symbol;

            return (
              <Fragment key={h.symbol}>
              <tr
                className={`group hover:bg-white/2 transition-colors cursor-pointer ${isSelected ? "bg-white/[0.015]" : ""}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,input")) return;
                  toggleChart(h.symbol);
                }}
              >
                {/* Symbol with type label */}
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2.5">
                    <ChevronDown
                      className={`h-3 w-3 flex-shrink-0 text-muted-foreground/40 transition-transform duration-150 ${isSelected ? "rotate-180" : ""}`}
                    />
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

                {/* Signals */}
                <td className="py-3 px-3 text-right">
                  <SignalsCell s={signals?.[h.symbol]} />
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
                  {buyingSymbol === h.symbol ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={buyQty}
                        onChange={(e) => setBuyQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmBuy(h.symbol);
                          if (e.key === "Escape") setBuyingSymbol(null);
                        }}
                        className="w-16 h-7 text-xs font-mono text-right bg-white/5 border-blue-500/30 focus:border-blue-400/60 focus:ring-blue-500/20"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => confirmBuy(h.symbol)}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-blue-400 hover:bg-blue-500/15 transition-colors"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuyingSymbol(null)}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1 opacity-30 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startBuy(h.symbol)}
                        title="Buy"
                        className="h-7 px-2 rounded-md flex items-center gap-1 text-xs font-mono font-medium text-blue-400 hover:bg-blue-500/15 border border-transparent hover:border-blue-500/30 transition-all"
                      >
                        <ShoppingCart className="h-3 w-3" />
                        Buy
                      </button>
                      {isOwned && (
                        <button
                          type="button"
                          onClick={() => closePositionAction(h.symbol)}
                          title="Sell (close position)"
                          className="h-7 px-2 rounded-md flex items-center gap-1 text-xs font-mono font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                        >
                          <ArrowDownToLine className="h-3 w-3" />
                          Sell
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
                  )}
                </td>
              </tr>
              {isSelected && (
                <tr>
                  <td colSpan={9} className="px-4 pb-5 pt-1 bg-white/[0.015] border-b border-white/4">
                    <StockChartPanel
                      symbol={h.symbol}
                      color={color}
                      initialTicks={ticksBySymbol[h.symbol] ?? []}
                      currentPrice={price}
                      minPrice={minPrice}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
