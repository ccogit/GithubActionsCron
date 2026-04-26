// Pure rebalancing algorithm. No I/O — takes data in, returns a plan.
// Iterative greedy swaps: each iteration sells the worst-scoring held stock and
// buys the best-scoring non-held stock, but only when the score improvement
// justifies the trade.

export interface PortfolioPosition {
  symbol: string;
  qty: number;
  price: number;
}

export interface UniverseStock {
  symbol: string;
  price: number;
  score: number;
}

export interface RebalanceConfig {
  threshold: number;       // min score delta to swap (e.g., 1.0 = one signal level)
  minBuyScore: number;     // refuse buys with absolute score below this
  maxIterations: number;   // hard cap on swaps per run (turnover control)
  minTradeUsd: number;     // skip trades smaller than this
}

export interface PlannedSwap {
  sell: { symbol: string; qty: number; price: number; value: number; score: number };
  buy: { symbol: string; qty: number; price: number; value: number; score: number };
  scoreDelta: number;
}

export interface SkipReason {
  reason: string;
  details?: string;
}

export interface RebalancePlan {
  swaps: PlannedSwap[];
  totalValueBefore: number;
  totalValueAfter: number;
  iterations: number;
  skipped: SkipReason[];
}

export function planRebalance(
  positions: PortfolioPosition[],
  positionScores: Map<string, number>,
  universe: UniverseStock[],
  config: RebalanceConfig
): RebalancePlan {
  // Mutable simulation state
  const portfolio = new Map<string, PortfolioPosition>();
  for (const p of positions) portfolio.set(p.symbol, { ...p });

  const heldScore = new Map(positionScores);

  const universeMap = new Map<string, UniverseStock>();
  for (const u of universe) universeMap.set(u.symbol, u);

  const totalValueBefore = sumValue(portfolio);

  const swaps: PlannedSwap[] = [];
  const skipped: SkipReason[] = [];
  let iter = 0;

  while (iter < config.maxIterations) {
    iter++;

    if (portfolio.size === 0) break;

    // Worst held: lowest score (treat unknown as 0)
    let worstSym: string | null = null;
    let worstScore = Infinity;
    for (const sym of portfolio.keys()) {
      const sc = heldScore.get(sym) ?? 0;
      if (sc < worstScore) {
        worstScore = sc;
        worstSym = sym;
      }
    }

    // Best non-held in tradable universe
    let bestSym: string | null = null;
    let bestScore = -Infinity;
    for (const [sym, u] of universeMap) {
      if (portfolio.has(sym)) continue;
      if (u.score > bestScore) {
        bestScore = u.score;
        bestSym = sym;
      }
    }

    if (!worstSym || !bestSym) {
      skipped.push({
        reason: "no candidates",
        details: `worst=${worstSym ?? "none"}, best=${bestSym ?? "none"}`,
      });
      break;
    }

    const delta = bestScore - worstScore;
    if (delta < config.threshold) {
      // Remaining swaps don't justify the threshold — stop
      break;
    }

    if (bestScore < config.minBuyScore) {
      skipped.push({
        reason: "best candidate below min buy score",
        details: `${bestSym} score ${bestScore} < min ${config.minBuyScore}`,
      });
      break;
    }

    const worstPos = portfolio.get(worstSym)!;
    const sellValue = worstPos.qty * worstPos.price;

    if (sellValue < config.minTradeUsd) {
      skipped.push({
        reason: "below min trade size",
        details: `${worstSym} value $${sellValue.toFixed(2)} < $${config.minTradeUsd}`,
      });
      break;
    }

    const buyU = universeMap.get(bestSym)!;
    const buyQty = Math.floor(sellValue / buyU.price);

    if (buyQty <= 0) {
      skipped.push({
        reason: "buy qty rounds to 0",
        details: `${bestSym} @ $${buyU.price.toFixed(2)} vs sell value $${sellValue.toFixed(2)}`,
      });
      break;
    }

    const buyValue = buyQty * buyU.price;

    swaps.push({
      sell: {
        symbol: worstSym,
        qty: worstPos.qty,
        price: worstPos.price,
        value: sellValue,
        score: worstScore,
      },
      buy: {
        symbol: bestSym,
        qty: buyQty,
        price: buyU.price,
        value: buyValue,
        score: bestScore,
      },
      scoreDelta: delta,
    });

    // Update simulated state
    portfolio.delete(worstSym);
    portfolio.set(bestSym, { symbol: bestSym, qty: buyQty, price: buyU.price });
    heldScore.delete(worstSym);
    heldScore.set(bestSym, bestScore);
  }

  return {
    swaps,
    totalValueBefore,
    totalValueAfter: sumValue(portfolio),
    iterations: iter,
    skipped,
  };
}

function sumValue(portfolio: Map<string, PortfolioPosition>): number {
  let total = 0;
  for (const p of portfolio.values()) total += p.qty * p.price;
  return total;
}
