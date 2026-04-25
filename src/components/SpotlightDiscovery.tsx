'use client';

import { useState, useEffect, type ReactNode } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Newspaper,
  Landmark,
  Activity,
} from 'lucide-react';

interface DiscoveryStock {
  symbol: string;
  exchange: string | null;
  name: string | null;
  upside_pct: number | null;
  current_price: number | null;
  target_mean: number | null;
  n_analysts: number | null;
  changePct: number | null;
  buy_count: number;
  sell_count: number;
  news_sentiment: number | null;
  trends_direction: string | null;
  score: number;
  signalCount: number;
  outlook: 'bullish' | 'bearish' | 'mixed';
  reasons: string[];
}

const outlookStyles = {
  bullish: 'bg-green-500/15 text-green-300 border-green-500/30',
  bearish: 'bg-red-500/15 text-red-300 border-red-500/30',
  mixed: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
};

function MiniPill({
  icon,
  children,
  tone,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  tone: 'green' | 'red' | 'yellow' | 'blue' | 'gray';
  title?: string;
}) {
  const tones = {
    green: 'bg-green-500/10 text-green-300',
    red: 'bg-red-500/10 text-red-300',
    yellow: 'bg-yellow-500/10 text-yellow-300',
    blue: 'bg-blue-500/10 text-blue-300',
    gray: 'bg-white/5 text-muted-foreground',
  };
  return (
    <div
      title={title}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${tones[tone]}`}
    >
      <span className="opacity-80">{icon}</span>
      {children}
    </div>
  );
}

export function SpotlightDiscovery() {
  const [stocks, setStocks] = useState<DiscoveryStock[] | null>(null);

  useEffect(() => {
    fetch('/api/spotlight-discovery')
      .then((r) => r.json())
      .then((d) => setStocks(d.stocks ?? []))
      .catch((e) => {
        console.error('Failed to fetch discovery:', e);
        setStocks([]);
      });
  }, []);

  if (!stocks) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border border-white/8 rounded-lg p-4 bg-card animate-pulse h-36" />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-white/10 rounded-lg p-6 text-center">
        Not enough cross-signal data yet. Check back after the next data refresh.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {stocks.map((stock) => {
        const isBull = stock.outlook === 'bullish';
        const accentColor = isBull ? 'text-green-400' : 'text-red-400';
        const TrendIcon = isBull ? TrendingUp : TrendingDown;

        return (
          <div
            key={stock.symbol}
            className="border border-white/10 rounded-lg p-4 bg-card hover:border-white/20 transition-colors"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
              <div>
                <h4 className="font-semibold text-base tracking-tight">{stock.symbol}</h4>
                {stock.exchange && (
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {stock.exchange}
                  </div>
                )}
              </div>
              <div
                className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${outlookStyles[stock.outlook]}`}
              >
                <TrendIcon className="w-3 h-3" />
                {stock.outlook}
              </div>
            </div>

            {/* Signal score */}
            <div className="mb-3 flex items-baseline gap-2">
              <div className={`text-2xl font-bold leading-none ${accentColor}`}>
                {stock.score > 0 ? '+' : ''}
                {stock.score}
              </div>
              <div className="text-[11px] text-muted-foreground">
                signal score · {stock.signalCount} firing
              </div>
            </div>

            {/* Reasons */}
            {stock.reasons.length > 0 && (
              <div className="mb-3 text-xs text-foreground/80 leading-relaxed">
                {stock.reasons.join(' · ')}
              </div>
            )}

            {/* Signal pills */}
            <div className="flex flex-wrap gap-1">
              {stock.upside_pct != null && (
                <MiniPill
                  icon={<Sparkles className="w-2.5 h-2.5" />}
                  tone={stock.upside_pct > 5 ? 'green' : stock.upside_pct < -3 ? 'red' : 'gray'}
                  title="Analyst upside"
                >
                  {stock.upside_pct > 0 ? '+' : ''}
                  {stock.upside_pct.toFixed(0)}%
                </MiniPill>
              )}

              {stock.buy_count + stock.sell_count > 0 && (
                <MiniPill
                  icon={<Landmark className="w-2.5 h-2.5" />}
                  tone={stock.buy_count > stock.sell_count ? 'green' : 'red'}
                  title="Congressional trades"
                >
                  {stock.buy_count}/{stock.sell_count}
                </MiniPill>
              )}

              {stock.news_sentiment != null && (
                <MiniPill
                  icon={<Newspaper className="w-2.5 h-2.5" />}
                  tone={
                    stock.news_sentiment > 0.1
                      ? 'green'
                      : stock.news_sentiment < -0.1
                      ? 'red'
                      : 'yellow'
                  }
                  title="News sentiment"
                >
                  {(stock.news_sentiment * 100).toFixed(0)}%
                </MiniPill>
              )}

              {stock.changePct != null && Math.abs(stock.changePct) > 1 && (
                <MiniPill
                  icon={<Activity className="w-2.5 h-2.5" />}
                  tone={stock.changePct > 0 ? 'green' : 'red'}
                  title="Today's change"
                >
                  {stock.changePct > 0 ? '+' : ''}
                  {stock.changePct.toFixed(1)}%
                </MiniPill>
              )}

              {stock.trends_direction && stock.trends_direction !== 'stable' && (
                <MiniPill
                  icon={
                    stock.trends_direction === 'rising' ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )
                  }
                  tone={stock.trends_direction === 'rising' ? 'green' : 'red'}
                  title="Search interest trend"
                >
                  {stock.trends_direction}
                </MiniPill>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
