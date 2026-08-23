import type { Candle } from "./binance";

export type KeyLevelType = "OLD_HIGH" | "OLD_LOW" | "FVG" | "IFVG" | "ORDER_BLOCK";
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
  keyLevelLow: number;
  keyLevelHigh: number;
  keyLevelType: KeyLevelType;
  keyLevelLabel: string;
  keyLevelTime: number;
  reason: string;
};

function bodyIsLargerThanWicks(c: Candle) {
  const body = Math.abs(c.close - c.open);
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  return body > 0 && body > upper && body > lower;
}

function overlaps(c: Candle, low: number, high: number) {
  return c.high >= low && c.low <= high;
}

function oldLowWasSwept(c: Candle, level: number) {
  // Sweep below the old low, then reclaim it.
  return c.low < level && c.close >= level;
}

function oldHighWasSwept(c: Candle, level: number) {
  // Sweep above the old high, then reject back below it.
  return c.high > level && c.close <= level;
}

export function detectKeyLevels(candles: Candle[], beforeTime: number): KeyLevel[] {
  const closed = candles
    .filter((c) => c.closed !== false && c.time < beforeTime)
    .sort((a, b) => a.time - b.time);

  if (!closed.length) return [];

  const levels: KeyLevel[] = [];

  for (let i = closed.length - 1; i >= Math.max(0, closed.length - 80); i--) {
    const c = closed[i];
    levels.push({
      type: "OLD_HIGH",
      label: "Old High",
      low: c.high,
      high: c.high,
      time: c.time,
      direction: "BEARISH",
    });
    levels.push({
      type: "OLD_LOW",
      label: "Old Low",
      low: c.low,
      high: c.low,
      time: c.time,
      direction: "BULLISH",
    });
  }

  for (let i = 0; i < closed.length - 3; i++) {
    const a = closed[i];
    const b = closed[i + 1];
    const c = closed[i + 2];

    if (c.low > a.high) {
      levels.push({
        type: "FVG",
        label: "Bullish FVG",
        low: a.high,
        high: c.low,
        time: b.time,
        direction: "BULLISH",
      });
    }

    if (c.high < a.low) {
      levels.push({
        type: "FVG",
        label: "Bearish FVG",
        low: c.high,
        high: a.low,
        time: b.time,
        direction: "BEARISH",
      });
    }
  }

  for (const fvg of levels.filter((l) => l.type === "FVG")) {
    const later = closed.filter((c) => c.time > fvg.time);
    const invalidated =
      fvg.direction === "BULLISH"
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

  for (let i = 1; i < closed.length - 3; i++) {
    const ob = closed[i];
    const n1 = closed[i + 1];
    const n2 = closed[i + 2];
    const n3 = closed[i + 3];
    const body = Math.abs(n2.close - n2.open);
    const avg = (Math.abs(n1.close - n1.open) + Math.abs(n3.close - n3.open)) / 2;

    if (!(body > 0 && body >= avg)) continue;

    if (n2.close > n2.open && ob.close < ob.open && n3.low > n1.high) {
      levels.push({
        type: "ORDER_BLOCK",
        label: "Bullish Order Block",
        low: ob.low,
        high: ob.high,
        time: ob.time,
        direction: "BULLISH",
      });
    }

    if (n2.close < n2.open && ob.close > ob.open && n3.high < n1.low) {
      levels.push({
        type: "ORDER_BLOCK",
        label: "Bearish Order Block",
        low: ob.low,
        high: ob.high,
        time: ob.time,
        direction: "BEARISH",
      });
    }
  }

  return levels;
}

function findMitigatedKeyLevel(
  candles: Candle[],
  crtCandle: Candle,
  sweepCandle: Candle,
  direction: "LONG" | "SHORT",
): KeyLevel | null {
  const levels = detectKeyLevels(candles, crtCandle.time);

  const candidates = levels.filter((level) => {
    const directional =
      direction === "LONG"
        ? level.direction === "BULLISH" || level.type === "OLD_LOW"
        : level.direction === "BEARISH" || level.type === "OLD_HIGH";

    if (!directional) return false;

    // Old High / Old Low are special: they MUST actually be swept.
    // Merely touching or overlapping an old level is not enough.
    if (level.type === "OLD_LOW") {
      return oldLowWasSwept(sweepCandle, level.low);
    }

    if (level.type === "OLD_HIGH") {
      return oldHighWasSwept(sweepCandle, level.high);
    }

    // FVG / IFVG / Order Block: mitigation/touch is sufficient here.
    return overlaps(crtCandle, level.low, level.high) || overlaps(sweepCandle, level.low, level.high);
  });

  candidates.sort((a, b) => b.time - a.time || (a.high - a.low) - (b.high - b.low));
  return candidates[0] ?? null;
}

export function detectCrt(candles: Candle[]): CrtSetup | null {
  const closed = candles
    .filter((c) => c.closed !== false)
    .sort((a, b) => a.time - b.time);

  // We can identify a CRT as soon as the CRT candle and its following
  // manipulation/sweep candle are closed. Do not wait for a third candle.
  if (closed.length < 2) return null;

  for (let i = closed.length - 2; i >= 1; i--) {
    const c1 = closed[i];
    const c2 = closed[i + 1];

    // The CRT candle itself must have a body larger than BOTH wicks.
    if (!bodyIsLargerThanWicks(c1)) continue;

    const midpoint = (c1.high + c1.low) / 2;
    const sweptLow = c2.low < c1.low;
    const sweptHigh = c2.high > c1.high;

    if (sweptLow && !sweptHigh) {
      const key = findMitigatedKeyLevel(closed, c1, c2, "LONG");
      if (!key) continue;

      const reclaimed = c2.close >= c1.low;
      return {
        direction: "LONG",
        status: reclaimed ? "CONFIRMED" : "FORMING",
        rangeHigh: c1.high,
        rangeLow: c1.low,
        midpoint,
        entry: c2.close,
        stop: c2.low,
        target1: midpoint,
        target2: c1.high,
        rangeTime: c1.time,
        manipulationTime: c2.time,
        distributionTime: c2.time,
        keyLevel: (key.low + key.high) / 2,
        keyLevelLow: key.low,
        keyLevelHigh: key.high,
        keyLevelType: key.type,
        keyLevelLabel: key.label,
        keyLevelTime: key.time,
        reason: reclaimed
          ? `4H CRT confirmed: CRT candle body is larger than both wicks; ${key.label} was swept below and reclaimed; the following candle swept the CRT low and returned inside.`
          : `4H CRT forming: CRT candle body is larger than both wicks; ${key.label} was swept below; waiting for reclaim.`
      };
    }

    if (sweptHigh && !sweptLow) {
      const key = findMitigatedKeyLevel(closed, c1, c2, "SHORT");
      if (!key) continue;

      const rejected = c2.close <= c1.high;
      return {
        direction: "SHORT",
        status: rejected ? "CONFIRMED" : "FORMING",
        rangeHigh: c1.high,
        rangeLow: c1.low,
        midpoint,
        entry: c2.close,
        stop: c2.high,
        target1: midpoint,
        target2: c1.low,
        rangeTime: c1.time,
        manipulationTime: c2.time,
        distributionTime: c2.time,
        keyLevel: (key.low + key.high) / 2,
        keyLevelLow: key.low,
        keyLevelHigh: key.high,
        keyLevelType: key.type,
        keyLevelLabel: key.label,
        keyLevelTime: key.time,
        reason: rejected
          ? `4H CRT confirmed: CRT candle body is larger than both wicks; ${key.label} was swept above and rejected; the following candle swept the CRT high and returned inside.`
          : `4H CRT forming: CRT candle body is larger than both wicks; ${key.label} was swept above; waiting for rejection.`
      };
    }
  }

  return null;
}

export function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}
