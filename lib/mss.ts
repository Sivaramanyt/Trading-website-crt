import type { Candle } from "./binance";

export type MssDirection = "LONG" | "SHORT";
export type MssSetup = {
  direction: MssDirection;
  status: "CONFIRMED" | "FORMING";
  pivotLow: number;
  pivotHigh: number;
  breakLevel: number;
  breakTime: number;
  pivotTime: number;
  reason: string;
};

function pivotLow(c: Candle[], i: number): boolean {
  return i > 0 && i < c.length - 1 && c[i].low < c[i - 1].low && c[i].low <= c[i + 1].low;
}
function pivotHigh(c: Candle[], i: number): boolean {
  return i > 0 && i < c.length - 1 && c[i].high > c[i - 1].high && c[i].high >= c[i + 1].high;
}

/**
 * Transcript-grounded true market-structure shift.
 * Bullish example: Low -> High -> Lower Low -> break above that High.
 * Bearish is the mirror image.
 * Only closed candles after the 4H distribution time are considered.
 */
export function detectMss(
  candles: Candle[],
  direction: MssDirection,
  startTime: number,
): MssSetup | null {
  const c = candles.filter(x => x.closed !== false && x.time >= startTime).sort((a,b)=>a.time-b.time);
  if (c.length < 4) return null;

  if (direction === "LONG") {
    for (let i = c.length - 1; i >= 3; i--) {
      const p1 = i - 2, p2 = i - 1;
      const lowIndex = pivotLow(c, p2) ? p2 : pivotLow(c, p1) ? p1 : -1;
      if (lowIndex < 0) continue;
      const priorHighCandidates: number[] = [];
      for (let j = 1; j < lowIndex; j++) if (pivotHigh(c, j)) priorHighCandidates.push(j);
      if (!priorHighCandidates.length) continue;
      const highIndex = priorHighCandidates[priorHighCandidates.length - 1];
      if (c[lowIndex].low >= c[highIndex].low) continue;
      const currentCandle = c[i];
      if (currentCandle.close > c[highIndex].high) return { direction, status:"CONFIRMED", pivotLow:c[lowIndex].low, pivotHigh:c[highIndex].high, breakLevel:c[highIndex].high, breakTime:currentCandle.time, pivotTime:c[lowIndex].time, reason:"Bullish MSS: a low formed, price made a lower low, then a closed candle broke above the intervening swing high." };
      if (i === c.length - 1 && currentCandle.high > c[highIndex].high) return { direction, status:"FORMING", pivotLow:c[lowIndex].low, pivotHigh:c[highIndex].high, breakLevel:c[highIndex].high, breakTime:currentCandle.time, pivotTime:c[lowIndex].time, reason:"Bullish MSS forming: price has attacked the intervening swing high but has not closed above it." };
    }
  } else {
    for (let i = c.length - 1; i >= 3; i--) {
      const p1 = i - 2, p2 = i - 1;
      const highIndex = pivotHigh(c, p2) ? p2 : pivotHigh(c, p1) ? p1 : -1;
      if (highIndex < 0) continue;
      const priorLowCandidates: number[] = [];
      for (let j = 1; j < highIndex; j++) if (pivotLow(c, j)) priorLowCandidates.push(j);
      if (!priorLowCandidates.length) continue;
      const lowIndex = priorLowCandidates[priorLowCandidates.length - 1];
      if (c[highIndex].high <= c[lowIndex].high) continue;
      const currentCandle = c[i];
      if (currentCandle.close < c[lowIndex].low) return { direction, status:"CONFIRMED", pivotLow:c[lowIndex].low, pivotHigh:c[highIndex].high, breakLevel:c[lowIndex].low, breakTime:currentCandle.time, pivotTime:c[highIndex].time, reason:"Bearish MSS: a high formed, price made a higher high, then a closed candle broke below the intervening swing low." };
      if (i === c.length - 1 && currentCandle.low < c[lowIndex].low) return { direction, status:"FORMING", pivotLow:c[lowIndex].low, pivotHigh:c[highIndex].high, breakLevel:c[lowIndex].low, breakTime:currentCandle.time, pivotTime:c[highIndex].time, reason:"Bearish MSS forming: price has attacked the intervening swing low but has not closed below it." };
    }
  }
  return null;
}
