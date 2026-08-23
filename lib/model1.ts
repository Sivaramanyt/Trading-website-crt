import type { Candle } from "./binance";

export type ModelOneSetup = {
  direction: "LONG" | "SHORT";
  status: "CONFIRMED" | "FORMING";
  keyLevel: number;
  triggerHigh: number;
  triggerLow: number;
  entry: number;
  stop: number;
  triggerTime: number;
  confirmationTime: number;
  reason: string;
};

function thickBody(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return body > 0 && body > upperWick && body > lowerWick;
}

function touchesKey(c: Candle, keyLow: number, keyHigh: number): boolean {
  return c.low <= keyHigh && c.high >= keyLow;
}

/**
 * 15M execution confirmation after a 4H CRT has been validated at a key level.
 *
 * The lower timeframe is only searched from the 4H CRT distribution candle
 * forward, so older 15M patterns cannot create a signal for a newer 4H CRT.
 *
 * Bullish Model #1: a thick down-close candle attacks the bullish key zone,
 * then the next candle closes above the trigger candle.
 * Bearish Model #1: a thick up-close candle attacks the bearish key zone,
 * then the next candle closes below the trigger candle.
 */
export function detectModelOne(
  candles: Candle[],
  keyLow: number,
  keyHigh: number,
  direction: "LONG" | "SHORT",
  startTime = 0,
): ModelOneSetup | null {
  const closed = candles
    .filter((c) => c.closed !== false && c.time >= startTime)
    .sort((a, b) => a.time - b.time);
  if (closed.length < 2 || !Number.isFinite(keyLow) || !Number.isFinite(keyHigh)) return null;

  for (let i = closed.length - 2; i >= 0; i--) {
    const trigger = closed[i];
    const confirm = closed[i + 1];
    if (!thickBody(trigger)) continue;
    if (!touchesKey(trigger, keyLow, keyHigh)) continue;

    if (direction === "LONG") {
      if (trigger.close >= trigger.open) continue;
      const confirmed = confirm.close > trigger.high;
      return {
        direction,
        status: confirmed ? "CONFIRMED" : "FORMING",
        keyLevel: (keyLow + keyHigh) / 2,
        triggerHigh: trigger.high,
        triggerLow: trigger.low,
        entry: confirmed ? confirm.close : trigger.high,
        stop: trigger.low,
        triggerTime: trigger.time,
        confirmationTime: confirm.time,
        reason: confirmed
          ? "15M Model #1 confirmed: a thick down-close candle mitigated the 4H key level and the next candle closed above the trigger candle."
          : "15M Model #1 forming: a thick down-close candle mitigated the 4H key level; confirmation requires a close above the trigger candle.",
      };
    }

    if (trigger.close <= trigger.open) continue;
    const confirmed = confirm.close < trigger.low;
    return {
      direction,
      status: confirmed ? "CONFIRMED" : "FORMING",
      keyLevel: (keyLow + keyHigh) / 2,
      triggerHigh: trigger.high,
      triggerLow: trigger.low,
      entry: confirmed ? confirm.close : trigger.low,
      stop: trigger.high,
      triggerTime: trigger.time,
      confirmationTime: confirm.time,
      reason: confirmed
        ? "15M Model #1 confirmed: a thick up-close candle mitigated the 4H key level and the next candle closed below the trigger candle."
        : "15M Model #1 forming: a thick up-close candle mitigated the 4H key level; confirmation requires a close below the trigger candle.",
    };
  }

  return null;
}
