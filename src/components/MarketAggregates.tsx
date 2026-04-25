"use client";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Calendar } from "lucide-react";

// Get color and intensity for upside percentage
function getUpsideColor(upside: number | null | undefined) {
  if (!upside) return { bg: "bg-gray-500/20", text: "text-gray-400", bar: "bg-gray-500" };
  if (upside < 0) return { bg: "bg-red-500/20", text: "text-red-400", bar: "bg-red-500" };
  if (upside < 10) return { bg: "bg-orange-500/20", text: "text-orange-400", bar: "bg-orange-500" };
  if (upside < 25) return { bg: "bg-yellow-500/20", text: "text-yellow-400", bar: "bg-yellow-500" };
  if (upside < 40) return { bg: "bg-lime-500/20", text: "text-lime-400", bar: "bg-lime-500" };
  return { bg: "bg-green-500/20", text: "text-green-400", bar: "bg-green-500" };
}

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
                {(hotStocksByEx[ex] || []).map((stock) => {
                  const colors = getUpsideColor(stock.upside);
                  const barWidth = Math.min((stock.upside || 0) / 2, 100);
                  return (
                    <div
                      key={stock.symbol}
                      className={`space-y-2 p-3 rounded-lg border border-white/5 ${colors.bg} transition-colors`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{stock.symbol}</span>
                        <span className={`font-semibold ${colors.text}`}>
                          {stock.upside ? `+${stock.upside.toFixed(1)}%` : "—"}
                        </span>
                      </div>

                      {/* Visual upside bar */}
                      {stock.upside && stock.upside > 0 && (
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors.bar} transition-all`}
                            style={{ width: `${Math.min(barWidth, 100)}%` }}
                          />
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        ${stock.currentPrice.toFixed(2)} → $
                        {stock.targetMean?.toFixed(2) || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stock.nAnalysts || 0} analysts
                      </div>
                    </div>
                  );
                })}
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
                  {exMovers.slice(0, 3).map((mover) => {
                    const isUp = mover.changePct > 0;
                    const absMoverColor = Math.abs(mover.changePct);
                    const bgColor = isUp
                      ? "bg-green-500/20"
                      : "bg-red-500/20";
                    const barColor = isUp
                      ? "bg-green-500"
                      : "bg-red-500";
                    const textColor = isUp
                      ? "text-green-400"
                      : "text-red-400";
                    return (
                      <div
                        key={mover.symbol}
                        className={`space-y-2 p-3 rounded-lg border border-white/5 ${bgColor} transition-colors`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-medium">{mover.symbol}</span>
                          <span className={`font-semibold ${textColor}`}>
                            {mover.changePct > 0 ? "+" : ""}
                            {mover.changePct.toFixed(2)}%
                          </span>
                        </div>

                        {/* Visual change bar */}
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all`}
                            style={{ width: `${Math.min(absMoverColor * 3, 100)}%` }}
                          />
                        </div>

                        <div className="text-xs text-muted-foreground">
                          ${mover.price.toFixed(2)} ({mover.change > 0 ? "+" : ""}
                          {mover.change.toFixed(2)})
                        </div>
                      </div>
                    );
                  })}
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
