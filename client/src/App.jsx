import React, { useState, useEffect, useRef, useCallback } from 'react';
import Watchlist from './components/Watchlist.jsx';
import Chart from './components/Chart.jsx';
import Details from './components/Details.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices] = useState({});       // { TSLA: { price, change, changePercent, ... } }
  const [selected, setSelected] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  // ── Load watchlist ────────────────────────────────────────
  const loadWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      const tickers = await res.json();
      setWatchlist(tickers);
      setSelected(prev => (tickers.length && !prev) ? tickers[0] : prev);
    } catch (err) {
      console.error('Failed to load watchlist', err);
    }
  }, []);

  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

  // ── WebSocket ─────────────────────────────────────────────
  const connectWs = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'prices') {
          const map = {};
          for (const q of msg.quotes) map[q.ticker] = q;
          setPrices(prev => ({ ...prev, ...map }));

          // Alert toasts
          if (msg.triggered?.length) {
            for (const alert of msg.triggered) {
              addToast({
                title: `🔔 Alert: ${alert.ticker}`,
                body: `Price ${alert.condition} $${alert.price.toFixed(2)} — now $${alert.currentPrice.toFixed(2)}`,
              });
            }
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      setWsConnected(false);
      reconnectTimer.current = setTimeout(connectWs, 3000);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // ── Toast helpers ─────────────────────────────────────────
  const addToast = (toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ── Watchlist mutations ───────────────────────────────────
  const addTicker = async (ticker) => {
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    });
    await loadWatchlist();
    setSelected(ticker.toUpperCase());
  };

  const removeTicker = async (ticker) => {
    await fetch(`/api/watchlist/${ticker}`, { method: 'DELETE' });
    setWatchlist(prev => {
      const next = prev.filter(t => t !== ticker);
      if (selected === ticker) setSelected(next[0] ?? null);
      return next;
    });
  };

  const selectedPrice = selected ? prices[selected] : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>📈 Investor Dashboard</h1>
        <span className="header-badge">LIVE</span>
        <div className="ws-status">
          <span className={`ws-dot ${wsConnected ? 'connected' : ''}`} />
          {wsConnected ? 'Connected' : 'Reconnecting…'}
        </div>
      </header>

      <div className="app-body">
        <div className="panel panel-left">
          <Watchlist
            watchlist={watchlist}
            prices={prices}
            selected={selected}
            onSelect={setSelected}
            onAdd={addTicker}
            onRemove={removeTicker}
          />
        </div>

        <div className="panel panel-center">
          <Chart ticker={selected} priceData={selectedPrice} />
        </div>

        <div className="panel panel-right">
          <Details ticker={selected} priceData={selectedPrice} />
        </div>
      </div>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
