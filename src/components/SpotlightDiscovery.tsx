'use client';

import {useCallback, useEffect, useState} from 'react';
import {Check, ShoppingCart, TrendingDown, TrendingUp, X,} from 'lucide-react';
import {placeOrderAction} from '@/app/alpaca-actions';
import {Input} from '@/components/ui/input';
import type {AttractivenessResult, SignalContribution} from '@/lib/attractiveness';

interface DiscoveryStock {
  symbol: string;
  exchange: string | null;
  name: string | null;
  current_price: number | null;
  upside_pct: number | null;
  score: number;
  signalCount: number;
  outlook: 'bullish' | 'bearish' | 'mixed';
  scoreDetails: AttractivenessResult;
}

const outlookStyles = {
  bullish: 'bg-green-500/15 text-green-300 border-green-500/30',
  bearish: 'bg-red-500/15 text-red-300 border-red-500/30',
  mixed:   'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
};

const MAX_VISIBLE_SIGNALS = 8;

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

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

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
        const isBull    = stock.outlook === 'bullish';
        const isBuying  = buyingSymbol === stock.symbol;
        const TrendIcon = isBull ? TrendingUp : TrendingDown;
        const scoreColor = stock.score > 0 ? 'text-green-400' : stock.score < 0 ? 'text-red-400' : 'text-muted-foreground';

        // Derive firing signals from scoreDetails — single source of truth
        const allSignals   = stock.scoreDetails?.signals ?? [];
        const bullishSigs  = allSignals.filter(s => s.contribution > 0).sort((a, b) => b.contribution - a.contribution);
        const bearishSigs  = allSignals.filter(s => s.contribution < 0).sort((a, b) => a.contribution - b.contribution);
        // For bullish stocks show bullish first; for bearish stocks show bearish first
        const ordered      = isBull ? [...bullishSigs, ...bearishSigs] : [...bearishSigs, ...bullishSigs];
        const visible      = ordered.slice(0, MAX_VISIBLE_SIGNALS);
        const overflow     = ordered.length - visible.length;

        return (
          <div
            key={stock.symbol}
            className="border border-white/10 rounded-lg p-4 bg-card hover:border-white/20 transition-colors flex flex-col gap-3"
          >
            {/* Header */}
            <div className="flex justify-between items-start gap-2">
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
                  <div className="text-xs text-muted-foreground/70 truncate" title={stock.name}>
                    {stock.name}
                  </div>
                )}
              </div>
              <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${outlookStyles[stock.outlook]}`}>
                <TrendIcon className="w-3 h-3" />
                {stock.outlook}
              </div>
            </div>

            {/* Score */}
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold leading-none ${scoreColor}`}>
                {stock.score > 0 ? '+' : ''}{stock.score}
              </span>
              <span className="text-[11px] text-muted-foreground">
                score · {stock.signalCount} signal{stock.signalCount !== 1 ? 's' : ''} firing
              </span>
            </div>

            {/* Signal breakdown — driven from scoreDetails.signals, always complete */}
            <div className="flex-1 space-y-px">
              {visible.map((sig) => (
                <SignalRow key={sig.name} sig={sig} />
              ))}
              {overflow > 0 && (
                <p className="text-[10px] text-muted-foreground/50 pt-0.5 pl-4">
                  +{overflow} more signal{overflow !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Buy action */}
            <div className="pt-2 border-t border-white/10">
              {isBuying ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={buyQty}
                    onChange={(e) => setBuyQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')  confirmBuy(stock.symbol);
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
                  onClick={() => { setBuyingSymbol(stock.symbol); setBuyQty('1'); }}
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

function SignalRow({ sig }: { sig: SignalContribution }) {
  const bull = sig.contribution > 0;
  const strong = Math.abs(sig.contribution) >= 2;

  const dotCls  = bull ? 'bg-green-400'   : 'bg-red-400';
  const nameCls = bull ? 'text-foreground/80' : 'text-foreground/80';
  const valCls  = 'text-muted-foreground/70';
  const badgeCls = bull
    ? strong ? 'bg-green-500/20 text-green-300'   : 'bg-green-500/10 text-green-400/80'
    : strong ? 'bg-red-500/20   text-red-300'     : 'bg-red-500/10   text-red-400/80';

  return (
    <div className="flex items-center gap-2 py-[3px]" title={sig.description}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
      <span className={`text-[11px] flex-1 truncate ${nameCls}`}>{sig.name}</span>
      <span className={`text-[11px] font-mono shrink-0 ${valCls}`}>{sig.value}</span>
      <span className={`text-[10px] font-mono font-bold px-1 py-px rounded shrink-0 ${badgeCls}`}>
        {sig.contribution > 0 ? '+' : ''}{sig.contribution}
      </span>
    </div>
  );
}
