import type { Candle } from "./binance";
import { detectMss, type MssDirection, type MssSetup } from "./mss";

/**
 * In the supplied CRT Episode 3 transcript, "breaker" is explicitly used
 * to mean the true market-structure shift. This module keeps that terminology
 * explicit instead of substituting a generic ICT breaker/OB definition.
 */
export type BreakerSetup = MssSetup;

export function detectBreaker(
  candles: Candle[],
  direction: MssDirection,
  startTime: number,
): BreakerSetup | null {
  return detectMss(candles, direction, startTime);
}
