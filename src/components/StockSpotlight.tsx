'use client';

import { useState, useEffect, type ReactNode } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Bell,
  Newspaper,
  Landmark,
  Activity,
} from 'lucide-react';

interface AnalystData {
  symbol: string;
  target_mean: number | null;
  current_price: number | null;
  upside_pct: number | null;
  n_analysts: number | null;
}

interface PoliticianActivity {
  symbol: string;
  buy_count: number;
  sell_count: number;
  news_sentiment: number | null;
  trends_direction: string | null;
  trends_score: number | null;
}

interface StockSpotlightProps {
  symbols: string[];
  alertCounts?: Record<string, number>;
}

type Outlook = { label: string; tone: 'bull' | 'bear' | 'mixed' | 'none' };

function computeOutlook(
  a: AnalystData | undefined,
  p: PoliticianActivity | undefined
): Outlook {
  let score = 0;
  let signals = 0;

  if (a?.upside_pct != null) {
    score += a.upside_pct > 5 ? 1 : a.upside_pct < -5 ? -1 : 0;
    signals++;
  }
  if (p?.news_sentiment != null) {
    score += p.news_sentiment > 0.1 ? 1 : p.news_sentiment < -0.1 ? -1 : 0;
    signals++;
  }
  if (p && p.buy_count + p.sell_count > 0) {
    const ratio = p.buy_count / (p.buy_count + p.sell_count);
    score += ratio > 0.6 ? 1 : ratio < 0.4 ? -1 : 0;
    signals++;
  }
  if (p?.trends_direction === 'rising') {
    score += 1;
    signals++;
  } else if (p?.trends_direction === 'falling') {
    score -= 1;
    signals++;
  }

  if (signals === 0) return { label: 'No signals', tone: 'none' };
  const norm = score / signals;
  if (norm > 0.3) return { label: 'Bullish', tone: 'bull' };
  if (norm < -0.3) return { label: 'Bearish', tone: 'bear' };
  return { label: 'Mixed', tone: 'mixed' };
}

const outlookStyles = {
  bull: 'bg-green-500/15 text-green-300 border-green-500/30',
  bear: 'bg-red-500/15 text-red-300 border-red-500/30',
  mixed: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  none: 'bg-white/5 text-muted-foreground border-white/10',
};

