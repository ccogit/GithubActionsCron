"use server";

import { revalidatePath } from "next/cache";

const ENDPOINT =
  process.env.ALPACA_ENDPOINT ?? "https://paper-api.alpaca.markets/v2";

function headers(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

export async function placeOrderAction(formData: FormData) {
  const symbol = (formData.get("symbol") as string ?? "").toUpperCase().trim();
  const qty = formData.get("qty") as string;
  const side = formData.get("side") as string;
  const type = (formData.get("type") as string) || "market";
  const limitPrice = formData.get("limit_price") as string;

  if (!symbol || !qty || !side) return;

  const body: Record<string, string> = {
    symbol,
    qty,
    side,
    type,
    time_in_force: "day",
  };
  if (type === "limit" && limitPrice) body.limit_price = limitPrice;

  await fetch(`${ENDPOINT}/orders`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  revalidatePath("/orders");
  revalidatePath("/watchlist");
  revalidatePath("/");
}

export async function cancelOrderAction(orderId: string) {
  await fetch(`${ENDPOINT}/orders/${orderId}`, {
    method: "DELETE",
    headers: headers(),
  });
  revalidatePath("/orders");
}

export async function closePositionAction(symbol: string) {
  await fetch(`${ENDPOINT}/positions/${symbol}`, {
    method: "DELETE",
    headers: headers(),
  });
  revalidatePath("/watchlist");
  revalidatePath("/");
}
