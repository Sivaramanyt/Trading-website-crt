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

/**
 * Model #1 implementation based only on the supplied CRT material.
 *
 * Bullish: an old low/key level is stabbed by a thick down-close candle,
 * followed by a close above that trigger candle.
 * Bearish: an old high/key level is stabbed by a thick up-close candle,
 * followed by a close below that trigger candle.
 *
 * The trigger candle is required to have a body larger than both wicks,
 * matching the candle-selectivity rule supplied for this project.
 */
export function detectModelOne(
  candles: Candle[],
  keyLevel: number,
  direction: "LONG" | "SHORT",
): ModelOneSetup | null {
  const closed = candles.filter((c) => c.closed !== false);
  if (closed.length < 2 || !Number.isFinite(keyLevel)) return null;

  for (let i = closed.length - 2; i >= 0; i--) {
    const trigger = closed[i];
    const confirm = closed[i + 1];
    if (!thickBody(trigger)) continue;

    if (direction === "LONG") {
      const downClose = trigger.close < trigger.open;
      const stabbedLevel = trigger.low <= keyLevel;
      if (!downClose || !stabbedLevel) continue;

      const confirmed = confirm.close > trigger.high;
      return {
        direction,
        status: confirmed ? "CONFIRMED" : "FORMING",
        keyLevel,
        triggerHigh: trigger.high,
        triggerLow: trigger.low,
        entry: confirmed ? confirm.close : trigger.high,
        stop: trigger.low,
        triggerTime: trigger.time,
        confirmationTime: confirm.time,
        reason: confirmed
          ? "Model #1: a thick down-close candle stabbed the key low and the next candle closed above the trigger candle."
          : "Model #1 forming: a thick down-close candle stabbed the key low; confirmation requires a close above the trigger candle.",
      };
    }

    const upClose = trigger.close > trigger.open;
    const stabbedLevel = trigger.high >= keyLevel;
    if (!upClose || !stabbedLevel) continue;

    const confirmed = confirm.close < trigger.low;
    return {
      direction,
      status: confirmed ? "CONFIRMED" : "FORMING",
      keyLevel,
      triggerHigh: trigger.high,
      triggerLow: trigger.low,
      entry: confirmed ? confirm.close : trigger.low,
      stop: trigger.high,
      triggerTime: trigger.time,
      confirmationTime: confirm.time,
      reason: confirmed
        ? "Model #1: a thick up-close candle stabbed the key high and the next candle closed below the trigger candle."
        : "Model #1 forming: a thick up-close candle stabbed the key high; confirmation requires a close below the trigger candle.",
    };
  }

  return null;
}
