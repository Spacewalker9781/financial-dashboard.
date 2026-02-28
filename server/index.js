import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import path from 'path';
import yahooFinance from 'yahoo-finance2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── App & WebSocket setup ────────────────────────────────────────────────────
const app = express();
expressWs(app);

app.use(cors());
app.use(express.json());

// ─── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ─── SQLite database ──────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (ticker TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS alerts (
    id        TEXT PRIMARY KEY,
    ticker    TEXT,
    condition TEXT,
    price     REAL,
    triggered INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS portfolio (
    id        TEXT PRIMARY KEY,
    ticker    TEXT,
    buyPrice  REAL,
    quantity  REAL
  );
`);

// Seed default watchlist
const defaultTickers = ['TSLA', 'AAPL', 'NVDA'];
const insertTicker = db.prepare('INSERT OR IGNORE INTO watchlist (ticker) VALUES (?)');
for (const t of defaultTickers) insertTicker.run(t);

// ─── Mock data helpers ────────────────────────────────────────────────────────
const BASE_PRICES = { TSLA: 250, AAPL: 185, NVDA: 480, MSFT: 415, GOOGL: 175 };

function getMockQuote(ticker) {
  const base = BASE_PRICES[ticker] || 100;
  const price = parseFloat((base * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2));
  const change = parseFloat(((Math.random() - 0.5) * 5).toFixed(2));
  const changePercent = parseFloat(((Math.random() - 0.5) * 2).toFixed(2));
  return {
    ticker,
    price,
    change,
    changePercent,
    high: parseFloat((price * 1.01).toFixed(2)),
    low: parseFloat((price * 0.99).toFixed(2)),
    volume: Math.floor(Math.random() * 1e7),
  };
}

function getMockHistory(ticker, interval) {
  const base = BASE_PRICES[ticker] || 100;
  const now = Math.floor(Date.now() / 1000);
  const points = 120;
  const intervalSeconds = { '1m': 60, '5m': 300, '1h': 3600, '1d': 86400 }[interval] || 86400;

  const bars = [];
  let price = base;
  for (let i = points; i >= 0; i--) {
    const time = now - i * intervalSeconds;
    const open = parseFloat(price.toFixed(2));
    const close = parseFloat((price * (1 + (Math.random() - 0.5) * 0.015)).toFixed(2));
    const high = parseFloat((Math.max(open, close) * (1 + Math.random() * 0.005)).toFixed(2));
    const low = parseFloat((Math.min(open, close) * (1 - Math.random() * 0.005)).toFixed(2));
    const volume = Math.floor(Math.random() * 1e6);
    bars.push({ time, open, high, low, close, volume });
    price = close;
  }
  return bars;
}

// ─── Quote fetcher ─────────────────────────────────────────────────────────────
async function fetchQuote(ticker) {
  try {
    const q = await yahooFinance.quote(ticker, {}, { validateResult: false });
    return {
      ticker,
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      high: q.regularMarketDayHigh ?? 0,
      low: q.regularMarketDayLow ?? 0,
      volume: q.regularMarketVolume ?? 0,
    };
  } catch {
    return getMockQuote(ticker);
  }
}

// ─── History fetcher ──────────────────────────────────────────────────────────
async function fetchHistory(ticker, interval) {
  const yahooInterval = { '1m': '1m', '5m': '5m', '1h': '1h', '1d': '1d' }[interval] || '1d';
  const period1Map = { '1m': '1d', '5m': '5d', '1h': '60d', '1d': '1y' };
  const period1 = period1Map[interval] || '1y';

  try {
    const result = await yahooFinance.chart(ticker, {
      interval: yahooInterval,
      period1,
    }, { validateResult: false });

    const quotes = result?.quotes ?? [];
    if (!quotes.length) return getMockHistory(ticker, interval);

    return quotes
      .filter(q => q.open != null && q.close != null)
      .map(q => ({
        time: Math.floor(new Date(q.date).getTime() / 1000),
        open: parseFloat(q.open.toFixed(2)),
        high: parseFloat(q.high.toFixed(2)),
        low: parseFloat(q.low.toFixed(2)),
        close: parseFloat(q.close.toFixed(2)),
        volume: q.volume ?? 0,
      }));
  } catch {
    return getMockHistory(ticker, interval);
  }
}

// ─── REST: Quote ──────────────────────────────────────────────────────────────
app.get('/api/quote', async (req, res) => {
  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  try {
    const data = await fetchQuote(ticker);
    res.json(data);
  } catch {
    res.json(getMockQuote(ticker));
  }
});

// ─── REST: History ────────────────────────────────────────────────────────────
app.get('/api/history', async (req, res) => {
  const ticker = (req.query.ticker || '').toUpperCase().trim();
  const interval = req.query.interval || '1d';
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  try {
    const data = await fetchHistory(ticker, interval);
    res.json(data);
  } catch {
    res.json(getMockHistory(ticker, interval));
  }
});

// ─── REST: Watchlist ──────────────────────────────────────────────────────────
app.get('/api/watchlist', (req, res) => {
  const rows = db.prepare('SELECT ticker FROM watchlist').all();
  res.json(rows.map(r => r.ticker));
});

app.post('/api/watchlist', (req, res) => {
  const ticker = (req.body.ticker || '').toUpperCase().trim();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  try {
    db.prepare('INSERT OR IGNORE INTO watchlist (ticker) VALUES (?)').run(ticker);
    res.json({ ticker });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/watchlist/:ticker', (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  db.prepare('DELETE FROM watchlist WHERE ticker = ?').run(ticker);
  res.json({ ok: true });
});

// ─── REST: Alerts ─────────────────────────────────────────────────────────────
app.get('/api/alerts', (req, res) => {
  res.json(db.prepare('SELECT * FROM alerts').all());
});

app.post('/api/alerts', (req, res) => {
  const { ticker, condition, price } = req.body;
  if (!ticker || !condition || price == null)
    return res.status(400).json({ error: 'ticker, condition, price required' });
  const id = uuidv4();
  db.prepare('INSERT INTO alerts (id, ticker, condition, price) VALUES (?, ?, ?, ?)')
    .run(id, ticker.toUpperCase(), condition, parseFloat(price));
  res.json({ id, ticker: ticker.toUpperCase(), condition, price: parseFloat(price), triggered: 0 });
});

app.delete('/api/alerts/:id', (req, res) => {
  db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── REST: Portfolio ──────────────────────────────────────────────────────────
app.get('/api/portfolio', (req, res) => {
  res.json(db.prepare('SELECT * FROM portfolio').all());
});

app.post('/api/portfolio', (req, res) => {
  const { ticker, buyPrice, quantity } = req.body;
  if (!ticker || buyPrice == null || quantity == null)
    return res.status(400).json({ error: 'ticker, buyPrice, quantity required' });
  const id = uuidv4();
  db.prepare('INSERT INTO portfolio (id, ticker, buyPrice, quantity) VALUES (?, ?, ?, ?)')
    .run(id, ticker.toUpperCase(), parseFloat(buyPrice), parseFloat(quantity));
  res.json({ id, ticker: ticker.toUpperCase(), buyPrice: parseFloat(buyPrice), quantity: parseFloat(quantity) });
});

app.delete('/api/portfolio/:id', (req, res) => {
  db.prepare('DELETE FROM portfolio WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── WebSocket: live price broadcast ─────────────────────────────────────────
const wsClients = new Set();

app.ws('/ws', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

async function broadcastPrices() {
  if (!wsClients.size) return;

  const tickers = db.prepare('SELECT ticker FROM watchlist').all().map(r => r.ticker);
  if (!tickers.length) return;

  const quotes = await Promise.all(tickers.map(t => fetchQuote(t)));
  const alerts = db.prepare('SELECT * FROM alerts WHERE triggered = 0').all();

  // Check alert triggers
  const triggered = [];
  for (const alert of alerts) {
    const q = quotes.find(q => q.ticker === alert.ticker);
    if (!q) continue;
    const hit =
      (alert.condition === 'above' && q.price >= alert.price) ||
      (alert.condition === 'below' && q.price <= alert.price);
    if (hit) {
      db.prepare('UPDATE alerts SET triggered = 1 WHERE id = ?').run(alert.id);
      triggered.push({ ...alert, currentPrice: q.price });
    }
  }

  const payload = JSON.stringify({ type: 'prices', quotes, triggered });
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

setInterval(broadcastPrices, 8000);

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
