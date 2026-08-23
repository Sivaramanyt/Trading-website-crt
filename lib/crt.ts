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
 * Foundational CRT detector for the first web version.
 *
 * The model follows the transcript/screenshot structure:
 * - Candle 1 defines the CRT range.
 * - Candle 2 sweeps one side of that range (manipulation).
 * - Candle 3 closes back inside the range (distribution).
 * - 50% of Candle 1 is Target 1 and the opposite range boundary is Target 2.
 * - A low sweep creates a bullish setup; a high sweep creates a bearish setup.
 *
 * This is intentionally conservative. Discretionary concepts such as key-level
 * quality, SMT, and full Model #1 confirmation are not silently guessed here.
 */
export function detectCrt(candles: Candle[]): CrtSetup | null {
  const closed = candles.filter((c) => c.closed !== false);
  if (closed.length < 3) return null;

  const c1 = closed[closed.length - 3];
  const c2 = closed[closed.length - 2];
  const c3 = closed[closed.length - 1];
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
        ? "Candle 2 swept the CRT low and Candle 3 returned inside the range."
        : "CRT low sweep detected; Candle 3 has not closed back inside the range yet.",
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
        ? "Candle 2 swept the CRT high and Candle 3 returned inside the range."
        : "CRT high sweep detected; Candle 3 has not closed back inside the range yet.",
    };
  }

  return null;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}
