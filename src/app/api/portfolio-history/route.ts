import { NextRequest, NextResponse } from "next/server";
import { getPortfolioHistory } from "@/lib/alpaca";

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range") ?? "1D";
  const { points, baseValue } = await getPortfolioHistory(range);
  return NextResponse.json({ points, baseValue });
}
