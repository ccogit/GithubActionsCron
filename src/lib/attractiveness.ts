// Composite "attractiveness" score for a stock, derived from multiple signals.
// Each signal contributes ±1 (or ±2 for strong analyst conviction). Higher is better.
// Scale: typical range −2..+6. Used by Spotlight Discovery and the rebalance engine.

export interface AttractivenessSignals {
  upside_pct?: number | null;
  buy_count?: number | null;
  sell_count?: number | null;
  news_sentiment?: number | null;
  trends_direction?: string | null;
  changePct?: number | null;
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

  if (s.news_sentiment != null) {
    if (s.news_sentiment > 0.2) {
      score += 1; count++;
      reasons.push("positive news");
    } else if (s.news_sentiment < -0.2) {
      score -= 1; count++;
      reasons.push("negative news");
    }
  }

  if (s.trends_direction === "rising") {
    score += 1; count++;
    reasons.push("rising interest");
  } else if (s.trends_direction === "falling") {
    score -= 1; count++;
  }

  if (s.changePct != null) {
    if (s.changePct > 5) {
      score += 1; count++;
      reasons.push(`+${s.changePct.toFixed(1)}% today`);
    } else if (s.changePct < -5) {
      score -= 1; count++;
      reasons.push(`${s.changePct.toFixed(1)}% today`);
    }
  }

  return {
    score,
    signalCount: count,
    outlook: score >= 2 ? "bullish" : score <= -2 ? "bearish" : "mixed",
    reasons: reasons.slice(0, 3),
  };
}
