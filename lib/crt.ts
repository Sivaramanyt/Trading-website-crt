import type { Candle } from "./binance";

export type KeyLevelType = "PREVIOUS_HIGH" | "PREVIOUS_LOW" | "FVG" | "IFVG" | "ORDER_BLOCK";

export type KeyLevel = {
  type: KeyLevelType;
  label: string;
  low: number;
  high: number;
  time: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
};

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
  keyLevel: number;
  keyLevelType: KeyLevelType;
  keyLevelLabel: string;
  keyLevelTime: number;
  reason: string;
};

function bodyIsLargerThanWicks(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return body > 0 && body > upperWick && body > lowerWick;
}

function overlaps(c: Candle, low: number, high: number): boolean {
  return c.high >= low && c.low <= high;
}

function pointTouches(c: Candle, level: number): boolean {
  return c.low <= level && c.high >= level;
}

/**
 * Build the key levels used by the 4H CRT gate.
 *
 * User-specified key levels:
 * - previous high / previous low
 * - FVG
 * - IFVG
 * - order block
 *
 * A key level is represented as a price point or a price zone. The detector
 * only uses historical information before the candidate CRT candle, avoiding
 * future-looking levels.
 */
export function detectKeyLevels(candles: Candle[], beforeTime: number): KeyLevel[] {
  const closed = candles
    .filter((c) => c.closed !== false && c.time < beforeTime)
    .sort((a, b) => a.time - b.time);

  const levels: KeyLevel[] = [];
  if (!closed.length) return levels;

  // Previous highs/lows: every historical candle boundary is a candidate.
  // More recent levels are evaluated first by the CRT detector.
  for (let i = closed.length - 1; i >= Math.max(0, closed.length - 80); i--) {
    const c = closed[i];
    levels.push({ type: "PREVIOUS_HIGH", label: "Previous High", low: c.high, high: c.high, time: c.time, direction: "BEARISH" });
    levels.push({ type: "PREVIOUS_LOW", label: "Previous Low", low: c.low, high: c.low, time: c.time, direction: "BULLISH" });
  }

  // Three-candle FVGs. The gap is between candle 1 and candle 3.
  for (let i = closed.length - 3; i >= 0; i--) {
    const a = closed[i];
    const b = closed[i + 1];
    const c = closed[i + 2];
    if (c.low > a.high) {
      levels.push({ type: "FVG", label: "Bullish FVG", low: a.high, high: c.low, time: b.time, direction: "BULLISH" });
    }
    if (c.high < a.low) {
      levels.push({ type: "FVG", label: "Bearish FVG", low: c.high, high: a.low, time: b.time, direction: "BEARISH" });
    }
  }

  // IFVG: an existing FVG that was subsequently crossed through by a close.
  // The resulting zone keeps the original FVG boundaries.
  for (const fvg of levels.filter((l) => l.type === "FVG")) {
    const later = closed.filter((c) => c.time > fvg.time);
    const invalidated = fvg.direction === "BULLISH"
      ? later.some((c) => c.close < fvg.low)
      : later.some((c) => c.close > fvg.high);
    if (invalidated) {
      levels.push({
        type: "IFVG",
        label: fvg.direction === "BULLISH" ? "Bearish IFVG" : "Bullish IFVG",
        low: fvg.low,
        high: fvg.high,
        time: fvg.time,
        direction: fvg.direction === "BULLISH" ? "BEARISH" : "BULLISH",
      });
    }
  }

  // Order block: the last opposite-close candle immediately before a strong
  // three-candle displacement that leaves an FVG. This is intentionally
  // conservative and only uses candles already closed before the CRT candle.
  for (let i = 1; i < closed.length - 2; i++) {
    const ob = closed[i];
    const n1 = closed[i + 1];
    const n2 = closed[i + 2];
    const n3 = closed[i + 3];
    const body = Math.abs(n2.close - n2.open);
    const avgBody = (Math.abs(n1.close - n1.open) + Math.abs(n3.close - n3.open)) / 2;
    const strong = body > 0 && body >= avgBody;
    if (!strong) continue;

    if (n2.close > n2.open && ob.close < ob.open && n3.low > n1.high) {
      levels.push({ type: "ORDER_BLOCK", label: "Bullish Order Block", low: ob.low, high: ob.high, time: ob.time, direction: "BULLISH" });
    }
    if (n2.close < n2.open && ob.close > ob.open && n3.high < n1.low) {
      levels.push({ type: "ORDER_BLOCK", label: "Bearish Order Block", low: ob.low, high: ob.high, time: ob.time, direction: "BEARISH" });
    }
  }

  return levels;
}

