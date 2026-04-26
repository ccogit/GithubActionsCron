'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Newspaper,
  Landmark,
  Activity,
  ShoppingCart,
  Check,
  X,
} from 'lucide-react';
import { placeOrderAction } from '@/app/alpaca-actions';
import { Input } from '@/components/ui/input';

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
  const [refreshing, setRefreshing] = useState(false);
  const [buyingSymbol, setBuyingSymbol] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  const fetchStocks = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const r = await fetch('/api/spotlight-discovery');
      const d = await r.json();
      setStocks(d.stocks ?? []);
    } catch (e) {
      console.error('Failed to fetch discovery:', e);
      if (!showRefreshing) setStocks([]);
    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  // Re-fetch when workflows complete
  useEffect(() => {
    const handler = () => fetchStocks(true);
    window.addEventListener('signals-refreshed', handler);
    return () => window.removeEventListener('signals-refreshed', handler);
  }, [fetchStocks]);

  async function confirmBuy(symbol: string) {
    const qty = parseInt(buyQty, 10);
    if (!qty || qty < 1) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('symbol', symbol);
      fd.set('qty', String(qty));
      fd.set('side', 'buy');
      fd.set('type', 'market');
      await placeOrderAction(fd);
      setBuyingSymbol(null);
      setBuyQty('1');
    } finally {
      setSubmitting(false);
    }
  }

  function startBuy(symbol: string) {
    setBuyingSymbol(symbol);
    setBuyQty('1');
  }

  if (!stocks) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border border-white/8 rounded-lg p-4 bg-card animate-pulse h-44" />
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
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 transition-opacity duration-300 ${refreshing ? 'opacity-50 pointer-events-none' : ''}`}>
      {stocks.map((stock) => {
        const isBull = stock.outlook === 'bullish';
        const accentColor = isBull ? 'text-green-400' : 'text-red-400';
        const TrendIcon = isBull ? TrendingUp : TrendingDown;
        const isBuying = buyingSymbol === stock.symbol;

        return (
          <div
            key={stock.symbol}
            className="border border-white/10 rounded-lg p-4 bg-card hover:border-white/20 transition-colors flex flex-col"
          >
            {/* Header */}
            <div className="flex justify-between items-start gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <h4 className="font-semibold text-base tracking-tight">{stock.symbol}</h4>
                  {stock.exchange && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {stock.exchange}
                    </span>
                  )}
                </div>
                {stock.name && (
                  <div className="text-xs text-muted-foreground/80 truncate" title={stock.name}>
                    {stock.name}
                  </div>
                )}
              </div>
              <div
                className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${outlookStyles[stock.outlook]}`}
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
            <div className="flex flex-wrap gap-1 mb-3 flex-1">
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
                  title="Congressional trades (buys / sells)"
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

            {/* Buy action */}
            <div className="pt-3 border-t border-white/10">
              {isBuying ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={buyQty}
                    onChange={(e) => setBuyQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmBuy(stock.symbol);
                      if (e.key === 'Escape') setBuyingSymbol(null);
                    }}
                    placeholder="Qty"
                    className="h-8 text-xs font-mono bg-white/5 border-blue-500/30 focus:border-blue-400/60 focus:ring-blue-500/20"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => confirmBuy(stock.symbol)}
                    className="h-8 px-2.5 rounded-md flex items-center gap-1 text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {submitting ? '...' : 'Buy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuyingSymbol(null)}
                    className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startBuy(stock.symbol)}
                  className="w-full h-8 rounded-md flex items-center justify-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-colors"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Buy {stock.symbol}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
