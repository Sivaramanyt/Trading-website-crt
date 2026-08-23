import type { Candle } from "./binance";
import { detectTurtleSoup, type TurtleSoupSetup } from "./turtleSoup";
import { detectMss, type MssSetup } from "./mss";

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
  mss: MssSetup | null;
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

function buildReason(base: string, soup: TurtleSoupSetup | null, mss: MssSetup | null): string {
  const parts = [base];
  if (soup) parts.push(`${soup.kind === "KOD" ? "Kiss of Death Turtle Soup" : "Turtle Soup"} ${soup.status.toLowerCase()} at ${soup.sweepLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`);
  if (mss) parts.push(`True MSS confirmed at ${mss.breakLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`);
  return parts.join(" ");
}

/**
 * 15M execution after validated 4H CRT/key-level setup.
 * Required sequence: Turtle Soup -> true MSS -> Model #1.
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
  const closed = candles.filter((c) => c.closed !== false && c.time >= startTime).sort((a, b) => a.time - b.time);
  if (closed.length < 4 || !Number.isFinite(keyLow) || !Number.isFinite(keyHigh)) return null;

  const turtleSoup = detectTurtleSoup(closed, direction, startTime, closed[closed.length - 1].time, rangeLow, rangeHigh);
  if (!turtleSoup) return null;

  const mss = detectMss(closed, direction, turtleSoup.time);
  if (!mss || mss.status !== "CONFIRMED") return null;

  const afterMss = closed.filter(c => c.time >= mss.breakTime);
  for (let i = afterMss.length - 2; i >= 0; i--) {
    const trigger = afterMss[i];
    const confirm = afterMss[i + 1];
    if (!thickBody(trigger) || !touchesKey(trigger, keyLow, keyHigh)) continue;

    if (direction === "LONG") {
      if (trigger.close >= trigger.open) continue;
      const confirmed = confirm.close > trigger.high;
      const base = confirmed
        ? "15M Model #1 confirmed after Turtle Soup and true MSS: thick down-close trigger mitigated the 4H key level and the next candle closed above the trigger."
        : "15M Model #1 forming after Turtle Soup and true MSS: thick down-close trigger mitigated the 4H key level; confirmation requires a close above the trigger.";
      return { direction, status: confirmed ? "CONFIRMED" : "FORMING", keyLevel: (keyLow + keyHigh) / 2, triggerHigh: trigger.high, triggerLow: trigger.low, entry: confirmed ? confirm.close : trigger.high, stop: trigger.low, triggerTime: trigger.time, confirmationTime: confirm.time, reason: buildReason(base, turtleSoup, mss), turtleSoup, mss };
    }

    if (trigger.close <= trigger.open) continue;
    const confirmed = confirm.close < trigger.low;
    const base = confirmed
      ? "15M Model #1 confirmed after Turtle Soup and true MSS: thick up-close trigger mitigated the 4H key level and the next candle closed below the trigger."
      : "15M Model #1 forming after Turtle Soup and true MSS: thick up-close trigger mitigated the 4H key level; confirmation requires a close below the trigger.";
    return { direction, status: confirmed ? "CONFIRMED" : "FORMING", keyLevel: (keyLow + keyHigh) / 2, triggerHigh: trigger.high, triggerLow: trigger.low, entry: confirmed ? confirm.close : trigger.low, stop: trigger.high, triggerTime: trigger.time, confirmationTime: confirm.time, reason: buildReason(base, turtleSoup, mss), turtleSoup, mss };
  }
  return null;
}
