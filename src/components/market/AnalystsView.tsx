'use client';

import { TrendingUp } from 'lucide-react';

interface HotStock {
  exchange: string;
  symbol: string;
  name: string;
  currentPrice: number;
  targetMean: number | null;
  upside: number | null;
  nAnalysts: number | null;
}

function getUpsideColor(upside: number | null | undefined) {
  if (!upside) return { bg: 'bg-gray-500/20', text: 'text-gray-400', bar: 'bg-gray-500' };
  if (upside < 0) return { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-500' };
  if (upside < 10) return { bg: 'bg-orange-500/20', text: 'text-orange-400', bar: 'bg-orange-500' };
  if (upside < 25) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', bar: 'bg-yellow-500' };
  if (upside < 40) return { bg: 'bg-lime-500/20', text: 'text-lime-400', bar: 'bg-lime-500' };
  return { bg: 'bg-green-500/20', text: 'text-green-400', bar: 'bg-green-500' };
}

function groupByExchange(items: HotStock[]): Record<string, HotStock[]> {
  const grouped: Record<string, HotStock[]> = {};
  for (const item of items) {
    grouped[item.exchange] ??= [];
    grouped[item.exchange].push(item);
  }
  return grouped;
}

export function AnalystsView({ hotStocks }: { hotStocks: HotStock[] }) {
  const byExchange = groupByExchange(hotStocks);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-green-500" />
        <h3 className="text-sm font-semibold">Hot Stocks (Analyst Upside)</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Dow Jones', 'Nasdaq 100', 'DAX'].map((ex) => (
          <div key={ex} className="rounded-lg border border-white/8 bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground mb-3 uppercase">{ex}</div>
            <div className="space-y-3">
              {(byExchange[ex] || []).map((stock) => {
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
                        {stock.upside ? `+${stock.upside.toFixed(1)}%` : '—'}
                      </span>
                    </div>

                    {stock.upside && stock.upside > 0 && (
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bar} transition-all`}
                          style={{ width: `${Math.min(barWidth, 100)}%` }}
                        />
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      ${stock.currentPrice.toFixed(2)} → ${stock.targetMean?.toFixed(2) || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stock.nAnalysts || 0} analysts
                    </div>
                  </div>
                );
              })}
              {(byExchange[ex] || []).length === 0 && (
                <div className="text-xs text-muted-foreground">No data available</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
