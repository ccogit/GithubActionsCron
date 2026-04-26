// Composite "attractiveness" score for a stock, derived from multiple signals.
// Each signal contributes ±1 (or ±2 for strong analyst conviction). Higher is better.
//
// Possible range with all 12 signals:
//   max  +12  (upside+2, macro+1, all others+1)
//   min  −11  (downside−2, macro−1, all others−1)
//
// Macro context (fed rates, unemployment) can dampen or amplify scores by ±1
// if economic conditions are restrictive (rates ≥5%, unemployment ≥5%) or
// accommodative (rates ≤2%, unemployment ≤3.5%).
//
// Outlook thresholds set to ±3 so a stock needs conviction across multiple
// signals before being labelled bullish or bearish.

export interface AttractivenessSignals {
  // --- price-target upside (yfinance, hourly) ---
  upside_pct?: number | null;

  // --- congressional trading (AInvest, daily) ---
  buy_count?: number | null;
  sell_count?: number | null;

  // --- news sentiment & search interest (GDELT/VADER + Google Trends, daily) ---
  news_sentiment?: number | null;
  trends_direction?: string | null;

  // --- intraday price change (Finnhub ticks) ---
  changePct?: number | null;

  // --- analyst buy/hold/sell consensus (Finnhub, weekly) ---
  // (strongBuy×2 + buy − sell − strongSell×2) / total; range −2..+2
  consensus_score?: number | null;

  // --- Finnhub composite technical signal (daily) ---
  tech_signal?: string | null;       // 'buy' | 'neutral' | 'sell'

  // --- short interest as % of float (FINRA/yfinance, weekly) ---
  short_pct_float?: number | null;   // e.g. 0.15 = 15 %

  // --- corporate insider open-market transactions (SEC Form 4/yfinance, daily) ---
  insider_signal?: string | null;    // 'buying' | 'selling' | 'neutral'

  // --- earnings beat rate over last 4 quarters (yfinance, weekly) ---
  eps_beat_rate?: number | null;     // 0.0–1.0

  // --- social sentiment (Tradestie WSB + ApeWisdom Reddit, hourly) ---
  wsb_sentiment?: string | null;     // 'Bullish' | 'Bearish'

  // --- macro context (FRED economic indicators, daily) ---
  fed_rate?: number | null;          // Federal Funds Rate %
  unemployment?: number | null;      // Unemployment Rate %
}

export interface SignalContribution {
  name: string;
  value: string | number;
  contribution: number; // -2, -1, 0, 1, or 2
  description: string;
}

export interface AttractivenessResult {
  score: number;
  signalCount: number;
  outlook: "bullish" | "bearish" | "mixed";
  reasons: string[];
  signals: SignalContribution[]; // Detailed breakdown of all signals
}

