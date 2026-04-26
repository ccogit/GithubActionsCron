import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchQuotesForExchange } from "@/lib/market-quotes";

export type { QuoteRow } from "@/lib/market-quotes";

const EXCHANGE_TYPE: Record<string, "us" | "de"> = {
  "Dow Jones": "us",
  "Nasdaq 100": "us",
  DAX: "de",
};

export async function GET(request: NextRequest) {
  const exchange = request.nextUrl.searchParams.get("exchange") ?? "Dow Jones";
  const exchangeType = (EXCHANGE_TYPE[exchange] ?? "us") as "us" | "de";

  const db = createClient();
  const { data } = await db
    .from("index_constituents")
    .select("symbol, name")
    .eq("exchange", exchange)
    .eq("active", true);

  const rows = await fetchQuotesForExchange(data ?? [], exchangeType);
  return NextResponse.json({ rows });
}
