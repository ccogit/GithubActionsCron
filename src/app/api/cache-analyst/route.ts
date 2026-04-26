import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

async function getAnalystTarget(symbol: string): Promise<{
  target: number | null;
  nAnalysts: number | null;
} | null> {
  try {
    // Get crumb if needed
    let crumb: string | null = null;
    const crumbRes = await fetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (crumbRes.ok) {
      crumb = await crumbRes.text();
    }

    const cleanSymbol = symbol.replace(".DE", "");
    const url = crumb
      ? `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${cleanSymbol}?modules=financialData&crumb=${crumb}`
      : `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${cleanSymbol}?modules=financialData`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      // Fallback to v7 quote
      const fallbackRes = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${cleanSymbol}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }
      );

      if (!fallbackRes.ok) return null;

      const fallbackData = await fallbackRes.json();
      const quote = fallbackData.quoteResponse?.result?.[0];

      return {
        target: quote?.targetMeanPrice || null,
        nAnalysts: quote?.numberOfAnalysts || null,
      };
    }

    const data = await res.json();
    const financialData = data.quoteSummary?.result?.[0]?.financialData;

    return {
      target: financialData?.targetMeanPrice?.raw || null,
      nAnalysts: financialData?.numberOfAnalysts?.raw || null,
    };
  } catch (error) {
    console.error(`Error fetching analyst target for ${symbol}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Verify authorization (simple API key check)
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.ANALYST_CACHE_KEY || "no-key";

  if (authHeader !== `Bearer ${expectedKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createClient();
    const { data: constituents } = await db
      .from("index_constituents")
      .select("symbol")
      .eq("active", true);
    const allSymbols = (constituents ?? []).map((c: { symbol: string }) => c.symbol);

    const updated: string[] = [];

    for (const symbol of allSymbols) {
      const result = await getAnalystTarget(symbol);

      if (result?.target) {
        // Fetch current price from existing ticks
        const { data: tickData } = await db
          .from("price_ticks")
          .select("price")
          .eq("symbol", symbol)
          .order("fetched_at", { ascending: false })
          .limit(1);

        const currentPrice = tickData?.[0]?.price;

        if (currentPrice) {
          const upside =
            ((result.target - currentPrice) / currentPrice) * 100;

          // Upsert into analyst cache
          await db.from("analyst_cache").upsert(
            {
              symbol,
              target_mean: result.target,
              current_price: currentPrice,
              upside_pct: upside,
              n_analysts: result.nAnalysts,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "symbol" }
          );

          updated.push(symbol);
        }
      }

      // Rate limit: avoid hammering Yahoo
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return Response.json({
      success: true,
      updated: updated.length,
      symbols: updated,
    });
  } catch (error) {
    console.error("Error updating analyst cache:", error);
    return Response.json(
      { error: "Failed to update cache" },
      { status: 500 }
    );
  }
}
