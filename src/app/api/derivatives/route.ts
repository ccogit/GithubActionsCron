import { NextRequest, NextResponse } from "next/server";

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

const BF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
  "Origin": "https://www.boerse-frankfurt.de",
  "Referer": "https://www.boerse-frankfurt.de/",
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

async function getIsin(symbol: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ modules: "quoteType", lang: "en", region: "US" });
    const res = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params}`,
      { headers: YAHOO_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Yahoo doesn't expose ISIN via quoteSummary; use their v11 details endpoint instead
    const qt = data?.quoteSummary?.result?.[0]?.quoteType;
    return qt?.quoteType === "EQUITY" ? null : null; // ISIN not reliably available
  } catch {
    return null;
  }
}

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
      { headers: BF_HEADERS, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.data ?? data?.results ?? [];
    return items.slice(0, 20).map((item: Record<string, unknown>) => ({
      isin: (item.isin as string) ?? "",
      name: (item.name as string) ?? "",
      type: String(item.optionType ?? item.knockoutType ?? "").toLowerCase().includes("put") ? "Put" : "Call",
      barrier: item.knockoutBarrier != null ? Number(item.knockoutBarrier) : null,
      strike: item.strike != null ? Number(item.strike) : null,
      ask: item.ask != null ? Number(item.ask) : null,
      bid: item.bid != null ? Number(item.bid) : null,
      leverage: item.leverageRatio != null ? Number(item.leverageRatio) : null,
      issuer: (item.issuerName as string) ?? (item.issuer as string) ?? "",
    }));
  } catch {
    return [];
  }
}

function buildLinks(symbol: string, isin: string | null): { label: string; url: string }[] {
  const bare = symbol.replace(".DE", "").replace(".F", "");
  const links = [
    {
      label: "Tradegate",
      url: isin
        ? `https://www.tradegate.de/orderbuch.php?isin=${isin}`
        : `https://www.tradegate.de/suche.php?suche=${bare}`,
    },
    {
      label: "Boerse Frankfurt",
      url: isin
        ? `https://www.boerse-frankfurt.de/derivatsuche?underlying=${isin}&category=knockouts`
        : `https://www.boerse-frankfurt.de/derivatsuche?category=knockouts`,
    },
    {
      label: "comdirect",
      url: isin
        ? `https://www.comdirect.de/inf/hebelprodukte/suche.html?UNDERLYING_ISIN=${isin}&PRODUCT_TYPE=KNOCKOUT`
        : `https://www.comdirect.de/inf/hebelprodukte/suche.html`,
    },
    {
      label: "OnVista",
      url: `https://www.onvista.de/hebelprodukte/?searchValue=${bare}`,
    },
    {
      label: "Finanztreff",
      url: `https://www.finanztreff.de/hebelprodukte/knockout/`,
    },
  ];
  return links;
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const isinParam = request.nextUrl.searchParams.get("isin");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const isin = isinParam ?? (await getIsin(symbol));
  const links = buildLinks(symbol, isin);

  let knockouts: Knockout[] = [];
  let source: string | null = null;
  let error: string | null = null;

  if (isin) {
    knockouts = await fetchBoerseFrankfurtKnockouts(isin);
    if (knockouts.length > 0) source = "Börse Frankfurt";
    else error = "No live knockout data available — use the links below to search";
  } else {
    error = "ISIN not resolved — use the links below to search by symbol";
  }

  const result: DerivativesResult = { symbol, isin, knockouts, links, source, error };
  return NextResponse.json(result);
}
