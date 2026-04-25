'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

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

export function StockSpotlight({ symbols, alertCounts = {} }: StockSpotlightProps) {
  const [data, setData] = useState<{
    analysts: Record<string, AnalystData>;
    politicians: Record<string, PoliticianActivity>;
  }>({
    analysts: {},
    politicians: {},
  });
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
        for (const a of analysts.data || []) {
          analystMap[a.symbol] = a;
        }

        const politicianMap: Record<string, PoliticianActivity> = {};
        for (const p of politicians.data || []) {
          politicianMap[p.symbol] = p;
        }

        setData({ analysts: analystMap, politicians: politicianMap });
      } catch (error) {
        console.error('Failed to fetch spotlight data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (symbols.length > 0) {
      fetchData();
    }
  }, [symbols]);

  if (loading || symbols.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {symbols.map((symbol) => {
        const analyst = data.analysts[symbol];
        const politician = data.politicians[symbol];
        const alertCount = alertCounts[symbol] || 0;

        return (
          <div
            key={symbol}
            className="border border-white/10 rounded-lg p-4 bg-white/5 hover:bg-white/8 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h4 className="font-semibold text-base">{symbol}</h4>
              </div>
              {alertCount > 0 && (
                <div className="flex items-center gap-1 bg-orange-500/20 text-orange-300 px-2 py-1 rounded text-xs">
                  <AlertCircle className="w-3 h-3" />
                  {alertCount}
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {/* Analyst Upside */}
              {analyst && analyst.upside_pct !== null ? (
                <div className="flex justify-between items-center p-2 rounded bg-white/5">
                  <span className="text-muted-foreground">Analyst Target:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">
                      ${analyst.current_price?.toFixed(2)} → ${analyst.target_mean?.toFixed(2)}
                    </span>
                    <span
                      className={`font-semibold ${
                        analyst.upside_pct > 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {analyst.upside_pct > 0 ? '+' : ''}
                      {analyst.upside_pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ) : null}

              {/* News Sentiment */}
              {politician && politician.news_sentiment !== null && (
                <div className="flex justify-between items-center p-2 rounded bg-white/5">
                  <span className="text-muted-foreground">News Sentiment:</span>
                  <span
                    className={`font-medium px-2 py-1 rounded ${
                      politician.news_sentiment > 0.1
                        ? 'bg-green-500/20 text-green-300'
                        : politician.news_sentiment < -0.1
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }`}
                  >
                    {(politician.news_sentiment * 100).toFixed(0)}%
                  </span>
                </div>
              )}

              {/* Politician Activity */}
              {politician && (politician.buy_count > 0 || politician.sell_count > 0) && (
                <div className="flex justify-between items-center p-2 rounded bg-white/5">
                  <span className="text-muted-foreground">Congress Activity:</span>
                  <div className="flex gap-3">
                    {politician.buy_count > 0 && (
                      <span className="text-green-400 font-medium">
                        {politician.buy_count} buy{politician.buy_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {politician.sell_count > 0 && (
                      <span className="text-red-400 font-medium">
                        {politician.sell_count} sell{politician.sell_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Trends Direction */}
              {politician && politician.trends_direction && (
                <div className="flex justify-between items-center p-2 rounded bg-white/5">
                  <span className="text-muted-foreground">Trends:</span>
                  <div className="flex items-center gap-2">
                    {politician.trends_direction === 'rising' && (
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    )}
                    {politician.trends_direction === 'falling' && (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                    {politician.trends_direction === 'stable' && (
                      <Minus className="w-4 h-4 text-blue-400" />
                    )}
                    <span className="font-medium capitalize">{politician.trends_direction}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
