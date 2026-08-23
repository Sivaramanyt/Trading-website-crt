export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed?: boolean;
};

// Binance USDⓈ-M Futures public market-data API.
// This is market data only; no API key is required for these public endpoints.
const DATA_API = "https://fapi.binance.com";

export async function getKlines(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval,
    limit: String(Math.min(Math.max(limit, 1), 1000)),
  });

  const response = await fetch(`${DATA_API}/fapi/v1/klines?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Binance Futures returned ${response.status}`);

  const rows = (await response.json()) as Array<[
    number, string, string, string, string, string, number, string, number, string, string, string
  ]>;
  const now = Date.now();

  return rows.map((row) => ({
    time: Math.floor(row[0] / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closed: row[6] <= now,
  }));
}
