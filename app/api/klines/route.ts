import { NextRequest, NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";

export const dynamic = "force-dynamic";

const allowedIntervals = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = searchParams.get("interval") || "15m";
  const limit = Number(searchParams.get("limit") || "500");

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol." }, { status: 400 });
  }

  if (!allowedIntervals.has(interval)) {
    return NextResponse.json({ error: "Unsupported interval." }, { status: 400 });
  }

  try {
    const candles = await getKlines(symbol, interval, limit);
    return NextResponse.json(candles, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Kline request failed", error);
    return NextResponse.json({ error: "Unable to load Binance market data." }, { status: 502 });
  }
}
