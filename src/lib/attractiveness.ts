// Composite "attractiveness" score for a stock, derived from multiple signals.
// Each signal contributes ±1 (or ±2 for strong analyst conviction). Higher is better.
//
// Possible range with all 11 signals:
//   max  +10  (upside+2, all others+1)
//   min  −9   (downside−2, short interest−1, all others−1)
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
}

export interface AttractivenessResult {
  score: number;
  signalCount: number;
  outlook: "bullish" | "bearish" | "mixed";
  reasons: string[];
}

export function computeAttractiveness(s: AttractivenessSignals): AttractivenessResult {
  let score = 0;
  let count = 0;
  const reasons: string[] = [];

  // 1. Analyst price-target upside
  if (s.upside_pct != null) {
    if (s.upside_pct > 15) {
      score += 2; count++;
      reasons.push(`+${s.upside_pct.toFixed(0)}% analyst upside`);
    } else if (s.upside_pct > 5) {
      score += 1; count++;
    } else if (s.upside_pct < -10) {
      score -= 2; count++;
      reasons.push(`${s.upside_pct.toFixed(0)}% analyst downside`);
    } else if (s.upside_pct < -3) {
      score -= 1; count++;
    }
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
    } else if (ratio < 0.3) {
      score -= 1; count++;
      reasons.push(`${sells} politicians selling`);
    }
  }

  // 3. News sentiment
  if (s.news_sentiment != null) {
    if (s.news_sentiment > 0.2) {
      score += 1; count++;
      reasons.push("positive news");
    } else if (s.news_sentiment < -0.2) {
      score -= 1; count++;
      reasons.push("negative news");
    }
  }

  // 4. Google Trends direction
  if (s.trends_direction === "rising") {
    score += 1; count++;
    reasons.push("rising interest");
  } else if (s.trends_direction === "falling") {
    score -= 1; count++;
  }

  // 5. Intraday price change
  if (s.changePct != null) {
    if (s.changePct > 5) {
      score += 1; count++;
      reasons.push(`+${s.changePct.toFixed(1)}% today`);
    } else if (s.changePct < -5) {
      score -= 1; count++;
      reasons.push(`${s.changePct.toFixed(1)}% today`);
    }
  }

  // 6. Analyst buy/hold/sell consensus
  if (s.consensus_score != null) {
    if (s.consensus_score > 0.5) {
      score += 1; count++;
      reasons.push("analyst buy consensus");
    } else if (s.consensus_score < -0.5) {
      score -= 1; count++;
      reasons.push("analyst sell consensus");
    }
  }

  // 7. Technical aggregate signal
  if (s.tech_signal === "buy") {
    score += 1; count++;
    reasons.push("technicals bullish");
  } else if (s.tech_signal === "sell") {
    score -= 1; count++;
    reasons.push("technicals bearish");
  }

  // 8. Short interest (professional short conviction)
  if (s.short_pct_float != null && s.short_pct_float > 0.15) {
    score -= 1; count++;
    reasons.push(`${(s.short_pct_float * 100).toFixed(0)}% short interest`);
  }

  // 9. Corporate insider open-market transactions
  if (s.insider_signal === "buying") {
    score += 1; count++;
    reasons.push("insiders buying");
  } else if (s.insider_signal === "selling") {
    score -= 1; count++;
    reasons.push("insiders selling");
  }

  // 10. Earnings beat rate
  if (s.eps_beat_rate != null) {
    if (s.eps_beat_rate >= 0.75) {
      score += 1; count++;
      reasons.push("consistent earnings beats");
    } else if (s.eps_beat_rate <= 0.25) {
      score -= 1; count++;
      reasons.push("earnings misses");
    }
  }

  // 11. Social sentiment (WSB + Reddit)
  if (s.wsb_sentiment === "Bullish") {
    score += 1; count++;
    reasons.push("WSB bullish");
  } else if (s.wsb_sentiment === "Bearish") {
    score -= 1; count++;
    reasons.push("WSB bearish");
  }

  return {
    score,
    signalCount: count,
    outlook: score >= 3 ? "bullish" : score <= -3 ? "bearish" : "mixed",
    reasons: reasons.slice(0, 3),
  };
}
