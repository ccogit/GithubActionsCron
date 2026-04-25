import { NextRequest, NextResponse } from "next/server";
import { ISIN_MAP } from "@/lib/market-data";

const BF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
  Origin: "https://www.boerse-frankfurt.de",
  Referer: "https://www.boerse-frankfurt.de/",
};

export type Knockout = {
  isin: string;
  name: string;
  type: "Call" | "Put";
  barrier: number | null;
  strike: number | null;
  ask: number | null;
  bid: number | null;
  leverage: number | null;
  issuer: string;
};

export type DerivativesResult = {
  symbol: string;
  isin: string | null;
  knockouts: Knockout[];
  links: { label: string; url: string }[];
  source: string | null;
  error: string | null;
};

async function fetchBoerseFrankfurtKnockouts(isin: string): Promise<Knockout[]> {
  try {
    const params = new URLSearchParams({
      UNDERLYING_ISIN: isin,
      LEVERAGE_PRODUCT_CATEGORY: "KNOCKOUT",
      ORDER_BY: "LEVERAGE_RATIO",
      OFFSET: "0",
      LIMIT: "20",
      LANG: "en",
    });
    const res = await fetch(
      `https://api.boerse-frankfurt.de/v2/search/derivatives?${params}`,
      { headers: BF_HEADERS, cache: "no-store", signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: Record<string, unknown>[] = data?.data ?? data?.results ?? [];
    return items.slice(0, 20).map((item) => ({
      isin: String(item.isin ?? ""),
      name: String(item.name ?? ""),
      type: String(item.optionType ?? item.knockoutType ?? "").toLowerCase().includes("put") ? "Put" : "Call",
      barrier: item.knockoutBarrier != null ? Number(item.knockoutBarrier) : null,
      strike: item.strike != null ? Number(item.strike) : null,
      ask: item.ask != null ? Number(item.ask) : null,
      bid: item.bid != null ? Number(item.bid) : null,
      leverage: item.leverageRatio != null ? Number(item.leverageRatio) : null,
      issuer: String(item.issuerName ?? item.issuer ?? ""),
    }));
  } catch {
    return [];
  }
}

function buildLinks(symbol: string, isin: string | null): { label: string; url: string }[] {
  const bare = symbol.replace(/\.[A-Z]+$/, "");
  return [
    {
      label: "Tradegate",
      url: isin
        ? `https://www.tradegate.de/orderbuch.php?isin=${isin}`
        : `https://www.tradegate.de/suche.php?suche=${bare}`,
    },
    {
      label: "Börse Frankfurt",
      url: isin
        ? `https://www.boerse-frankfurt.de/derivatsuche?underlying=${isin}&category=knockouts`
        : "https://www.boerse-frankfurt.de/derivatsuche?category=knockouts",
    },
    {
      label: "comdirect",
      url: isin
        ? `https://www.comdirect.de/inf/hebelprodukte/suche.html?UNDERLYING_ISIN=${isin}&PRODUCT_TYPE=KNOCKOUT`
        : "https://www.comdirect.de/inf/hebelprodukte/suche.html",
    },
    {
      label: "OnVista",
      url: `https://www.onvista.de/hebelprodukte/?searchValue=${bare}`,
    },
    {
      label: "Finanztreff",
      url: isin
        ? `https://www.finanztreff.de/hebelprodukte/knockout/?isin=${isin}`
        : "https://www.finanztreff.de/hebelprodukte/knockout/",
    },
  ];
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  // Look up ISIN from static map (covers all index constituents)
  const isin = ISIN_MAP[symbol] ?? null;
  const links = buildLinks(symbol, isin);

  let knockouts: Knockout[] = [];
  let source: string | null = null;
  let error: string | null = null;

  if (isin) {
    knockouts = await fetchBoerseFrankfurtKnockouts(isin);
    if (knockouts.length > 0) {
      source = "Börse Frankfurt";
    } else {
      error = "No knockouts returned by Börse Frankfurt — use the links below";
    }
  } else {
    error = "Symbol not in ISIN map — use the links below to search";
  }

  const result: DerivativesResult = { symbol, isin, knockouts, links, source, error };
  return NextResponse.json(result);
}
