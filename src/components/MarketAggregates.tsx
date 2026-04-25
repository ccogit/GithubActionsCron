"use client";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Calendar } from "lucide-react";

interface HotStock {
  exchange: string;
  symbol: string;
  name: string;
  currentPrice: number;
  targetMean: number | null;
  upside: number | null;
  nAnalysts: number | null;
}

interface Mover {
  exchange: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

interface Earning {
  symbol: string;
  name: string;
  date: string;
  epsEstimate: number | null;
}

export function MarketAggregates() {
  const [data, setData] = useState<{
    hotStocks: HotStock[];
    topMovers: Mover[];
    earnings: Earning[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAggregates = async () => {
      try {
        const res = await fetch("/api/market-aggregates");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching aggregates:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAggregates();
    const interval = setInterval(fetchAggregates, 300000); // Refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) return null;

  const groupByExchange = (items: any[]): Record<string, any[]> => {
    const grouped: Record<string, any[]> = {};
    for (const item of items) {
      grouped[item.exchange] ??= [];
      grouped[item.exchange].push(item);
    }
    return grouped;
  };

  const hotStocksByEx = groupByExchange(data.hotStocks);
  const moversByEx = groupByExchange(data.topMovers);

  return (
    <div className="space-y-6">
      {/* Hot Stocks */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          Hot Stocks (Analyst Upside)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["Dow Jones", "Nasdaq 100", "DAX"].map((ex) => (
            <div key={ex} className="rounded-lg border border-white/8 bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground mb-3 uppercase">
                {ex}
              </div>
              <div className="space-y-3">
                {(hotStocksByEx[ex] || []).map((stock) => (
                  <div key={stock.symbol} className="space-y-1 text-sm">
                    <div className="flex justify-between items-start">
                      <span className="font-medium">{stock.symbol}</span>
                      <span
                        className={
                          (stock.upside || 0) > 0
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {stock.upside ? stock.upside.toFixed(1) : "—"}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${stock.currentPrice.toFixed(2)} → $
                      {stock.targetMean?.toFixed(2) || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stock.nAnalysts || 0} analysts
                    </div>
                  </div>
                ))}
                {(hotStocksByEx[ex] || []).length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    No data available
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Movers */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingDown className="w-4 h-4" />
          Top Movers (Today)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["Dow Jones", "Nasdaq 100", "DAX"].map((ex) => {
            const exMovers = (moversByEx[ex] || []).sort(
              (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)
            );
            return (
              <div key={ex} className="rounded-lg border border-white/8 bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground mb-3 uppercase">
                  {ex}
                </div>
                <div className="space-y-3">
                  {exMovers.slice(0, 3).map((mover) => (
                    <div key={mover.symbol} className="space-y-1 text-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{mover.symbol}</span>
                        <span
                          className={
                            mover.changePct > 0
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          {mover.changePct > 0 ? "+" : ""}
                          {mover.changePct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${mover.price.toFixed(2)} ({mover.change > 0 ? "+" : ""}
                        {mover.change.toFixed(2)})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Earnings */}
      {data.earnings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Earnings This Week
          </h3>
          <div className="rounded-lg border border-white/8 bg-card p-4">
            <div className="space-y-3">
              {data.earnings.map((earning) => (
                <div key={earning.symbol} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-medium">{earning.symbol}</span>
                    <span className="text-muted-foreground text-xs ml-2">
                      {earning.name}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {earning.date && new Date(earning.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
