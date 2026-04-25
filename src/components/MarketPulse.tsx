'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, Scale } from 'lucide-react';
import { MarketAggregates } from '@/components/MarketAggregates';
import { PoliticianTrades } from '@/components/PoliticianTrades';

type TabType = 'aggregates' | 'congress';

export function MarketPulse() {
  const [activeTab, setActiveTab] = useState<TabType>('aggregates');

  const tabs = [
    {
      id: 'aggregates' as const,
      label: 'Market Overview',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: 'congress' as const,
      label: 'Capitol Trends',
      icon: <Scale className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pt-4">
        {activeTab === 'aggregates' && <MarketAggregates />}
        {activeTab === 'congress' && <PoliticianTrades />}
      </div>
    </div>
  );
}
