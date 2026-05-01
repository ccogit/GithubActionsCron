import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const strategy = searchParams.get("strategy");
  const days     = Math.min(parseInt(searchParams.get("days") ?? "7"), 30);

  try {
    const db    = createClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = db
      .from("intraday_trades")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (strategy) query = query.eq("strategy", strategy);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ trades: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
