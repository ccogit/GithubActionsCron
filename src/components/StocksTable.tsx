"use client";

import { useState, Fragment } from "react";
import { Trash2, Check, X, ArrowDownToLine, ShoppingCart, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { removeSymbol, updateMinPrice } from "@/app/actions";
import { closePositionAction, placeOrderAction } from "@/app/alpaca-actions";
import { StockChartPanel } from "@/components/StockChartPanel";
import { computeAttractiveness } from "@/lib/attractiveness";
import type { WatchlistRow, PriceTick } from "@/lib/types";
import type { AlpacaPosition } from "@/lib/alpaca";

export type Holding = {
  symbol: string;
  watch: WatchlistRow | null;
  position: AlpacaPosition | null;
};

export type PeriodChanges = {
  day: number | null;
  week: number | null;
  month: number | null;
  ytd: number | null;
};

export type SymbolSignals = {
  upside_pct?: number | null;
  buy_count?: number | null;
  sell_count?: number | null;
  news_sentiment?: number | null;
  trends_direction?: string | null;
  changePct?: number | null;
  consensus_score?: number | null;
  tech_signal?: string | null;
  short_pct_float?: number | null;
  insider_signal?: string | null;
  eps_beat_rate?: number | null;
  wsb_sentiment?: string | null;
};

type Props = {
  holdings: Holding[];
  latestPrices: Record<string, number>;
  periodChanges: Record<string, PeriodChanges>;
  colors: string[];
  ticksBySymbol: Record<string, PriceTick[]>;
  signals?: Record<string, SymbolSignals>;
};

function OverallSignalBadge({ s }: { s?: SymbolSignals }) {
  if (!s) return <span className="text-muted-foreground font-mono text-xs">—</span>;

  const result = computeAttractiveness(s);
  if (result.signalCount === 0) return <span className="text-muted-foreground font-mono text-xs">—</span>;

  const { score, outlook, signalCount, reasons } = result;

  const styles = {
    bullish: "bg-green-500/15 text-green-300 border-green-500/30",
    bearish: "bg-red-500/15 text-red-300 border-red-500/30",
    mixed:   "bg-white/6 text-muted-foreground border-white/12",
  };

  const tooltip = [
    `Score: ${score > 0 ? "+" : ""}${score} (${signalCount} signal${signalCount !== 1 ? "s" : ""} firing)`,
    ...reasons,
  ].join("\n");

  return (
    <div
      title={tooltip}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold font-mono tabular-nums cursor-default ${styles[outlook]}`}
    >
      <span>{score > 0 ? "+" : ""}{score}</span>
      <span className="opacity-50 font-normal text-[9px] uppercase tracking-wider">{outlook}</span>
    </div>
  );
}

export function StocksTable({ holdings, latestPrices, periodChanges, colors, ticksBySymbol, signals }: Props) {
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
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Change</th>
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
            const periods = periodChanges[h.symbol] ?? { day: null, week: null, month: null, ytd: null };

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

                {/* Period changes */}
                <td className="py-3 px-3 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    {([ ["1D", periods.day], ["1W", periods.week], ["1M", periods.month], ["YTD", periods.ytd] ] as [string, number | null][]).map(([label, val]) => (
                      <div key={label} className="flex items-center gap-1.5 leading-none">
                        <span className="text-[9px] font-mono uppercase text-muted-foreground/50 w-6 text-right">{label}</span>
                        {val !== null ? (
                          <span className={`font-mono text-[11px] font-medium tabular-nums ${val >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {val >= 0 ? "+" : ""}{val.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground/30">—</span>
                        )}
                      </div>
                    ))}
                  </div>
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
                  <OverallSignalBadge s={signals?.[h.symbol]} />
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
