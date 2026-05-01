// Pure rebalancing algorithm. No I/O — takes data in, returns a plan.
//
// Two phases:
//  1. Swap phase  — iterative greedy swaps: sell worst-scoring held stock,
//     buy best-scoring non-held stock, when score delta >= threshold.
//  2. Deploy phase — invest free cash across the top-scoring candidates,
//     score-proportionally weighted, with hard diversification floor (minBuysForDeployment)
//     and per-stock concentration cap (maxSingleAllocationPct).

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
  threshold: number;               // min score delta to swap (e.g. 1.0 = one signal level)
  minBuyScore: number;             // refuse buys with score below this
  maxIterations: number;           // hard cap on swaps per run (turnover control)
  minTradeUsd: number;             // skip trades smaller than this
  availableCash?: number;          // free cash to deploy (fetched from broker)
  minBuysForDeployment?: number;   // diversification floor: deploy only if ≥N stocks qualify (default 3)
  maxSingleAllocationPct?: number; // concentration cap per stock as fraction of deployed budget (default 0.40)
}

export interface PlannedSwap {
  sell: { symbol: string; qty: number; price: number; value: number; score: number };
  buy:  { symbol: string; qty: number; price: number; value: number; score: number };
  scoreDelta: number;
}

export interface PlannedBuy {
  symbol: string;
  qty: number;
  price: number;
  value: number;
  score: number;
  allocationPct: number; // fraction of total deployed budget
}

export interface SkipReason {
  reason: string;
  details?: string;
}

export interface RebalancePlan {
  swaps: PlannedSwap[];
  buys: PlannedBuy[];          // fresh purchases from available cash
  deployedBudget: number;      // total USD committed to buys
  totalValueBefore: number;
  totalValueAfter: number;
  iterations: number;
  skipped: SkipReason[];
}

// ---------------------------------------------------------------------------
// Swap phase
// ---------------------------------------------------------------------------

