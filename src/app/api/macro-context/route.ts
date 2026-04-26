import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600; // 1 hour cache

export async function GET() {
  try {
    const db = createClient();
    const { data } = await db.from("economic_indicators").select("*");
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("Error fetching macro context:", error);
    return NextResponse.json([], { status: 200 });
  }
}
