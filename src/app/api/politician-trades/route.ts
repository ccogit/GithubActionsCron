import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600; // Cache for 1 hour

export async function GET() {
  try {
    const db = createClient();

    const { data, error } = await db
      .from("politician_trade_summary")
      .select("*")
      .not("buy_count", "is", null)
      .order("buy_count", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching politician trades:", error);
      return Response.json(
        { trades: [], error: String(error) },
        { status: 200 }
      );
    }

    return Response.json({
      trades: data || [],
    });
  } catch (error) {
    console.error("Error in politician-trades:", error);
    return Response.json(
      { trades: [], error: String(error) },
      { status: 200 }
    );
  }
}
