import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

const TIMEFRAMES = ['1m', '5m', '1h', '1d'];

// ── RSI calculation ────────────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  const rsi = [];
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }
  return rsi;
}

// ── MA calculation ─────────────────────────────────────────
function calcMA(data, period = 20) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
    result.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
  }
  return result;
}

const CHART_OPTS = {
  layout: {
    background: { color: '#1a1e2b' },
    textColor: '#8892aa',
  },
  grid: {
    vertLines: { color: '#2a2f42' },
    horzLines: { color: '#2a2f42' },
  },
  crosshair: { mode: 1 },
  timeScale: {
    borderColor: '#2a2f42',
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: { borderColor: '#2a2f42' },
  handleScroll: true,
  handleScale: true,
};

export default function Chart({ ticker, priceData }) {
  const mainRef = useRef(null);
  const rsiRef = useRef(null);
  const mainChartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const maSeriesRef = useRef(null);
  const rsiSeriesRef = useRef(null);
  const volSeriesRef = useRef(null);

  const [timeframe, setTimeframe] = useState('1d');
  const [loading, setLoading] = useState(false);

  // ── Create charts ──────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current || !rsiRef.current) return;

    // Main chart
    const main = createChart(mainRef.current, {
      ...CHART_OPTS,
      width: mainRef.current.clientWidth,
      height: mainRef.current.clientHeight,
    });

    const candles = main.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const ma = main.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // RSI chart
    const rsi = createChart(rsiRef.current, {
      ...CHART_OPTS,
      width: rsiRef.current.clientWidth,
      height: rsiRef.current.clientHeight,
      timeScale: { ...CHART_OPTS.timeScale, visible: false },
      rightPriceScale: { ...CHART_OPTS.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    });

    const rsiLine = rsi.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    mainChartRef.current = main;
    rsiChartRef.current = rsi;
    candleSeriesRef.current = candles;
    maSeriesRef.current = ma;
    rsiSeriesRef.current = rsiLine;

    // Sync time scales
    main.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) rsi.timeScale().setVisibleLogicalRange(range);
    });
    rsi.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) main.timeScale().setVisibleLogicalRange(range);
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (mainRef.current) main.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight });
      if (rsiRef.current) rsi.applyOptions({ width: rsiRef.current.clientWidth, height: rsiRef.current.clientHeight });
    });
    ro.observe(mainRef.current);
    ro.observe(rsiRef.current);

    return () => {
      ro.disconnect();
      main.remove();
      rsi.remove();
    };
  }, []);

  // ── Load & render data ─────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!ticker || !candleSeriesRef.current) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/history?ticker=${ticker}&interval=${timeframe}`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return;

      // Sort ascending by time
      data.sort((a, b) => a.time - b.time);

      candleSeriesRef.current.setData(data);

      const maData = calcMA(data, 20);
      maSeriesRef.current.setData(maData);

      const closes = data.map(d => d.close);
      const rsiValues = calcRSI(closes, 14);
      const rsiData = data.slice(data.length - rsiValues.length).map((d, i) => ({
        time: d.time,
        value: rsiValues[i],
      }));
      rsiSeriesRef.current.setData(rsiData);

      mainChartRef.current?.timeScale().fitContent();
    } catch (err) {
      console.error('Chart load error', err);
    } finally {
      setLoading(false);
    }
  }, [ticker, timeframe]);

  useEffect(() => { loadData(); }, [loadData]);

  const pct = priceData?.changePercent ?? null;
  const isPos = pct != null && pct >= 0;

  return (
    <>
      <div className="chart-header">
        <span className="chart-ticker">{ticker ?? '—'}</span>
        {priceData && (
          <>
            <span className="chart-price">${priceData.price.toFixed(2)}</span>
            <span className={pct != null ? (isPos ? 'green' : 'red') : 'muted'} style={{ fontSize: 12, fontWeight: 600 }}>
              {isPos ? '+' : ''}{pct?.toFixed(2)}%
            </span>
          </>
        )}
        {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</span>}
        <div className="timeframe-btns">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
              onClick={() => setTimeframe(tf)}
            >{tf}</button>
          ))}
        </div>
      </div>

      <div className="chart-container">
        <div className="chart-main" ref={mainRef} />
        <div className="chart-rsi" ref={rsiRef}>
          <span className="chart-rsi-label">RSI(14)</span>
        </div>
      </div>
    </>
  );
}
