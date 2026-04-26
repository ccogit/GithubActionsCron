# Attractiveness Score Calculation & Visualization

## Overview

The attractiveness score is a composite metric (ranging from −11 to +12) that evaluates investment potential by combining 12 independent signals. The system now provides detailed visibility into how each signal contributes to the final score.

## Score Range

- **Maximum:** +12 (all signals bullish with high conviction)
- **Minimum:** −11 (all signals bearish with high conviction)
- **Outlook threshold:** ±3 (a stock needs conviction across multiple signals to be labeled bullish or bearish)

### Outlook Interpretation

| Outlook | Score Range | Meaning |
|---------|-------------|---------|
| **Bullish** | ≥ +3 | Multiple strong positive signals; attractive opportunity |
| **Mixed** | −2 to +2 | Conflicting signals or insufficient data; neutral view |
| **Bearish** | ≤ −3 | Multiple strong negative signals; avoid or reduce |

## The 12 Signals

Each signal contributes −2, −1, 0, +1, or +2 to the final score:

### 1. Analyst Price Target Upside

**Weight:** ±2 (strong) or ±1 (moderate)

- **+2:** Strong upside (>15% above current price)
- **+1:** Moderate upside (5–15%)
- **0:** Neutral (−3% to +5%)
- **−1:** Moderate downside (−3% to −10%)
- **−2:** Strong downside (<−10%)

**Data source:** Analyst consensus target price vs. current price

---

### 2. Congressional Trading Activity

**Weight:** ±1 (when sufficient data)

- **+1:** Majority buying (buy ratio >70% across ≥3 recent trades)
- **0:** Neutral (30–70% buy ratio or <3 trades)
- **−1:** Majority selling (buy ratio <30% across ≥3 recent trades)

**Data source:** SEC Form 4 filings of U.S. Congressional representatives

---

### 3. News Sentiment

**Weight:** ±1

- **+1:** Positive sentiment (>0.2 on −1 to +1 scale)
- **0:** Neutral (−0.2 to +0.2)
- **−1:** Negative sentiment (<−0.2)

**Data source:** VADER sentiment analysis on recent news articles

---

### 4. Search Trends (Google Trends)

**Weight:** ±1

- **+1:** Rising search interest (signal of growing attention)
- **0:** Stable search interest
- **−1:** Falling search interest (waning attention)

**Data source:** Google Trends daily direction indicator

---

### 5. Intraday Price Change

**Weight:** ±1

- **+1:** Strong gain (+5% or more)
- **0:** Modest movement (−5% to +5%)
- **−1:** Strong decline (−5% or more)

**Data source:** Alpaca or yfinance daily quotes

---

### 6. Analyst Rating Consensus

**Weight:** ±1

- **+1:** Bullish consensus (composite score >0.5)
- **0:** Neutral (−0.5 to +0.5)
- **−1:** Bearish consensus (<−0.5)

**Formula:** `(strongBuy×2 + buy − sell − strongSell×2) / total`

**Data source:** Finnhub analyst ratings

---

### 7. Technical Indicators Aggregate

**Weight:** ±1

- **+1:** Bullish signal (RSI, MACD, Bollinger Bands agree on uptrend)
- **0:** Neutral or mixed technicals
- **−1:** Bearish signal (technicals suggest downtrend)

**Data source:** Technical analysis of daily charts (RSI, MACD, Bollinger Bands, OBV)

---

### 8. Short Interest

**Weight:** −1 (when elevated)

- **−1:** Elevated short interest (>15% of float)
- **0:** Moderate short interest (≤15% of float)

**Note:** High short interest indicates professional skepticism but doesn't contribute positive points.

**Data source:** FINRA short interest data + yfinance

---

### 9. Corporate Insider Trading

**Weight:** ±1

- **+1:** Insiders are buying (open-market purchases)
- **0:** Neutral activity
- **−1:** Insiders are selling (open-market dispositions)

**Data source:** SEC Form 4 insider transactions (daily updates)

---

### 10. Earnings Beat Rate

**Weight:** ±1

- **+1:** Consistent beats (≥75% beat rate over last 4 quarters)
- **0:** Mixed record (25–75%)
- **−1:** Frequent misses (≤25%)

**Data source:** yfinance historical earnings data

---

### 11. Social Sentiment (Retail Community)

**Weight:** ±1

- **+1:** Bullish (r/wallstreetbets, ApeWisdom showing net bullish posts/activity)
- **0:** Neutral
- **−1:** Bearish (net sentiment is negative)

**Data source:** Reddit sentiment APIs (WSB, stocks subreddit)

---

### 12. Macro Context (Economic Indicators)

**Weight:** ±1 (per indicator)

