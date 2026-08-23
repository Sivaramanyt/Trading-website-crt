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
// BTCUSDT on this endpoint is the same USDⓈ-M perpetual contract shown by
// TradingView as BTCUSDT.P. No Binance API key is required for public klines.
const PRIMARY_DATA_API = "https://fapi.binance.com";
const FALLBACK_DATA_APIS = [
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
];

type BinanceKline = [
  number,  // open time (ms)
  string,  // open
  string,  // high
  string,  // low
  string,  // close
  string,  // volume
  number,  // close time (ms)
  string,  // quote volume
  number,  // trades
  string,  // taker buy base volume
  string,  // taker buy quote volume
  string,  // unused
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

  // Binance returns klines in chronological order. Normalize again here so
  // the chart always receives one candle per exact exchange open timestamp.
  const byTime = new Map<number, Candle>();

  for (const row of rows) {
    const openTime = Number(row[0]);
    const closeTime = Number(row[6]);
    if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) continue;

    byTime.set(Math.floor(openTime / 1000), {
      // IMPORTANT: use Binance's candle OPEN time as the Lightweight Charts
      // timestamp. Do not use local/browser time or the candle close time.
      time: Math.floor(openTime / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closed: closeTime <= now,
    });
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function requestKlines(host: string, symbol: string, interval: string, limit: number) {
  const response = await fetch(makeUrl(host, symbol, interval, limit), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const rows = (await response.json()) as BinanceKline[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty response");

  return parseRows(rows);
}

/**
 * Public USDⓈ-M Futures klines.
 *
 * Primary source is Binance's canonical fapi.binance.com endpoint. The other
 * Binance Futures API hosts are only fallbacks if the canonical host cannot
 * be reached from the user's network.
 */
export async function getKlines(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
  const errors: string[] = [];
  const hosts = [PRIMARY_DATA_API, ...FALLBACK_DATA_APIS];

  for (const host of hosts) {
    try {
      const candles = await requestKlines(host, symbol, interval, limit);
      if (candles.length > 0) return candles;
      errors.push(`${host}: empty response`);
    } catch (error) {
      errors.push(`${host}: ${error instanceof Error ? error.message : "network error"}`);
    }
  }

  throw new Error(`Binance USDⓈ-M Futures market data unavailable. ${errors.join(" | ")}`);
}
