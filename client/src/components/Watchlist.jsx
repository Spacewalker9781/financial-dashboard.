import React, { useState } from 'react';

export default function Watchlist({ watchlist, prices, selected, onSelect, onAdd, onRemove }) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const t = input.trim().toUpperCase();
    if (!t) return;
    onAdd(t);
    setInput('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <>
      <div className="panel-header">Watchlist</div>
      <div className="watchlist-add">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Add ticker…"
          maxLength={10}
        />
        <button className="btn-icon" onClick={handleAdd} title="Add">+</button>
      </div>
      <div className="watchlist-items">
        {watchlist.length === 0 && <div className="empty">No tickers added</div>}
        {watchlist.map(ticker => {
          const q = prices[ticker];
          const pct = q?.changePercent ?? null;
          const isPos = pct != null && pct >= 0;
          return (
            <div
              key={ticker}
              className={`watchlist-item ${selected === ticker ? 'active' : ''}`}
              onClick={() => onSelect(ticker)}
            >
              <span className="wl-ticker">{ticker}</span>
              <span className="wl-price">
                {q ? `$${q.price.toFixed(2)}` : '—'}
              </span>
              <span className={`wl-change ${pct != null ? (isPos ? 'green' : 'red') : 'muted'}`}>
                {pct != null ? `${isPos ? '+' : ''}${pct.toFixed(2)}%` : '—'}
              </span>
              <button
                className="wl-remove"
                onClick={e => { e.stopPropagation(); onRemove(ticker); }}
                title={`Remove ${ticker}`}
              >×</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
