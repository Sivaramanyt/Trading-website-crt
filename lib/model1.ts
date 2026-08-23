import type { Candle } from "./binance";
import { detectTurtleSoup, type TurtleSoupSetup } from "./turtleSoup";

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
  turtleSoup: TurtleSoupSetup | null;
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

function buildReason(base: string, soup: TurtleSoupSetup | null): string {
  if (!soup) return base;
  return `${base} ${soup.kind === "KOD" ? "Kiss of Death Turtle Soup" : "Turtle Soup"} ${soup.status.toLowerCase()} at ${soup.sweepLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`;
}

/**
 * 15M execution confirmation after a 4H CRT has been validated at a key level.
 * The transcript describes the lower-timeframe journey as Turtle Soup -> Model #1
 * (and later KOD before the CRT target). We expose the latest transcript-grounded
 * Turtle Soup/KOD observation alongside Model #1.
 */
export function detectModelOne(
  candles: Candle[],
  keyLow: number,
  keyHigh: number,
  direction: "LONG" | "SHORT",
  startTime = 0,
  rangeLow?: number,
  rangeHigh?: number,
): ModelOneSetup | null {
  const closed = candles
    .filter((c) => c.closed !== false && c.time >= startTime)
    .sort((a, b) => a.time - b.time);
  if (closed.length < 2 || !Number.isFinite(keyLow) || !Number.isFinite(keyHigh)) return null;

  const turtleSoup = detectTurtleSoup(
    closed,
    direction,
    startTime,
    closed[closed.length - 1].time,
    rangeLow,
    rangeHigh,
  );

  for (let i = closed.length - 2; i >= 0; i--) {
    const trigger = closed[i];
    const confirm = closed[i + 1];
    if (!thickBody(trigger)) continue;
    if (!touchesKey(trigger, keyLow, keyHigh)) continue;

    if (direction === "LONG") {
      if (trigger.close >= trigger.open) continue;
      const confirmed = confirm.close > trigger.high;
      const base = confirmed
        ? "15M Model #1 confirmed: a thick down-close candle mitigated the 4H key level and the next candle closed above the trigger candle."
        : "15M Model #1 forming: a thick down-close candle mitigated the 4H key level; confirmation requires a close above the trigger candle.";
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
        reason: buildReason(base, turtleSoup),
        turtleSoup,
      };
    }

    if (trigger.close <= trigger.open) continue;
    const confirmed = confirm.close < trigger.low;
    const base = confirmed
      ? "15M Model #1 confirmed: a thick up-close candle mitigated the 4H key level and the next candle closed below the trigger candle."
      : "15M Model #1 forming: a thick up-close candle mitigated the 4H key level; confirmation requires a close below the trigger candle.";
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
      reason: buildReason(base, turtleSoup),
      turtleSoup,
    };
  }

  return null;
}
