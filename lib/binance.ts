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
// Public klines do not require a Binance API key.
const DATA_API_HOSTS = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
];

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

function makeUrl(host: string, symbol: string, interval: string, limit: number) {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval,
    limit: String(Math.min(Math.max(limit, 1), 1000)),
  });
  return `${host}/fapi/v1/klines?${params.toString()}`;
}

function parseRows(rows: BinanceKline[]): Candle[] {
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

/**
 * Public Futures klines. In the browser we try Binance directly first so a
 * Vercel server region cannot block market-data requests. The Next.js API
 * route remains as a fallback and for server-side use.
 */
export async function getKlines(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
  const errors: string[] = [];
  const hosts = typeof window === "undefined" ? DATA_API_HOSTS : DATA_API_HOSTS;

  for (const host of hosts) {
    try {
      const response = await fetch(makeUrl(host, symbol, interval, limit), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        errors.push(`${host}: HTTP ${response.status}`);
        continue;
      }
      const rows = (await response.json()) as BinanceKline[];
      if (!Array.isArray(rows) || rows.length === 0) {
        errors.push(`${host}: empty response`);
        continue;
      }
      return parseRows(rows);
    } catch (error) {
      errors.push(`${host}: ${error instanceof Error ? error.message : "network error"}`);
    }
  }

  throw new Error(`Binance Futures market data unavailable. ${errors.join(" | ")}`);
}
