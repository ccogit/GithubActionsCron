'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Scale } from 'lucide-react';

interface TradeEntry {
  name: string;
  count: number;
}

interface TradeData {
  symbol: string;
  buy_count: number;
  sell_count: number;
  buy_ratio: number;
  top_buyers: TradeEntry[];
  top_sellers: TradeEntry[];
}

type TabType = 'most-bought' | 'most-sold' | 'strongest';

export function PoliticianTrades() {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('most-bought');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const res = await fetch('/api/politician-trades');
        if (res.ok) {
          const data = await res.json();
          setTrades(data.trades);
        }
      } catch (error) {
        console.error('Failed to fetch politician trades:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, []);

  const getSortedTrades = () => {
    switch (activeTab) {
      case 'most-bought':
        return [...trades].sort((a, b) => b.buy_count - a.buy_count).slice(0, 5);
      case 'most-sold':
        return [...trades].sort((a, b) => b.sell_count - a.sell_count).slice(0, 5);
      case 'strongest':
        return [...trades]
          .filter((t) => t.buy_count + t.sell_count > 0)
          .sort((a, b) => b.buy_ratio - a.buy_ratio)
          .slice(0, 5);
      default:
        return [];
    }
  };

  const topTrades = getSortedTrades();

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setActiveTab('most-bought')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'most-bought'
              ? 'border-b-2 border-green-500 text-green-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="inline mr-2 h-4 w-4" />
          Most Bought
        </button>
        <button
          onClick={() => setActiveTab('most-sold')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'most-sold'
              ? 'border-b-2 border-red-500 text-red-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingDown className="inline mr-2 h-4 w-4" />
          Most Sold
        </button>
        <button
          onClick={() => setActiveTab('strongest')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'strongest'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Scale className="inline mr-2 h-4 w-4" />
          Strongest Consensus
        </button>
      </div>

      {/* Data Grid */}
      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      ) : topTrades.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">No data available</div>
      ) : (
        <div className="space-y-3">
          {topTrades.map((trade) => (
            <div key={trade.symbol} className="border border-white/10 rounded-lg p-4 hover:border-white/20 transition">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{trade.symbol}</h3>
                  <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                    <span>
                      <span className="text-green-400">{trade.buy_count}</span> buys
                    </span>
                    <span>
                      <span className="text-red-400">{trade.sell_count}</span> sells
                    </span>
                    {trade.buy_count + trade.sell_count > 0 && (
                      <span>
                        {((trade.buy_ratio) * 100).toFixed(0)}% buy ratio
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Top traders */}
              {activeTab === 'most-bought' || activeTab === 'strongest' ? (
                <div className="text-xs text-muted-foreground">
                  <div className="font-medium mb-1">Top Buyers:</div>
                  <div className="flex gap-2 flex-wrap">
                    {trade.top_buyers.map((buyer) => (
                      <span key={buyer.name} className="bg-green-500/10 text-green-300 px-2 py-1 rounded">
                        {buyer.name} ({buyer.count})
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  <div className="font-medium mb-1">Top Sellers:</div>
                  <div className="flex gap-2 flex-wrap">
                    {trade.top_sellers.map((seller) => (
                      <span key={seller.name} className="bg-red-500/10 text-red-300 px-2 py-1 rounded">
                        {seller.name} ({seller.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