#### Fed Funds Rate (DFF)
- **+1:** Accommodative (≤2%) — supports growth
- **0:** Neutral (2–5%)
- **−1:** Restrictive (≥5%) — headwind for growth stocks

#### Unemployment Rate (UNRATE)
- **+1:** Tight labor market (≤3.5%) — economic strength
- **0:** Moderate (3.5–5%)
- **−1:** Elevated (≥5%) — economic weakness

**Data source:** Federal Reserve Economic Data (FRED API)

---

## Using the AttractivenessBreakdown Component

The `AttractivenessBreakdown` component visualizes the score breakdown:

```tsx
import { AttractivenessBreakdown } from "@/components/AttractivenessBreakdown";

function StockDetailPage({ scoreDetails }) {
  return (
    <AttractivenessBreakdown 
      result={scoreDetails["AAPL"]} 
      symbol="AAPL" 
    />
  );
}
```

### Component Features

- **Overall Score Display:** Large, prominent score with signal count
- **Outlook Badge:** Color-coded (green=bullish, red=bearish, gray=mixed)
- **Grouped Signal View:**
  - Bullish signals (sorted by contribution, highest first)
  - Bearish signals (sorted by impact)
  - Neutral/insufficient data signals
- **Per-Signal Breakdown:**
  - Signal name and contribution (−2 to +2)
  - Actual metric value (e.g., "+15.3% upside")
  - Human-readable explanation of threshold crossed

### API Endpoint Response

The `/api/rebalance` endpoint now includes `scoreDetails` for all scored symbols:

```json
{
  "plan": { ... },
  "config": { ... },
  "summary": { ... },
  "scoreDetails": {
    "AAPL": {
      "score": 5,
      "signalCount": 8,
      "outlook": "bullish",
      "reasons": ["strong analyst upside", "technicals bullish", ...],
      "signals": [
        {
          "name": "Analyst Upside",
          "value": "+18.5%",
          "contribution": 2,
          "description": "Strong analyst price target upside (>15%)"
        },
        ...
      ]
    },
    "MSFT": { ... },
    ...
  }
}
```

---

## Resilience to Data Failures

The system gracefully handles missing data:

- If a workflow fails to update (e.g., politician trades API rate limits), the signal receives a **contribution of 0** but doesn't break the calculation
- Missing signals still report as "N/A" with a description in the breakdown
- Attractiveness calculation continues with whatever data is available
- The next successful workflow update will refresh that signal

### Example: When Politician Trades Workflow Fails

```json
{
  "name": "Congressional Trading",
  "value": "0 trades",
  "contribution": 0,
  "description": "Insufficient data (<3 trades)"
}
```

The stock's score still calculates normally, just without the congressional signal.

---

## Score Interpretation Guide

### Score: 7+ (Bullish)
✅ Strong candidate for buying or holding
- Multiple signals aligned positively
- Suitable for long-term hold or accumulation

### Score: 3–6 (Weakly Bullish)
⚠️ Positive bias but watch for contradictions
- Check the specific signals; may be driven by 1–2 factors
- Consider macro context (economic indicators)

### Score: −2 to +2 (Mixed)
🤔 Neutral; requires more research
- Signals are conflicting or insufficient
- May be good for value investors; avoid for momentum trading

### Score: −6 to −3 (Weakly Bearish)
⚠️ Negative bias; consider trimming exposure
- Multiple weak negatives or 1–2 strong bears
- Monitor for improvement before adding

### Score: −7 or lower (Bearish)
❌ High risk; avoid or exit position
- Multiple negative signals aligned
- Seek better opportunities elsewhere

---

## Updating the Attractiveness Calculation

The logic is centralized in `src/lib/attractiveness.ts`:

- **Thresholds:** Adjust upside/downside breakpoints, unemployment ranges, etc.
- **Weights:** Modify signal contributions (±1, ±2 values)
- **New signals:** Add to `AttractivenessSignals` interface, expand `computeAttractiveness`

Example: To make analyst upside worth ±3 instead of ±2:

```typescript
if (s.upside_pct > 15) {
  score += 3; // was: score += 2
  signals.push({
    name: "Analyst Upside",
    value: `+${s.upside_pct.toFixed(1)}%`,
    contribution: 3, // was: 2
    description: "Strong analyst price target upside (>15%)",
  });
}
```

---

## Notes

- **Stale Data Handling:** If a workflow fails, the last cached value is used (e.g., previous day's politician trades summary). This ensures the score doesn't retroactively degrade.
- **Daily Refresh:** Most signals update once per day via GitHub Actions workflows.
- **Real-Time Signals:** Intraday price change updates every market hour via live market quotes.
