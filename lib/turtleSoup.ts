import type { Candle } from "./binance";

export type TurtleSoupKind = "TURTLE_SOUP" | "KOD";
export type TurtleSoupDirection = "LONG" | "SHORT";

export type TurtleSoupSetup = {
  kind: TurtleSoupKind;
  direction: TurtleSoupDirection;
  status: "CONFIRMED" | "FORMING";
  time: number;
  sweepLevel: number;
  sweepLow: number;
  sweepHigh: number;
  entry: number;
  stop: number;
  reason: string;
};

function bodyIsLargerThanWicks(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  return body > 0 && body > upper && body > lower;
}

/**
 * Transcript-grounded Turtle Soup approximation:
 * price attacks an engineered high/low liquidity pool and then closes back
 * through that level, i.e. a false breakout rather than a clean continuation.
 *
 * We use confirmed/closed candles only and deliberately keep the swing
 * lookback explicit so the detector does not invent discretionary levels.
 */
export function detectTurtleSoup(
  candles: Candle[],
  direction: TurtleSoupDirection,
  fromTime: number,
  toTime: number,
  rangeLow?: number,
  rangeHigh?: number,
): TurtleSoupSetup | null {
  const closed = candles
    .filter(c => c.closed !== false && c.time >= fromTime && c.time <= toTime)
    .sort((a, b) => a.time - b.time);
  if (closed.length < 6) return null;

  const lookback = 5;
  let latest: TurtleSoupSetup | null = null;

  for (let i = lookback; i < closed.length; i++) {
    const c = closed[i];
    const prior = closed.slice(i - lookback, i);

    if (direction === "LONG") {
      const level = Math.min(...prior.map(x => x.low));
      const swept = c.low < level;
      const reclaimed = c.close > level;
      if (!swept) continue;

      const lower25 = rangeLow != null && rangeHigh != null
        ? rangeLow + (rangeHigh - rangeLow) * 0.25
        : Number.NEGATIVE_INFINITY;
      const isKOD = reclaimed && c.close <= lower25 && i >= lookback + 1;
      if (!reclaimed && i !== closed.length - 1) continue;
      if (!reclaimed) {
        latest = {
          kind: isKOD ? "KOD" : "TURTLE_SOUP",
          direction,
          status: "FORMING",
          time: c.time,
          sweepLevel: level,
          sweepLow: c.low,
          sweepHigh: c.high,
          entry: c.close,
          stop: c.low,
          reason: `15M ${isKOD ? "KOD" : "Turtle Soup"}: price swept the prior sell-side liquidity level but has not yet confirmed the reclaim.`
        };
        continue;
      }
      latest = {
        kind: isKOD ? "KOD" : "TURTLE_SOUP",
        direction,
        status: "CONFIRMED",
        time: c.time,
        sweepLevel: level,
        sweepLow: c.low,
        sweepHigh: c.high,
        entry: c.close,
        stop: c.low,
        reason: `15M ${isKOD ? "Kiss of Death Turtle Soup" : "Turtle Soup"}: price attacked the prior low and closed back above it.`
      };
    } else {
      const level = Math.max(...prior.map(x => x.high));
      const swept = c.high > level;
      const reclaimed = c.close < level;
      if (!swept) continue;

      const upper25 = rangeLow != null && rangeHigh != null
        ? rangeHigh - (rangeHigh - rangeLow) * 0.25
        : Number.POSITIVE_INFINITY;
      const isKOD = reclaimed && c.close >= upper25 && i >= lookback + 1;
      if (!reclaimed && i !== closed.length - 1) continue;
      if (!reclaimed) {
        latest = {
          kind: isKOD ? "KOD" : "TURTLE_SOUP",
          direction,
          status: "FORMING",
          time: c.time,
          sweepLevel: level,
          sweepLow: c.low,
          sweepHigh: c.high,
          entry: c.close,
          stop: c.high,
          reason: `15M ${isKOD ? "KOD" : "Turtle Soup"}: price swept the prior buy-side liquidity level but has not yet confirmed the reclaim.`
        };
        continue;
      }
      latest = {
        kind: isKOD ? "KOD" : "TURTLE_SOUP",
        direction,
        status: "CONFIRMED",
        time: c.time,
        sweepLevel: level,
        sweepLow: c.low,
        sweepHigh: c.high,
        entry: c.close,
        stop: c.high,
        reason: `15M ${isKOD ? "Kiss of Death Turtle Soup" : "Turtle Soup"}: price attacked the prior high and closed back below it.`
      };
    }
  }

  return latest;
}
