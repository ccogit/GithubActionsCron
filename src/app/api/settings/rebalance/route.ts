import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const KEY = "rebalance_enabled";

export async function GET() {
  try {
    const db = createClient();
    const { data } = await db
      .from("settings")
      .select("value, updated_at")
      .eq("key", KEY)
      .single();
    return NextResponse.json({
      enabled: data?.value === "true",
      updatedAt: data?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ enabled: false, updatedAt: null });
  }
}

export async function POST(request: NextRequest) {
  const { enabled } = await request.json();
  const db = createClient();
  await db.from("settings").upsert(
    { key: KEY, value: String(!!enabled), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  ).execute();
  return NextResponse.json({ enabled: !!enabled });
}
