# CRT Trading Website

A Next.js/Vercel crypto trading terminal using public Binance market data, a 15-minute execution chart, a 4-hour higher-timeframe CRT detector, and a first-pass CRT overlay.

## Current version

- Binance Spot public REST candles for initial history.
- Binance market-data WebSocket for live 15m candles.
- 4H HTF + 15M LTF configuration.
- CRT high / low / 50% / entry / stop overlays.
- Foundational Candle 1 → sweep → Candle 3 return detector.
- BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT and XRPUSDT selectors.
- No Binance API key is required for this market-data-only version.

## Important strategy note

This is **CRT strategy engine v0.1**, not a claim that every rule from the supplied Episode 1–10 material has been automated. Key-level quality, SMT and the complete Model #1 confirmation are deliberately left as later modules so that we do not invent discretionary rules.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Vercel

Import this repository into Vercel. No environment variables are required for the current public-market-data version. Vercel automatically detects the Next.js application.

The browser connects to Binance's market-data stream while the Next.js route proxies historical public candles. Binance documents public market data as unauthenticated (`NONE`) and provides dedicated market-data endpoints/streams.

## Next modules

1. Exact CRT rule specification from all supplied transcripts/screenshots.
2. Key-level engine.
3. Turtle Soup / KOD detection.
4. Model #1 confirmation.
5. SMT engine with selectable correlated crypto pairs.
6. Backtesting engine with historical results.
7. Alerts and optional paper-trading workflow.
8. Broker/exchange execution only after the signal engine is validated.
