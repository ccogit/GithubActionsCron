import { NextRequest, NextResponse } from "next/server";
import { fetchQuotesForExchange } from "@/lib/market-quotes";

export type { QuoteRow } from "@/lib/market-quotes";

export async function GET(request: NextRequest) {
  const exchange = request.nextUrl.searchParams.get("exchange") ?? "Dow Jones";
  const rows = await fetchQuotesForExchange(exchange);
  return NextResponse.json({ rows });
}
