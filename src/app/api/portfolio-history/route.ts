import { NextRequest, NextResponse } from "next/server";
import { getPortfolioHistory, getAccountEquity } from "@/lib/alpaca";

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range") ?? "1D";
  const [{ points, baseValue }, currentEquity] = await Promise.all([
    getPortfolioHistory(range),
    getAccountEquity(),
  ]);
  return NextResponse.json({ points, baseValue, currentEquity });
}