function findMitigatedKeyLevel(candles: Candle[], c1: Candle, c2: Candle, direction: "LONG" | "SHORT"): KeyLevel | null {
  const levels = detectKeyLevels(candles, c1.time);
  const candidates = levels.filter((level) => {
    // The CRT must be formed on / mitigate a key level with directional relevance.
    const directional = direction === "LONG"
      ? level.direction === "BULLISH" || level.type === "PREVIOUS_LOW"
      : level.direction === "BEARISH" || level.type === "PREVIOUS_HIGH";
    if (!directional) return false;
    return overlaps(c1, level.low, level.high) || overlaps(c2, level.low, level.high) || pointTouches(c1, level.low) || pointTouches(c1, level.high) || pointTouches(c2, level.low) || pointTouches(c2, level.high);
  });

  // Prefer the most recent level, then the narrower/more precise level.
  candidates.sort((a, b) => {
    if (b.time !== a.time) return b.time - a.time;
    return (a.high - a.low) - (b.high - b.low);
  });
  return candidates[0] ?? null;
}

/**
 * 4H CRT detector with the required two-stage gate:
 *
 * 1. Find a qualifying CRT candle (body > upper wick AND body > lower wick).
 * 2. Confirm that Candle 1 OR Candle 2 actually mitigates/forms on one of the
 *    supplied key levels: previous H/L, FVG, IFVG or order block.
 * 3. Only then allow the CRT to proceed to the lower-timeframe stage.
 *
 * Candle 2 is still the manipulation candle and Candle 3 is the execution
 * candle. The supplied CRT material emphasizes pairing CRT with a key level
 * and then evaluating the lower timeframe. fileciteturn75file4L356-L375
 */
export function detectCrt(candles: Candle[]): CrtSetup | null {
  const closed = candles.filter((c) => c.closed !== false).sort((a, b) => a.time - b.time);
  if (closed.length < 3) return null;

  for (let i = closed.length - 3; i >= 1; i--) {
    const c1 = closed[i];
    const c2 = closed[i + 1];
    const c3 = closed[i + 2];

    if (!bodyIsLargerThanWicks(c1)) continue;

    const midpoint = (c1.high + c1.low) / 2;
    const sweptLow = c2.low < c1.low;
    const sweptHigh = c2.high > c1.high;
    const c3BackInside = c3.close > c1.low && c3.close < c1.high;

    if (sweptLow && !sweptHigh) {
      const key = findMitigatedKeyLevel(closed, c1, c2, "LONG");
      if (!key) continue;
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
        keyLevel: (key.low + key.high) / 2,
        keyLevelType: key.type,
        keyLevelLabel: key.label,
        keyLevelTime: key.time,
        reason: c3BackInside
          ? `4H CRT valid: Candle 1 body is larger than both wicks; Candle 1/2 mitigated ${key.label}; Candle 2 swept the CRT low and Candle 3 returned inside.`
          : `4H CRT forming: Candle 1 body is larger than both wicks; Candle 1/2 mitigated ${key.label}; CRT low sweep detected.`,
      };
    }

    if (sweptHigh && !sweptLow) {
      const key = findMitigatedKeyLevel(closed, c1, c2, "SHORT");
      if (!key) continue;
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
        keyLevel: (key.low + key.high) / 2,
        keyLevelType: key.type,
        keyLevelLabel: key.label,
        keyLevelTime: key.time,
        reason: c3BackInside
          ? `4H CRT valid: Candle 1 body is larger than both wicks; Candle 1/2 mitigated ${key.label}; Candle 2 swept the CRT high and Candle 3 returned inside.`
          : `4H CRT forming: Candle 1 body is larger than both wicks; Candle 1/2 mitigated ${key.label}; CRT high sweep detected.`,
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