export function computeAttractiveness(s: AttractivenessSignals): AttractivenessResult {
  let score = 0;
  let count = 0;
  const reasons: string[] = [];
  const signals: SignalContribution[] = [];

  // 1. Analyst price-target upside
  if (s.upside_pct != null) {
    if (s.upside_pct > 15) {
      score += 2; count++;
      reasons.push(`+${s.upside_pct.toFixed(0)}% analyst upside`);
      signals.push({
        name: "Analyst Upside",
        value: `+${s.upside_pct.toFixed(1)}%`,
        contribution: 2,
        description: "Strong analyst price target upside (>15%)",
      });
    } else if (s.upside_pct > 5) {
      score += 1; count++;
      signals.push({
        name: "Analyst Upside",
        value: `+${s.upside_pct.toFixed(1)}%`,
        contribution: 1,
        description: "Moderate analyst price target upside (5-15%)",
      });
    } else if (s.upside_pct < -10) {
      score -= 2; count++;
      reasons.push(`${s.upside_pct.toFixed(0)}% analyst downside`);
      signals.push({
        name: "Analyst Downside",
        value: `${s.upside_pct.toFixed(1)}%`,
        contribution: -2,
        description: "Strong analyst downside risk (<-10%)",
      });
    } else if (s.upside_pct < -3) {
      score -= 1; count++;
      signals.push({
        name: "Analyst Downside",
        value: `${s.upside_pct.toFixed(1)}%`,
        contribution: -1,
        description: "Moderate analyst downside risk (-3 to -10%)",
      });
    } else {
      signals.push({
        name: "Analyst Upside",
        value: `${s.upside_pct.toFixed(1)}%`,
        contribution: 0,
        description: "Neutral analyst outlook (-3% to +5%)",
      });
    }
  } else {
    signals.push({
      name: "Analyst Upside",
      value: "N/A",
      contribution: 0,
      description: "No analyst data available",
    });
  }

  // 2. Congressional trading
  const buys = s.buy_count ?? 0;
  const sells = s.sell_count ?? 0;
  const trades = buys + sells;
  if (trades >= 3) {
    const ratio = buys / trades;
    if (ratio > 0.7) {
      score += 1; count++;
      reasons.push(`${buys} politicians buying`);
      signals.push({
        name: "Congressional Trading",
        value: `${buys} buys, ${sells} sells`,
        contribution: 1,
        description: `Strong buying signal: ${(ratio * 100).toFixed(0)}% buy ratio`,
      });
    } else if (ratio < 0.3) {
      score -= 1; count++;
      reasons.push(`${sells} politicians selling`);
      signals.push({
        name: "Congressional Trading",
        value: `${buys} buys, ${sells} sells`,
        contribution: -1,
        description: `Strong selling signal: ${(ratio * 100).toFixed(0)}% buy ratio`,
      });
    } else {
      signals.push({
        name: "Congressional Trading",
        value: `${buys} buys, ${sells} sells`,
        contribution: 0,
        description: `Neutral: ${(ratio * 100).toFixed(0)}% buy ratio (30-70% range)`,
      });
    }
  } else {
    signals.push({
      name: "Congressional Trading",
      value: `${trades} trades`,
      contribution: 0,
      description: "Insufficient data (<3 trades)",
    });
  }

  // 3. News sentiment
  if (s.news_sentiment != null) {
    if (s.news_sentiment > 0.2) {
      score += 1; count++;
      reasons.push("positive news");
      signals.push({
        name: "News Sentiment",
        value: `+${s.news_sentiment.toFixed(2)}`,
        contribution: 1,
        description: "Positive sentiment in recent news",
      });
    } else if (s.news_sentiment < -0.2) {
      score -= 1; count++;
      reasons.push("negative news");
      signals.push({
        name: "News Sentiment",
        value: `${s.news_sentiment.toFixed(2)}`,
        contribution: -1,
        description: "Negative sentiment in recent news",
      });
    } else {
      signals.push({
        name: "News Sentiment",
        value: `${s.news_sentiment.toFixed(2)}`,
        contribution: 0,
        description: "Neutral sentiment in recent news",
      });
    }
  } else {
    signals.push({
      name: "News Sentiment",
      value: "N/A",
      contribution: 0,
      description: "No sentiment data available",
    });
  }

  // 4. Google Trends direction
  if (s.trends_direction === "rising") {
    score += 1; count++;
    reasons.push("rising interest");
    signals.push({
      name: "Search Trends",
      value: "Rising",
      contribution: 1,
      description: "Rising search interest indicates growing attention",
    });
  } else if (s.trends_direction === "falling") {
    score -= 1; count++;
    signals.push({
      name: "Search Trends",
      value: "Falling",
      contribution: -1,
      description: "Falling search interest indicates waning attention",
    });
  } else {
    signals.push({
      name: "Search Trends",
      value: s.trends_direction || "Unknown",
      contribution: 0,
      description: "No significant trend direction",
    });
  }

  // 5. Intraday price change
  if (s.changePct != null) {
    if (s.changePct > 5) {
      score += 1; count++;
      reasons.push(`+${s.changePct.toFixed(1)}% today`);
      signals.push({
        name: "Daily Price Change",
        value: `+${s.changePct.toFixed(2)}%`,
        contribution: 1,
        description: "Strong daily gain (>5%)",
      });
    } else if (s.changePct < -5) {
      score -= 1; count++;
      reasons.push(`${s.changePct.toFixed(1)}% today`);
      signals.push({
        name: "Daily Price Change",
        value: `${s.changePct.toFixed(2)}%`,
        contribution: -1,
        description: "Strong daily decline (<-5%)",
      });
    } else {
      signals.push({
        name: "Daily Price Change",
        value: `${s.changePct.toFixed(2)}%`,
        contribution: 0,
        description: "Modest daily movement (-5% to +5%)",
      });
    }
  } else {
    signals.push({
      name: "Daily Price Change",
      value: "N/A",
      contribution: 0,
      description: "No price data available",
    });
  }

  // 6. Analyst buy/hold/sell consensus
  if (s.consensus_score != null) {
    if (s.consensus_score > 0.5) {
      score += 1; count++;
      reasons.push("analyst buy consensus");
      signals.push({
        name: "Analyst Consensus",
        value: `+${s.consensus_score.toFixed(2)}`,
        contribution: 1,
        description: "Analyst consensus is bullish (>0.5)",
      });
    } else if (s.consensus_score < -0.5) {
      score -= 1; count++;
      reasons.push("analyst sell consensus");
      signals.push({
        name: "Analyst Consensus",
        value: `${s.consensus_score.toFixed(2)}`,
        contribution: -1,
        description: "Analyst consensus is bearish (<-0.5)",
      });
    } else {
      signals.push({
        name: "Analyst Consensus",
        value: `${s.consensus_score.toFixed(2)}`,
        contribution: 0,
        description: "Analyst consensus is neutral (-0.5 to 0.5)",
      });
    }
  } else {
    signals.push({
      name: "Analyst Consensus",
      value: "N/A",
      contribution: 0,
      description: "No analyst consensus data available",
    });
  }

  // 7. Technical aggregate signal
  if (s.tech_signal === "buy") {
    score += 1; count++;
    reasons.push("technicals bullish");
    signals.push({
      name: "Technical Signal",
      value: "Buy",
      contribution: 1,
      description: "Technical indicators are bullish",
    });
  } else if (s.tech_signal === "sell") {
    score -= 1; count++;
    reasons.push("technicals bearish");
    signals.push({
      name: "Technical Signal",
      value: "Sell",
      contribution: -1,
      description: "Technical indicators are bearish",
    });
  } else {
    signals.push({
      name: "Technical Signal",
      value: s.tech_signal || "Neutral",
      contribution: 0,
      description: "Technical indicators are neutral or unavailable",
    });
  }

  // 8. Short interest (professional short conviction)
  if (s.short_pct_float != null) {
    if (s.short_pct_float > 0.15) {
      score -= 1; count++;
      reasons.push(`${(s.short_pct_float * 100).toFixed(0)}% short interest`);
      signals.push({
        name: "Short Interest",
        value: `${(s.short_pct_float * 100).toFixed(1)}%`,
        contribution: -1,
        description: "Elevated short interest (>15% of float)",
      });
    } else {
      signals.push({
        name: "Short Interest",
        value: `${(s.short_pct_float * 100).toFixed(1)}%`,
        contribution: 0,
        description: "Moderate short interest (≤15% of float)",
      });
    }
  } else {
    signals.push({
      name: "Short Interest",
      value: "N/A",
      contribution: 0,
      description: "No short interest data available",
    });
  }

  // 9. Corporate insider open-market transactions
  if (s.insider_signal === "buying") {
    score += 1; count++;
    reasons.push("insiders buying");
    signals.push({
      name: "Insider Trading",
      value: "Buying",
      contribution: 1,
      description: "Corporate insiders are buying stock",
    });
  } else if (s.insider_signal === "selling") {
    score -= 1; count++;
    reasons.push("insiders selling");
    signals.push({
      name: "Insider Trading",
      value: "Selling",
      contribution: -1,
      description: "Corporate insiders are selling stock",
    });
  } else {
    signals.push({
      name: "Insider Trading",
      value: s.insider_signal || "Neutral",
      contribution: 0,
      description: "Insider trading activity is neutral or unavailable",
    });
  }

  // 10. Earnings beat rate
  if (s.eps_beat_rate != null) {
    if (s.eps_beat_rate >= 0.75) {
      score += 1; count++;
      reasons.push("consistent earnings beats");
      signals.push({
        name: "Earnings Beat Rate",
        value: `${(s.eps_beat_rate * 100).toFixed(0)}%`,
        contribution: 1,
        description: "Consistently beats earnings (≥75%)",
      });
    } else if (s.eps_beat_rate <= 0.25) {
      score -= 1; count++;
      reasons.push("earnings misses");
      signals.push({
        name: "Earnings Beat Rate",
        value: `${(s.eps_beat_rate * 100).toFixed(0)}%`,
        contribution: -1,
        description: "Frequently misses earnings (≤25%)",
      });
    } else {
      signals.push({
        name: "Earnings Beat Rate",
        value: `${(s.eps_beat_rate * 100).toFixed(0)}%`,
        contribution: 0,
        description: "Mixed earnings record (25-75%)",
      });
    }
  } else {
    signals.push({
      name: "Earnings Beat Rate",
      value: "N/A",
      contribution: 0,
      description: "No earnings data available",
    });
  }

  // 11. Social sentiment (WSB + Reddit)
  if (s.wsb_sentiment === "Bullish") {
    score += 1; count++;
    reasons.push("WSB bullish");
    signals.push({
      name: "Social Sentiment",
      value: "Bullish",
      contribution: 1,
      description: "Retail community sentiment is bullish",
    });
  } else if (s.wsb_sentiment === "Bearish") {
    score -= 1; count++;
    reasons.push("WSB bearish");
    signals.push({
      name: "Social Sentiment",
      value: "Bearish",
      contribution: -1,
      description: "Retail community sentiment is bearish",
    });
  } else {
    signals.push({
      name: "Social Sentiment",
      value: s.wsb_sentiment || "Neutral",
      contribution: 0,
      description: "Retail community sentiment is neutral or unavailable",
    });
  }

  // 12. Macro context (Fed rate + unemployment)
  if (s.fed_rate != null) {
    if (s.fed_rate >= 5) {
      score -= 1; count++;
      reasons.push("high interest rates");
      signals.push({
        name: "Fed Funds Rate",
        value: `${s.fed_rate.toFixed(2)}%`,
        contribution: -1,
        description: "High interest rates (≥5%) headwind for growth",
      });
    } else if (s.fed_rate <= 2) {
      score += 1; count++;
      reasons.push("accommodative rates");
      signals.push({
        name: "Fed Funds Rate",
        value: `${s.fed_rate.toFixed(2)}%`,
        contribution: 1,
        description: "Accommodative rates (≤2%) support growth",
      });
    } else {
      signals.push({
        name: "Fed Funds Rate",
        value: `${s.fed_rate.toFixed(2)}%`,
        contribution: 0,
        description: "Neutral interest rate environment (2-5%)",
      });
    }
  } else {
    signals.push({
      name: "Fed Funds Rate",
      value: "N/A",
      contribution: 0,
      description: "No Fed rate data available",
    });
  }
  if (s.unemployment != null) {
    if (s.unemployment >= 5) {
      score -= 1; count++;
      reasons.push("elevated unemployment");
      signals.push({
        name: "Unemployment Rate",
        value: `${s.unemployment.toFixed(2)}%`,
        contribution: -1,
        description: "Elevated unemployment (≥5%) signals economic weakness",
      });
    } else if (s.unemployment <= 3.5) {
      score += 1; count++;
      reasons.push("tight labor market");
      signals.push({
        name: "Unemployment Rate",
        value: `${s.unemployment.toFixed(2)}%`,
        contribution: 1,
        description: "Tight labor market (≤3.5%) supports growth",
      });
    } else {
      signals.push({
        name: "Unemployment Rate",
        value: `${s.unemployment.toFixed(2)}%`,
        contribution: 0,
        description: "Moderate unemployment (3.5-5%)",
      });
    }
  } else {
    signals.push({
      name: "Unemployment Rate",
      value: "N/A",
      contribution: 0,
      description: "No unemployment data available",
    });
  }

  return {
    score,
    signalCount: count,
    outlook: score >= 3 ? "bullish" : score <= -3 ? "bearish" : "mixed",
    reasons,
    signals,
  };
}
