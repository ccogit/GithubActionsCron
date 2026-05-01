import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ENDPOINT = "https://paper-api.alpaca.markets/v2";

function hdrs(): Record<string, string> {
  return {
    "APCA-API-KEY-ID":     process.env.INTRADAY_ALPACA_KEY    ?? "",
    "APCA-API-SECRET-KEY": process.env.INTRADAY_ALPACA_SECRET ?? "",
  };
}

export async function GET() {
  try {
    const [posRes, acctRes] = await Promise.all([
      fetch(`${ENDPOINT}/positions`, { headers: hdrs(), cache: "no-store" }),
      fetch(`${ENDPOINT}/account`,   { headers: hdrs(), cache: "no-store" }),
    ]);

    const positions = posRes.ok  ? await posRes.json()  : [];
    const account   = acctRes.ok ? await acctRes.json() : {};

    return NextResponse.json({ positions, account });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
