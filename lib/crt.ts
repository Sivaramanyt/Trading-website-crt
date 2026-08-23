import type { Candle } from "./binance";

export type CrtSetup = {
  direction: "LONG" | "SHORT";
  status: "CONFIRMED" | "FORMING";
  rangeHigh: number;
  rangeLow: number;
  midpoint: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rangeTime: number;
  manipulationTime: number;
  distributionTime: number;
  reason: string;
};

/**
 * Foundational CRT detector.
 *
 * Candle 1 must first qualify as a CRT candle:
 * - its real body must be larger than BOTH its upper wick and lower wick.
 *
 * After that:
 * - Candle 1 defines the CRT range.
 * - Candle 2 sweeps one side of that range (manipulation).
 * - Candle 3 closes back inside the range (distribution).
 * - 50% of Candle 1 is Target 1 and the opposite range boundary is Target 2.
 * - A low sweep creates a bullish setup; a high sweep creates a bearish setup.
 *
 * We scan backward for the most recent qualifying Candle 1 instead of blindly
 * treating the last three closed candles as a CRT.
 */
export function detectCrt(candles: Candle[]): CrtSetup | null {
  const closed = candles.filter((c) => c.closed !== false);
  if (closed.length < 3) return null;

  // Start with the most recent possible Candle 1 and work backward.
  for (let i = closed.length - 3; i >= 0; i--) {
    const c1 = closed[i];
    const c2 = closed[i + 1];
    const c3 = closed[i + 2];

    const body = Math.abs(c1.close - c1.open);
    const upperWick = c1.high - Math.max(c1.open, c1.close);
    const lowerWick = Math.min(c1.open, c1.close) - c1.low;

    // Core rule: the candle body must be bigger than each wick.
    // Zero-body candles therefore cannot qualify as CRT candles.
    const validCrtCandle = body > 0 && body > upperWick && body > lowerWick;
    if (!validCrtCandle) continue;

    const midpoint = (c1.high + c1.low) / 2;
    const sweptLow = c2.low < c1.low;
    const sweptHigh = c2.high > c1.high;
    const c3BackInside = c3.close > c1.low && c3.close < c1.high;

    if (sweptLow && !sweptHigh) {
      return {
        direction: "LONG",
        status: c3BackInside ? "CONFIRMED" : "FORMING",
        rangeHigh: c1.high,
        rangeLow: c1.low,
        midpoint,
        entry: c3.open,
        stop: c2.low,
        target1: midpoint,
        target2: c1.high,
        rangeTime: c1.time,
        manipulationTime: c2.time,
        distributionTime: c3.time,
        reason: c3BackInside
          ? "Valid CRT candle: body is larger than both wicks. Candle 2 swept the CRT low and Candle 3 returned inside the range."
          : "Valid CRT candle: body is larger than both wicks. CRT low sweep detected; Candle 3 has not closed back inside the range yet.",
      };
    }

    if (sweptHigh && !sweptLow) {
      return {
        direction: "SHORT",
        status: c3BackInside ? "CONFIRMED" : "FORMING",
        rangeHigh: c1.high,
        rangeLow: c1.low,
        midpoint,
        entry: c3.open,
        stop: c2.high,
        target1: midpoint,
        target2: c1.low,
        rangeTime: c1.time,
        manipulationTime: c2.time,
        distributionTime: c3.time,
        reason: c3BackInside
          ? "Valid CRT candle: body is larger than both wicks. Candle 2 swept the CRT high and Candle 3 returned inside the range."
          : "Valid CRT candle: body is larger than both wicks. CRT high sweep detected; Candle 3 has not closed back inside the range yet.",
      };
    }
  }

  return null;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}
