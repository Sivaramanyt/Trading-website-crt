"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, LineSeries, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { getKlines, getLatestKlines, getLastPrice, type Candle } from "@/lib/binance";
import { detectCrt, formatPrice, type CrtSetup } from "@/lib/crt";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const chartTime = (n: number) => n as Time;

function horizontalData(candles: Candle[], from: number, value: number) {
  return candles.filter(c => c.time >= from).map(c => ({ time: chartTime(c.time), value }));
}

function mergeCandle(old: Candle[], next: Candle): Candle[] {
  const map = new Map(old.map(c => [c.time, c]));
  map.set(next.time, next);
  return [...map.values()].sort((a, b) => a.time - b.time).slice(-600);
}

export default function TradingTerminal() {
  const rootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tradeWsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [crt, setCrt] = useState<CrtSetup | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (s: string) => {
    setLoading(true); setError("");
    try {
      const [ltf, htf, lastPrice] = await Promise.all([
        getKlines(s, "15m", 500),
        getKlines(s, "4h", 200),
        getLastPrice(s),
      ]);
      if (!ltf.length || !htf.length) throw new Error("Binance Futures returned no candles.");
      setCandles(ltf);
      setPrice(lastPrice);
      setCrt(detectCrt(htf));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Binance Futures market data.");
      setStatus("offline");
    } finally { setLoading(false); }
  }, []);

  // Full history/HTF refresh once a minute. The much faster 5-second sync below
  // keeps the active 15m candle caught up even if the browser WebSocket stalls.
  useEffect(() => {
    void load(symbol);
    const id = window.setInterval(() => void load(symbol), 60_000);
    return () => window.clearInterval(id);
  }, [load, symbol]);

  useEffect(() => {
    let cancelled = false;

    const syncLatest = async () => {
      try {
        const latest = await getLatestKlines(symbol, "15m");
        if (!cancelled && latest.length) {
          setCandles(old => latest.reduce(mergeCandle, old));
          setPrice(latest[latest.length - 1].close);
          setError("");
        }
      } catch {
        // WebSocket remains the primary live path; REST is only a catch-up path.
      }
    };

    void syncLatest();
    const id = window.setInterval(() => void syncLatest(), 5_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [symbol]);

  useEffect(() => {
    wsRef.current?.close();
    tradeWsRef.current?.close();
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);

    let cancelled = false;
    let retry = 0;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");

      const ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_15m`);
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setStatus("live"); };
      ws.onmessage = e => {
        try {
          const k = JSON.parse(e.data)?.k;
          if (!k) return;
          const openTime = Number(k.t);
          if (!Number.isFinite(openTime)) return;
          const c: Candle = {
            time: Math.floor(openTime / 1000),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
            closed: Boolean(k.x),
          };
          setCandles(old => mergeCandle(old, c));
          setPrice(c.close);
        } catch {
          // Ignore malformed stream messages.
        }
      };
      ws.onerror = () => { setStatus("offline"); ws.close(); };
      ws.onclose = () => {
        if (cancelled) return;
        setStatus("offline");
        const delay = Math.min(1_000 * Math.pow(2, retry++), 15_000);
        reconnectRef.current = window.setTimeout(connect, delay);
      };

      const tradeWs = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@aggTrade`);
      tradeWsRef.current = tradeWs;
      tradeWs.onmessage = e => {
        try {
          const data = JSON.parse(e.data);
          const last = Number(data?.p);
          if (Number.isFinite(last)) setPrice(last);
        } catch {
          // Ignore malformed stream messages.
        }
      };
      tradeWs.onerror = () => tradeWs.close();
      tradeWs.onclose = () => {
        // The 5-second kline REST sync still keeps the chart current if the
        // trade quote socket is unavailable.
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      tradeWsRef.current?.close();
      wsRef.current = null;
      tradeWsRef.current = null;
    };
  }, [symbol]);

  useEffect(() => {
    if (!rootRef.current) return;
    const chart = createChart(rootRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#080b12" }, textColor: "#8d98aa" },
      grid: { vertLines: { color: "#151b25" }, horzLines: { color: "#151b25" } },
      crosshair: { vertLine: { color: "#465064", labelBackgroundColor: "#1d2635" }, horzLine: { color: "#465064", labelBackgroundColor: "#1d2635" } },
      rightPriceScale: { borderColor: "#202938" },
      timeScale: { borderColor: "#202938", timeVisible: true, secondsVisible: false, rightOffset: 2, barSpacing: 8, minBarSpacing: 2 },
      width: rootRef.current.clientWidth,
      height: 620,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#19c37d", downColor: "#ef5b6b", borderUpColor: "#19c37d", borderDownColor: "#ef5b6b", wickUpColor: "#19c37d", wickDownColor: "#ef5b6b",
    });

    chartRef.current = chart;
    candleRef.current = series;

    const ro = new ResizeObserver(() => {
      if (rootRef.current) chart.applyOptions({ width: rootRef.current.clientWidth });
    });
    ro.observe(rootRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; candleRef.current = null; };
  }, []);

  useEffect(() => {
    if (!candleRef.current || !candles.length) return;
    candleRef.current.setData(candles.map(c => ({ time: chartTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const chart = chartRef.current; if (!chart || !candles.length) return;
    const holder = chart as IChartApi & { crtLines?: ISeriesApi<"Line">[] };
    holder.crtLines?.forEach(s => chart.removeSeries(s)); holder.crtLines = [];
    if (!crt) return;
    const levels = [[crt.rangeHigh, "#55d6be", "CRT HIGH"], [crt.midpoint, "#f5c451", "50%"], [crt.rangeLow, "#55d6be", "CRT LOW"], [crt.entry, "#7c8cff", "ENTRY"], [crt.stop, "#ef5b6b", "SL"]] as const;
    for (const [value, color, title] of levels) {
      const line = chart.addSeries(LineSeries, { color, lineWidth: title === "50%" ? 2 : 1, lineStyle: title === "50%" ? 2 : 0, title, priceLineVisible: false, lastValueVisible: true });
      line.setData(horizontalData(candles, crt.rangeTime, value));
      holder.crtLines.push(line);
    }
  }, [candles, crt]);

  return <main className="terminal-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">C</div><div><div className="brand-title">CRT Terminal</div><div className="brand-subtitle">Crypto Range Trading</div></div></div>
      <div className="market-picker"><label htmlFor="symbol">Futures Market</label><select id="symbol" value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOLS.map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="connection"><span className={`status-dot ${status}`} />{status === "live" ? "BINANCE FUTURES LIVE" : status === "connecting" ? "CONNECTING" : "OFFLINE"}</div>
    </header>
    <section className="market-strip"><div><div className="eyebrow">BINANCE USDⓈ-M FUTURES</div><h1>{symbol}</h1></div><div className="quote-block"><div className="price">{price == null ? "—" : formatPrice(price)}</div><div className="quote-note">15m real-time futures candle stream · last trade</div></div><div className="tf-stack"><span className="tf active">15m</span><span className="tf">HTF 4h</span></div></section>
    <section className="workspace">
      <div className="chart-card"><div className="chart-toolbar"><div><span className="toolbar-title">Futures price action</span><span className="toolbar-muted">15 minute execution chart · USDⓈ-M perpetual market</span></div><div className="toolbar-badges"><span className="badge">HTF: 4H</span><span className="badge">LTF: 15M</span><span className="badge live-badge">LIVE</span></div></div><div className="chart-wrap">{loading && <div className="chart-overlay">Loading Binance Futures candles…</div>}<div ref={rootRef} className="chart" /></div></div>
      <aside className="side-panel"><div className="panel-header"><div><div className="eyebrow">CRT ANALYSIS</div><h2>{crt ? `${crt.direction} SETUP` : "WAITING"}</h2></div><span className={`signal-pill ${crt?.direction?.toLowerCase() ?? "neutral"}`}>{crt?.status ?? "NO SETUP"}</span></div>
        {crt ? <><div className="setup-banner"><div className="setup-icon">{crt.direction === "LONG" ? "↗" : "↘"}</div><div><strong>{crt.direction === "LONG" ? "Bullish CRT" : "Bearish CRT"}</strong><p>{crt.reason}</p></div></div><div className="levels"><Level label="Entry" value={crt.entry}/><Level label="Stop Loss" value={crt.stop} danger/><Level label="Target 1 · 50%" value={crt.target1}/><Level label="Target 2 · CRT edge" value={crt.target2}/></div><div className="range-card"><div className="range-title">4H CRT RANGE</div><div className="range-row"><span>High</span><b>{formatPrice(crt.rangeHigh)}</b></div><div className="range-mid"><span>50%</span><b>{formatPrice(crt.midpoint)}</b></div><div className="range-row"><span>Low</span><b>{formatPrice(crt.rangeLow)}</b></div></div><div className="disclaimer"><b>Strategy engine v0.1</b><span>Core Candle 1 → sweep → Candle 3 return model is automated. Key-level quality, SMT and full Model #1 confirmation are not auto-approved yet.</span></div></> : <div className="empty-state"><div className="empty-icon">⌁</div><h3>No confirmed CRT</h3><p>The latest closed 4H candles do not currently match the foundational sweep-and-return pattern.</p></div>}
      </aside>
    </section>
    {error && <div className="error-bar">{error}</div>}
    <footer className="footer"><span>Public Binance USDⓈ-M Futures market data · no API key required for this market-data-only build.</span><span>Educational / backtesting software — not financial advice.</span></footer>
  </main>;
}

function Level({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="level-row"><span>{label}</span><b className={danger ? "danger-text" : ""}>{formatPrice(value)}</b></div>;
}
