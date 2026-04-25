"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Eye, ShoppingCart, BarChart2, Layers, TrendingUp, TrendingDown, Check, X, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { addSymbol } from "@/app/actions";
import { placeOrderAction } from "@/app/alpaca-actions";
import { AnalystRatingsPanel } from "@/components/AnalystRatingsPanel";
import { DerivativesPanel } from "@/components/DerivativesPanel";
import { INDEX_STOCKS, ISIN_MAP } from "@/lib/market-data";
import type { QuoteRow } from "@/app/api/market-quotes/route";

const EXCHANGES = ["Dow Jones", "Nasdaq 100", "DAX"] as const;
type Exchange = (typeof EXCHANGES)[number];
type PanelType = "ratings" | "derivatives";

type ActivePanel = { symbol: string; type: PanelType } | null;
type BuyState = { symbol: string; qty: string } | null;

export function MarketTable() {
  const [exchange, setExchange] = useState<Exchange>("Dow Jones");
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [buying, setBuying] = useState<BuyState>(null);
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());

  const fetchQuotes = useCallback(async (ex: Exchange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-quotes?exchange=${encodeURIComponent(ex)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch (e) {
      setError(String(e));
      // Fall back to static list with no price data
      setRows(
        (INDEX_STOCKS[ex] ?? []).map((s) => ({
          symbol: s.symbol,
          name: s.name,
          price: null,
          change: null,
          changePct: null,
          currency: ex === "DAX" ? "EUR" : "USD",
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setActivePanel(null);
    setBuying(null);
    fetchQuotes(exchange);
  }, [exchange, fetchQuotes]);

  function togglePanel(symbol: string, type: PanelType) {
    setBuying(null);
    setActivePanel((prev) =>
      prev?.symbol === symbol && prev.type === type ? null : { symbol, type }
    );
  }

  function startBuy(symbol: string) {
    setActivePanel(null);
    setBuying({ symbol, qty: "1" });
  }

  async function confirmBuy(symbol: string, qty: string) {
    const n = parseInt(qty, 10);
    if (!n || n < 1) return;
    const fd = new FormData();
    fd.set("symbol", symbol.replace(".DE", "").replace(/\.[A-Z]+$/, ""));
    fd.set("qty", String(n));
    fd.set("side", "buy");
    fd.set("type", "market");
    await placeOrderAction(fd);
    setBuying(null);
  }

  async function handleWatch(symbol: string) {
    const bare = symbol.replace(/\.[A-Z]+$/, "");
    const fd = new FormData();
    fd.set("symbol", bare);
    fd.set("min_price", "0");
    await addSymbol({ error: null }, fd);
    setWatchedSymbols((prev) => new Set([...prev, symbol]));
  }

  const currencySymbol = (row: QuoteRow) => (row.currency === "EUR" ? "€" : "$");

  return (
    <div>
      {/* Exchange selector + refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          {EXCHANGES.map((ex) => (
            <button
              key={ex}
              onClick={() => setExchange(ex)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                exchange === ex
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {ex}
            </button>
          ))}
        </div>
        <button
          onClick={() => fetchQuotes(exchange)}
          disabled={loading}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors disabled:opacity-40"
          title="Refresh prices"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/6">
                <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground w-24">
                  Symbol
                </th>
                <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Name
                </th>
                <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Price
                </th>
                <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Day Chg
                </th>
                <th className="w-64 py-2.5 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              {rows.map((row) => {
                const isActive = activePanel?.symbol === row.symbol;
                const isBuying = buying?.symbol === row.symbol;
                const watched = watchedSymbols.has(row.symbol);

                return (
                  <Fragment key={row.symbol}>
                    <tr className={`group hover:bg-white/2 transition-colors ${isActive ? "bg-white/[0.015]" : ""}`}>
                      {/* Symbol */}
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-sm text-primary">
                          {row.symbol.replace(".DE", "")}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="py-2.5 px-3 text-xs text-muted-foreground/80">
                        {row.name}
                      </td>

                      {/* Price */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-foreground">
                        {loading && !row.price ? (
                          <span className="text-muted-foreground/40 text-xs">…</span>
                        ) : row.price != null ? (
                          `${currencySymbol(row)}${row.price.toFixed(2)}`
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Day change */}
                      <td className="py-2.5 px-3 text-right">
                        {row.changePct != null ? (
                          <span
                            className={`inline-flex items-center gap-1 font-mono text-xs font-medium ${
                              row.changePct >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {row.changePct >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {row.changePct >= 0 ? "+" : ""}
                            {row.changePct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-2">
                        {isBuying ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={buying.qty}
                              onChange={(e) => setBuying({ ...buying, qty: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") confirmBuy(row.symbol, buying.qty);
                                if (e.key === "Escape") setBuying(null);
                              }}
                              className="w-16 h-7 text-xs font-mono text-right bg-white/5 border-blue-500/30 focus:border-blue-400/60 focus:ring-blue-500/20"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => confirmBuy(row.symbol, buying.qty)}
                              className="h-7 w-7 rounded-md flex items-center justify-center text-blue-400 hover:bg-blue-500/15 transition-colors"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setBuying(null)}
                              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleWatch(row.symbol)}
                              title={watched ? "Added to watchlist" : "Add to watchlist"}
                              className={`h-7 px-1.5 rounded-md flex items-center gap-1 text-[10px] font-mono transition-all border ${
                                watched
                                  ? "text-primary border-primary/30 bg-primary/10"
                                  : "text-muted-foreground border-transparent hover:text-primary hover:bg-primary/10 hover:border-primary/20"
                              }`}
                            >
                              <Eye className="h-3 w-3" />
                              {watched ? "Watching" : "Watch"}
                            </button>
                            <button
                              type="button"
                              onClick={() => startBuy(row.symbol)}
                              title="Buy"
                              className="h-7 px-1.5 rounded-md flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:bg-blue-500/15 border border-transparent hover:border-blue-500/30 transition-all"
                            >
                              <ShoppingCart className="h-3 w-3" />
                              Buy
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePanel(row.symbol, "ratings")}
                              title="Analyst ratings"
                              className={`h-7 px-1.5 rounded-md flex items-center gap-1 text-[10px] font-mono transition-all border ${
                                isActive && activePanel?.type === "ratings"
                                  ? "text-amber-400 bg-amber-500/10 border-amber-500/25"
                                  : "text-muted-foreground border-transparent hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20"
                              }`}
                            >
                              <BarChart2 className="h-3 w-3" />
                              Ratings
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePanel(row.symbol, "derivatives")}
                              title="Derivatives / knockouts"
                              className={`h-7 px-1.5 rounded-md flex items-center gap-1 text-[10px] font-mono transition-all border ${
                                isActive && activePanel?.type === "derivatives"
                                  ? "text-purple-400 bg-purple-500/10 border-purple-500/25"
                                  : "text-muted-foreground border-transparent hover:text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/20"
                              }`}
                            >
                              <Layers className="h-3 w-3" />
                              Derivs
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Expanded panel row */}
                    {isActive && activePanel && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 pb-4 pt-1 bg-white/[0.015] border-b border-white/6"
                        >
                          {activePanel.type === "ratings" ? (
                            <AnalystRatingsPanel symbol={row.symbol} currency={row.currency} />
                          ) : (
                            <DerivativesPanel symbol={row.symbol} isin={ISIN_MAP[row.symbol]} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="px-4 py-2 border-t border-white/6 text-[10px] font-mono text-muted-foreground/50">
            Price data unavailable: {error}
          </div>
        )}
      </div>
    </div>
  );
}