export function planRebalance(
  positions: PortfolioPosition[],
  positionScores: Map<string, number>,
  universe: UniverseStock[],
  config: RebalanceConfig
): RebalancePlan {
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

    // Worst held
    let worstSym: string | null = null;
    let worstScore = Infinity;
    for (const sym of portfolio.keys()) {
      const sc = heldScore.get(sym) ?? 0;
      if (sc < worstScore) { worstScore = sc; worstSym = sym; }
    }

    // Best non-held
    let bestSym: string | null = null;
    let bestScore = -Infinity;
    for (const [sym, u] of universeMap) {
      if (portfolio.has(sym)) continue;
      if (u.score > bestScore) { bestScore = u.score; bestSym = sym; }
    }

    if (!worstSym || !bestSym) {
      skipped.push({ reason: "no candidates", details: `worst=${worstSym ?? "none"}, best=${bestSym ?? "none"}` });
      break;
    }

    const delta = bestScore - worstScore;
    if (delta < config.threshold) break;

    if (bestScore < config.minBuyScore) {
      skipped.push({ reason: "best candidate below min buy score", details: `${bestSym} score ${bestScore} < min ${config.minBuyScore}` });
      break;
    }

    const worstPos = portfolio.get(worstSym)!;
    const sellValue = worstPos.qty * worstPos.price;

    if (sellValue < config.minTradeUsd) {
      skipped.push({ reason: "below min trade size", details: `${worstSym} value $${sellValue.toFixed(2)} < $${config.minTradeUsd}` });
      break;
    }

    const buyU = universeMap.get(bestSym)!;
    const buyQty = Math.floor(sellValue / buyU.price);

    if (buyQty <= 0) {
      skipped.push({ reason: "buy qty rounds to 0", details: `${bestSym} @ $${buyU.price.toFixed(2)} vs $${sellValue.toFixed(2)}` });
      break;
    }

    const buyValue = buyQty * buyU.price;

    swaps.push({
      sell: { symbol: worstSym, qty: worstPos.qty, price: worstPos.price, value: sellValue, score: worstScore },
      buy:  { symbol: bestSym,  qty: buyQty,       price: buyU.price,    value: buyValue,  score: bestScore  },
      scoreDelta: delta,
    });

    portfolio.delete(worstSym);
    portfolio.set(bestSym, { symbol: bestSym, qty: buyQty, price: buyU.price });
    heldScore.delete(worstSym);
    heldScore.set(bestSym, bestScore);
  }

  // ---------------------------------------------------------------------------
  // Deploy phase — invest free cash
  // ---------------------------------------------------------------------------
  const { buys, deployedBudget } = deployFreeCash(portfolio, universeMap, config, skipped);
  for (const b of buys) {
    const existing = portfolio.get(b.symbol);
    if (existing) {
      existing.qty += b.qty;
    } else {
      portfolio.set(b.symbol, { symbol: b.symbol, qty: b.qty, price: b.price });
    }
  }

  return {
    swaps,
    buys,
    deployedBudget,
    totalValueBefore,
    totalValueAfter: sumValue(portfolio),
    iterations: iter,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Budget deployment
// ---------------------------------------------------------------------------
// Strategy: score-proportional allocation among the top qualifying candidates,
// capped per stock, requiring a minimum number of distinct positions.
//
// Allocation weight = max(0, score). Stocks with equal score get equal weight.
// Any stock whose raw allocation exceeds the per-stock cap is clamped; the
// surplus is redistributed proportionally to the remaining candidates.
// If fewer than minBuysForDeployment stocks survive the quality gate, no cash
// is deployed (better to hold cash than concentrate risk).

const MIN_DEPLOY_SCORE = 2;   // hard floor: only stocks with score >= 2 qualify
const MAX_CANDIDATES   = 8;   // consider at most the top 8 by score

function deployFreeCash(
  portfolio: Map<string, PortfolioPosition>,
  universe: Map<string, UniverseStock>,
  config: RebalanceConfig,
  skipped: SkipReason[]
): { buys: PlannedBuy[]; deployedBudget: number } {
  const cash = config.availableCash ?? 0;
  if (cash <= 0) return { buys: [], deployedBudget: 0 };

  const minBuys  = config.minBuysForDeployment  ?? 3;
  const capPct   = config.maxSingleAllocationPct ?? 0.40;
  const minScore = Math.max(config.minBuyScore, MIN_DEPLOY_SCORE);

  if (cash < minBuys * config.minTradeUsd) {
    skipped.push({ reason: "insufficient cash for diversified deployment", details: `$${cash.toFixed(2)} < ${minBuys} × $${config.minTradeUsd}` });
    return { buys: [], deployedBudget: 0 };
  }

  // Top candidates sorted by score descending
  const candidates = Array.from(universe.values())
    .filter(u => u.score >= minScore && u.price > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length < minBuys) {
    skipped.push({ reason: "too few qualifying candidates to deploy cash safely", details: `${candidates.length} < ${minBuys} required` });
    return { buys: [], deployedBudget: 0 };
  }

  // Score-proportional weights (use score directly; all >= minScore > 0)
  const totalWeight = candidates.reduce((s, c) => s + c.score, 0);
  const rawAllocations = candidates.map(c => (c.score / totalWeight) * cash);

  // Apply per-stock cap and redistribute surplus
  const capAmount = cash * capPct;
  const allocations = redistributeCapped(rawAllocations, capAmount, cash);

  // Round down to whole shares, enforce minTradeUsd
  const buys: PlannedBuy[] = [];
  let deployedBudget = 0;

  for (let i = 0; i < candidates.length; i++) {
    const alloc = allocations[i];
    if (alloc < config.minTradeUsd) continue;

    const c   = candidates[i];
    const qty = Math.floor(alloc / c.price);
    if (qty <= 0) continue;

    const value = qty * c.price;
    buys.push({ symbol: c.symbol, qty, price: c.price, value, score: c.score, allocationPct: 0 });
    deployedBudget += value;
  }

  if (buys.length < minBuys) {
    skipped.push({ reason: "too few viable buys after rounding (prices too high for allocation)", details: `${buys.length} < ${minBuys} required` });
    return { buys: [], deployedBudget: 0 };
  }

  // Final allocation percentages
  for (const b of buys) b.allocationPct = b.value / deployedBudget;

  return { buys, deployedBudget };
}

// Redistribute surplus from capped entries proportionally to the rest.
// Iterates until stable (at most a few passes).
function redistributeCapped(raw: number[], cap: number, total: number): number[] {
  const alloc = [...raw];
  for (let pass = 0; pass < 5; pass++) {
    let surplus = 0;
    let freeWeight = 0;
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] > cap) { surplus += alloc[i] - cap; alloc[i] = cap; }
      else freeWeight += alloc[i];
    }
    if (surplus < 0.01) break;
    if (freeWeight <= 0) break;
    // Distribute surplus proportionally to non-capped entries
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] < cap) alloc[i] += surplus * (alloc[i] / freeWeight);
    }
  }
  // Scale to exactly `total` to absorb floating-point drift
  const actual = alloc.reduce((s, v) => s + v, 0);
  if (actual > 0) for (let i = 0; i < alloc.length; i++) alloc[i] *= total / actual;
  return alloc;
}

function sumValue(portfolio: Map<string, PortfolioPosition>): number {
  let total = 0;
  for (const p of portfolio.values()) total += p.qty * p.price;
  return total;
}