function Pill({
  icon,
  children,
  tone,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  tone: 'green' | 'red' | 'yellow' | 'blue' | 'orange' | 'gray';
  title?: string;
}) {
  const tones = {
    green: 'bg-green-500/10 text-green-300',
    red: 'bg-red-500/10 text-red-300',
    yellow: 'bg-yellow-500/10 text-yellow-300',
    blue: 'bg-blue-500/10 text-blue-300',
    orange: 'bg-orange-500/15 text-orange-300',
    gray: 'bg-white/5 text-muted-foreground',
  };
  return (
    <div
      title={title}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium ${tones[tone]}`}
    >
      <span className="opacity-80">{icon}</span>
      {children}
    </div>
  );
}

export function StockSpotlight({ symbols, alertCounts = {} }: StockSpotlightProps) {
  const [data, setData] = useState<{
    analysts: Record<string, AnalystData>;
    politicians: Record<string, PoliticianActivity>;
  }>({ analysts: {}, politicians: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [analystRes, politicianRes] = await Promise.all([
          fetch(`/api/analyst-data?symbols=${symbols.join(',')}`),
          fetch(`/api/politician-activity?symbols=${symbols.join(',')}`),
        ]);

        const analysts = await analystRes.json();
        const politicians = await politicianRes.json();

        const analystMap: Record<string, AnalystData> = {};
        for (const a of analysts.data || []) analystMap[a.symbol] = a;

        const politicianMap: Record<string, PoliticianActivity> = {};
        for (const p of politicians.data || []) politicianMap[p.symbol] = p;

        setData({ analysts: analystMap, politicians: politicianMap });
      } catch (error) {
        console.error('Failed to fetch spotlight data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (symbols.length > 0) fetchData();
    else setLoading(false);
  }, [symbols]);

  if (symbols.length === 0) return null;

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {symbols.slice(0, 3).map((s) => (
          <div
            key={s}
            className="border border-white/8 rounded-lg p-4 bg-card animate-pulse h-32"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {symbols.map((symbol) => {
        const analyst = data.analysts[symbol];
        const politician = data.politicians[symbol];
        const alertCount = alertCounts[symbol] || 0;
        const outlook = computeOutlook(analyst, politician);

        const upside = analyst?.upside_pct;
        const upsideTone =
          upside == null
            ? 'text-muted-foreground'
            : upside >= 15
            ? 'text-green-400'
            : upside >= 0
            ? 'text-lime-400'
            : 'text-red-400';

        const sentiment = politician?.news_sentiment;
        const congressTotal =
          (politician?.buy_count ?? 0) + (politician?.sell_count ?? 0);
        const congressTone =
          congressTotal === 0
            ? 'gray'
            : (politician!.buy_count ?? 0) > (politician!.sell_count ?? 0)
            ? 'green'
            : (politician!.sell_count ?? 0) > (politician!.buy_count ?? 0)
            ? 'red'
            : 'yellow';

        const trendsDir = politician?.trends_direction;

        return (
          <div
            key={symbol}
            className="border border-white/10 rounded-lg p-4 bg-card hover:border-white/20 transition-colors"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-base tracking-tight">{symbol}</h4>
              <div
                className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${outlookStyles[outlook.tone]}`}
              >
                {outlook.label}
              </div>
            </div>

            {/* Headline metric: upside */}
            <div className="mb-4">
              {upside != null ? (
                <>
                  <div className={`text-3xl font-bold leading-none ${upsideTone}`}>
                    {upside > 0 ? '+' : ''}
                    {upside.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1.5">
                    {analyst?.current_price != null && analyst?.target_mean != null
                      ? `$${analyst.current_price.toFixed(2)} → $${analyst.target_mean.toFixed(2)}`
                      : 'Analyst target'}
                    {analyst?.n_analysts ? ` · ${analyst.n_analysts} analysts` : ''}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground italic py-2">
                  No analyst coverage
                </div>
              )}
            </div>

            {/* Signal pills */}
            <div className="flex flex-wrap gap-1.5">
              {sentiment != null && (
                <Pill
                  icon={<Newspaper className="w-3 h-3" />}
                  tone={sentiment > 0.1 ? 'green' : sentiment < -0.1 ? 'red' : 'yellow'}
                  title="News sentiment (VADER)"
                >
                  {(sentiment * 100).toFixed(0)}%
                </Pill>
              )}

              {congressTotal > 0 && (
                <Pill
                  icon={<Landmark className="w-3 h-3" />}
                  tone={congressTone as 'green' | 'red' | 'yellow'}
                  title="Congressional trades"
                >
                  <span className="text-green-300/90">{politician!.buy_count}</span>
                  <span className="opacity-50 mx-0.5">/</span>
                  <span className="text-red-300/90">{politician!.sell_count}</span>
                </Pill>
              )}

              {trendsDir && (
                <Pill
                  icon={
                    trendsDir === 'rising' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : trendsDir === 'falling' ? (
                      <TrendingDown className="w-3 h-3" />
                    ) : (
                      <Minus className="w-3 h-3" />
                    )
                  }
                  tone={trendsDir === 'rising' ? 'green' : trendsDir === 'falling' ? 'red' : 'blue'}
                  title="Google Trends search interest"
                >
                  {trendsDir}
                </Pill>
              )}

              {alertCount > 0 && (
                <Pill
                  icon={<Bell className="w-3 h-3" />}
                  tone="orange"
                  title="Active alerts"
                >
                  {alertCount}
                </Pill>
              )}

              {sentiment == null && congressTotal === 0 && !trendsDir && alertCount === 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                  <Activity className="w-3 h-3" />
                  Awaiting signal data
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
