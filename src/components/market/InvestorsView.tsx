'use client';

import { Activity, Calendar } from 'lucide-react';

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

function groupByExchange(items: Mover[]): Record<string, Mover[]> {
  const grouped: Record<string, Mover[]> = {};
  for (const item of items) {
    grouped[item.exchange] ??= [];
    grouped[item.exchange].push(item);
  }
  return grouped;
}

export function InvestorsView({
  topMovers,
  earnings,
}: {
  topMovers: Mover[];
  earnings: Earning[];
}) {
  const moversByEx = groupByExchange(topMovers);

  return (
    <div className="space-y-6">
      {/* Top Movers */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold">Top Movers (Today)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Dow Jones', 'Nasdaq 100', 'DAX'].map((ex) => {
            const exMovers = (moversByEx[ex] || []).sort(
              (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)
            );
            return (
              <div key={ex} className="rounded-lg border border-white/8 bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground mb-3 uppercase">{ex}</div>
                <div className="space-y-3">
                  {exMovers.slice(0, 3).map((mover) => {
                    const isUp = mover.changePct > 0;
                    const absMoverColor = Math.abs(mover.changePct);
                    const bgColor = isUp ? 'bg-green-500/20' : 'bg-red-500/20';
                    const barColor = isUp ? 'bg-green-500' : 'bg-red-500';
                    const textColor = isUp ? 'text-green-400' : 'text-red-400';
                    return (
                      <div
                        key={mover.symbol}
                        className={`space-y-2 p-3 rounded-lg border border-white/5 ${bgColor} transition-colors`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-medium">{mover.symbol}</span>
                          <span className={`font-semibold ${textColor}`}>
                            {mover.changePct > 0 ? '+' : ''}
                            {mover.changePct.toFixed(2)}%
                          </span>
                        </div>

                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all`}
                            style={{ width: `${Math.min(absMoverColor * 3, 100)}%` }}
                          />
                        </div>

                        <div className="text-xs text-muted-foreground">
                          ${mover.price.toFixed(2)} ({mover.change > 0 ? '+' : ''}
                          {mover.change.toFixed(2)})
                        </div>
                      </div>
                    );
                  })}
                  {exMovers.length === 0 && (
                    <div className="text-xs text-muted-foreground">No data available</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Earnings */}
      {earnings.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold">Earnings This Week</h3>
          </div>
          <div className="rounded-lg border border-white/8 bg-card p-4">
            <div className="space-y-3">
              {earnings.map((earning) => (
                <div
                  key={earning.symbol}
                  className="flex justify-between items-center text-sm"
                >
                  <div>
                    <span className="font-medium">{earning.symbol}</span>
                    <span className="text-muted-foreground text-xs ml-2">{earning.name}</span>
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
