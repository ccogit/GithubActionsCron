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

  // --- options flow (unusual activity, daily) ---
  options_skew?: number | null;      // -1.0 to +1.0 (call/put ratio)
  options_unusual_count?: number | null;

  // --- signal A: analyst revisions (daily) ---
  rev_ratio?: number | null;         // 0.0 to 1.0 (up / total)

  // --- signal B: market breadth (macro, daily) ---
  breadth_50?: number | null;        // % of index above SMA50

  // --- signal C: relative strength (daily) ---
  rs_3m?: number | null;             // relative return vs index %

  // --- signal D: institutional conviction (quarterly) ---
  inst_pct?: number | null;          // % held by institutions

  // --- signal E: market volatility (macro, daily) ---
  vix?: number | null;               // VIX level

  // --- finnhub signal F: technical advisory (daily) ---
  fh_advisory?: string | null;       // 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell'

  // --- finnhub signal G: support/resistance (daily) ---
  fh_levels?: number[] | null;       // array of levels

  // --- finnhub signal H: metrics (weekly) ---
  fh_pe?: number | null;
  fh_52w_low?: number | null;

  // --- current price for proximity signals ---
  current_price?: number | null;

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

  // 12. Options Flow (Unusual Activity & Skew)
  if (s.options_unusual_count != null && s.options_unusual_count >= 5) {
    if (s.options_skew != null) {
      if (s.options_skew > 0.3) {
        score += 1; count++;
        reasons.push("bullish options flow");
        signals.push({
          name: "Options Flow",
          value: `Skew +${s.options_skew.toFixed(2)}`,
          contribution: 1,
          description: `Bullish unusual activity (${s.options_unusual_count} contracts)`,
        });
      } else if (s.options_skew < -0.3) {
        score -= 1; count++;
        reasons.push("bearish options flow");
        signals.push({
          name: "Options Flow",
          value: `Skew ${s.options_skew.toFixed(2)}`,
          contribution: -1,
          description: `Bearish unusual activity (${s.options_unusual_count} contracts)`,
        });
      } else {
        signals.push({
          name: "Options Flow",
          value: `Skew ${s.options_skew.toFixed(2)}`,
          contribution: 0,
          description: "Neutral options flow (balanced calls/puts)",
        });
      }
    }
  } else if (s.options_unusual_count != null) {
    signals.push({
      name: "Options Flow",
      value: "Low activity",
      contribution: 0,
      description: "Insufficient unusual options activity (<5 contracts)",
    });
  } else {
    signals.push({
      name: "Options Flow",
      value: "N/A",
      contribution: 0,
      description: "No options flow data available",
    });
  }

  // 13. Signal A: Analyst Estimate Revisions
  if (s.rev_ratio != null) {
    if (s.rev_ratio >= 0.7) {
      score += 1; count++;
      reasons.push("bullish analyst revisions");
      signals.push({
        name: "Analyst Revisions",
        value: `${(s.rev_ratio * 100).toFixed(0)}% Up`,
        contribution: 1,
        description: "Strong upward revisions to earnings estimates",
      });
    } else if (s.rev_ratio <= 0.3) {
      score -= 1; count++;
      reasons.push("bearish analyst revisions");
      signals.push({
        name: "Analyst Revisions",
        value: `${(s.rev_ratio * 100).toFixed(0)}% Up`,
        contribution: -1,
        description: "Strong downward revisions to earnings estimates",
      });
    } else {
      signals.push({
        name: "Analyst Revisions",
        value: `${(s.rev_ratio * 100).toFixed(0)}% Up`,
        contribution: 0,
        description: "Mixed or neutral earnings revisions",
      });
    }
  }

  // 14. Signal C: Relative Strength (Momentum Leader)
  if (s.rs_3m != null) {
    if (s.rs_3m > 10) {
      score += 1; count++;
      reasons.push("momentum leader");
      signals.push({
        name: "Relative Strength",
        value: `+${s.rs_3m.toFixed(1)}%`,
        contribution: 1,
        description: "Outperforming benchmark by >10% over 3 months",
      });
    } else if (s.rs_3m < -10) {
      score -= 1; count++;
      reasons.push("momentum laggard");
      signals.push({
        name: "Relative Strength",
        value: `${s.rs_3m.toFixed(1)}%`,
        contribution: -1,
        description: "Underperforming benchmark by >10% over 3 months",
      });
    } else {
      signals.push({
        name: "Relative Strength",
        value: `${s.rs_3m.toFixed(1)}%`,
        contribution: 0,
        description: "Performance in line with benchmark",
      });
    }
  }

  // 15. Signal D: Institutional Ownership
  if (s.inst_pct != null) {
    if (s.inst_pct >= 0.75) {
      score += 1; count++;
      reasons.push("high institutional conviction");
      signals.push({
        name: "Inst. Ownership",
        value: `${(s.inst_pct * 100).toFixed(0)}%`,
        contribution: 1,
        description: "High institutional ownership (Smart Money conviction)",
      });
    } else if (s.inst_pct <= 0.2) {
      score -= 1; count++;
      signals.push({
        name: "Inst. Ownership",
        value: `${(s.inst_pct * 100).toFixed(0)}%`,
        contribution: -1,
        description: "Low institutional support",
      });
    }
  }

  // 16. Macro Dampener B: Market Breadth
  if (s.breadth_50 != null && s.breadth_50 < 0.3) {
    score -= 1; count++;
    reasons.push("weak market breadth");
    signals.push({
      name: "Market Breadth",
      value: `${(s.breadth_50 * 100).toFixed(0)}%`,
      contribution: -1,
      description: "Fragile market rally (few stocks participating)",
    });
  }

  // 17. Signal E: Market Volatility (VIX)
  if (s.vix != null) {
    if (s.vix < 15) {
      score += 1; count++;
      reasons.push("low market volatility");
      signals.push({
        name: "Market Volatility",
        value: `VIX ${s.vix.toFixed(1)}`,
        contribution: 1,
        description: "Low VIX (<15) signals calm, favorable market conditions",
      });
    } else if (s.vix > 30) {
      score -= 1; count++;
      reasons.push("elevated market volatility");
      signals.push({
        name: "Market Volatility",
        value: `VIX ${s.vix.toFixed(1)}`,
        contribution: -1,
        description: "Elevated VIX (>30) signals fear and market turbulence",
      });
    } else {
      signals.push({
        name: "Market Volatility",
        value: `VIX ${s.vix.toFixed(1)}`,
        contribution: 0,
        description: "VIX in normal range (15–30)",
      });
    }
  }

  // 18. Finnhub Signal F: Technical Advisory
  if (s.fh_advisory === "Strong Buy") {
    score += 1; count++;
    reasons.push("expert technical conviction");
    signals.push({
      name: "Expert Technicals",
      value: "Strong Buy",
      contribution: 1,
      description: "Finnhub consensus of 15+ indicators is 'Strong Buy'",
    });
  } else if (s.fh_advisory === "Strong Sell") {
    score -= 1; count++;
    reasons.push("expert technical weakness");
    signals.push({
      name: "Expert Technicals",
      value: "Strong Sell",
      contribution: -1,
      description: "Finnhub consensus of 15+ indicators is 'Strong Sell'",
    });
  } else {
    signals.push({
      name: "Expert Technicals",
      value: s.fh_advisory || "Neutral",
      contribution: 0,
      description: "Finnhub technical consensus is neutral or unavailable",
    });
  }

  // 19. Finnhub Signal G: Support/Resistance Safety
  if (s.fh_levels && s.fh_levels.length > 0 && s.current_price != null) {
    const support = Math.max(...s.fh_levels.filter(l => l < s.current_price!));
    if (support > 0 && support !== -Infinity) {
      const margin = (s.current_price - support) / support;
      if (margin > 0 && margin < 0.03) {
        score += 1; count++;
        reasons.push("near support floor");
        signals.push({
          name: "Support Cushion",
          value: `+${(margin * 100).toFixed(1)}%`,
          contribution: 1,
          description: `Trading within 3% of a major support level ($${support.toFixed(2)})`,
        });
      } else {
        signals.push({
          name: "Support Cushion",
          value: `+${(margin * 100).toFixed(1)}%`,
          contribution: 0,
          description: "Trading safely above the nearest major support",
        });
      }
    }
  }

  // 20. Finnhub Signal H: Valuation Sanity
  if (s.fh_pe != null && s.fh_pe > 0) {
    if (s.fh_pe < 20) {
      score += 1; count++;
      reasons.push("attractive P/E ratio");
      signals.push({
        name: "Valuation (P/E)",
        value: s.fh_pe.toFixed(1),
        contribution: 1,
        description: "P/E ratio < 20 indicates potential value",
      });
    } else if (s.fh_pe > 60) {
      score -= 1; count++;
      reasons.push("high valuation risk");
      signals.push({
        name: "Valuation (P/E)",
        value: s.fh_pe.toFixed(1),
        contribution: -1,
        description: "P/E ratio > 60 indicates overvaluation risk",
      });
    } else {
      signals.push({
        name: "Valuation (P/E)",
        value: s.fh_pe.toFixed(1),
        contribution: 0,
        description: "P/E ratio is within normal historical range",
      });
    }
  }

  if (s.fh_52w_low != null && s.current_price != null) {
    const margin = (s.current_price - s.fh_52w_low) / s.fh_52w_low;
    if (margin > 0 && margin < 0.05) {
      score += 1; count++;
      reasons.push("near 52w low");
      signals.push({
        name: "Cycle Value",
        value: `+${(margin * 100).toFixed(1)}%`,
        contribution: 1,
        description: "Trading within 5% of 52-week low (mean reversion potential)",
      });
    }
  }

  // 21. Macro context (Fed rate + unemployment)
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
