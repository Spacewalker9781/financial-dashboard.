import React, { useState, useEffect } from 'react';

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

// ── Alert form ─────────────────────────────────────────────
function AlertSection({ ticker }) {
  const [alerts, setAlerts] = useState([]);
  const [condition, setCondition] = useState('above');
  const [price, setPrice] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/alerts');
      setAlerts(await res.json());
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const addAlert = async () => {
    if (!ticker || !price) return;
    await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, condition, price: parseFloat(price) }),
    });
    setPrice('');
    load();
  };

  const deleteAlert = async (id) => {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = alerts.filter(a => !ticker || a.ticker === ticker);

  return (
    <div className="section">
      <div className="section-title">Price Alerts</div>
      <div className="alert-form">
        <div className="alert-form-row">
          <select value={condition} onChange={e => setCondition(e.target.value)}>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
          <input
            type="number"
            placeholder="Price"
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAlert()}
            min={0}
            step="0.01"
          />
        </div>
        <button className="btn-primary" onClick={addAlert} disabled={!ticker || !price}>
          Set Alert
        </button>
      </div>
      <div className="alert-list">
        {filtered.length === 0 && <div className="empty">No alerts for {ticker ?? 'any ticker'}</div>}
        {filtered.map(a => (
          <div key={a.id} className={`alert-item ${a.triggered ? 'triggered' : ''}`}>
            <div className="alert-info">
              <span className="alert-ticker">{a.ticker}</span>{' '}
              <span className="alert-cond">{a.condition} ${Number(a.price).toFixed(2)}</span>
              {a.triggered ? ' ✓' : ''}
            </div>
            <button className="btn-danger" onClick={() => deleteAlert(a.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Portfolio section ──────────────────────────────────────
function PortfolioSection({ ticker, currentPrice }) {
  const [positions, setPositions] = useState([]);
  const [portTicker, setPortTicker] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [qty, setQty] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/portfolio');
      setPositions(await res.json());
    } catch {}
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (ticker) setPortTicker(ticker);
  }, [ticker]);

  const addPosition = async () => {
    if (!portTicker || !buyPrice || !qty) return;
    await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: portTicker, buyPrice: parseFloat(buyPrice), quantity: parseFloat(qty) }),
    });
    setBuyPrice('');
    setQty('');
    load();
  };

  const deletePosition = async (id) => {
    await fetch(`/api/portfolio/${id}`, { method: 'DELETE' });
    load();
  };

  // We need current prices for P&L — use a simple cache via API
  const [livePrices, setLivePrices] = useState({});

  useEffect(() => {
    const tickers = [...new Set(positions.map(p => p.ticker))];
    if (!tickers.length) return;
    Promise.all(
      tickers.map(t => fetch(`/api/quote?ticker=${t}`).then(r => r.json()))
    ).then(quotes => {
      const map = {};
      for (const q of quotes) map[q.ticker] = q.price;
      setLivePrices(map);
    }).catch(() => {});
  }, [positions]);

  return (
    <div className="section">
      <div className="section-title">Portfolio</div>
      <div className="portfolio-form">
        <input
          placeholder="Ticker"
          value={portTicker}
          onChange={e => setPortTicker(e.target.value.toUpperCase())}
          maxLength={10}
        />
        <div className="portfolio-form-row">
          <input
            type="number"
            placeholder="Buy price"
            value={buyPrice}
            onChange={e => setBuyPrice(e.target.value)}
            min={0}
            step="0.01"
          />
          <input
            type="number"
            placeholder="Qty"
            value={qty}
            onChange={e => setQty(e.target.value)}
            min={0}
            step="0.001"
          />
        </div>
        <button className="btn-primary" onClick={addPosition} disabled={!portTicker || !buyPrice || !qty}>
          Add Position
        </button>
      </div>
      <div className="portfolio-list">
        {positions.length === 0 && <div className="empty">No positions yet</div>}
        {positions.map(p => {
          const live = livePrices[p.ticker] ?? null;
          const cost = p.buyPrice * p.quantity;
          const value = live != null ? live * p.quantity : null;
          const pnl = value != null ? value - cost : null;
          const pnlPct = pnl != null ? (pnl / cost) * 100 : null;
          const isPos = pnl != null && pnl >= 0;
          return (
            <div key={p.id} className="portfolio-item">
              <div className="portfolio-item-header">
                <span className="port-ticker">{p.ticker}</span>
                {pnl != null && (
                  <span className={`port-pnl ${isPos ? 'green' : 'red'}`}>
                    {isPos ? '+' : ''}${pnl.toFixed(2)} ({isPos ? '+' : ''}{pnlPct?.toFixed(1)}%)
                  </span>
                )}
                <button className="btn-danger" style={{ marginLeft: 6 }} onClick={() => deletePosition(p.id)}>×</button>
              </div>
              <div className="portfolio-item-details">
                <span>{p.quantity} shares @ ${Number(p.buyPrice).toFixed(2)}</span>
                {live != null && <span>Now: ${live.toFixed(2)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Details component ─────────────────────────────────
export default function Details({ ticker, priceData }) {
  return (
    <>
      <div className="section">
        <div className="section-title">Market Data</div>
        {!priceData ? (
          <div className="empty">Select a ticker</div>
        ) : (
          <div className="detail-grid">
            <div className="detail-cell">
              <div className="detail-label">Price</div>
              <div className="detail-value">${priceData.price.toFixed(2)}</div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Change</div>
              <div className={`detail-value ${priceData.changePercent >= 0 ? 'green' : 'red'}`}>
                {priceData.changePercent >= 0 ? '+' : ''}{priceData.changePercent?.toFixed(2)}%
              </div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">High</div>
              <div className="detail-value">${priceData.high?.toFixed(2) ?? '—'}</div>
            </div>
            <div className="detail-cell">
              <div className="detail-label">Low</div>
              <div className="detail-value">${priceData.low?.toFixed(2) ?? '—'}</div>
            </div>
            <div className="detail-cell" style={{ gridColumn: '1 / -1' }}>
              <div className="detail-label">Volume</div>
              <div className="detail-value">{fmt(priceData.volume)}</div>
            </div>
          </div>
        )}
      </div>

      <AlertSection ticker={ticker} />
      <PortfolioSection ticker={ticker} currentPrice={priceData?.price} />
    </>
  );
}
