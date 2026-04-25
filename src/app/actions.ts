"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateWatchlist() {
  revalidatePath("/");
  revalidatePath("/watchlist");
}

export async function addSymbol(formData: FormData) {
  const symbol = (formData.get("symbol") as string).toUpperCase().trim();
  const min_price = parseFloat((formData.get("min_price") as string) || "0");
  if (!symbol) return;

  const db = await createClient();
  await db.from("watchlist").upsert({ symbol, min_price }, { onConflict: "symbol" });
  revalidateWatchlist();
}

export async function removeSymbol(symbol: string) {
  const db = await createClient();
  await db.from("watchlist").delete().eq("symbol", symbol);
  revalidateWatchlist();
}

export async function updateMinPrice(symbol: string, min_price: number) {
  const db = await createClient();
  await db.from("watchlist").update({ min_price }).eq("symbol", symbol);
  revalidateWatchlist();
}
