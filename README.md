# 📈 Personal Investor Dashboard

A clean, fast, modern trading dashboard web app for individual investors. Dark-mode UI with real-time price updates via WebSocket, candlestick charts, RSI indicator, price alerts, and portfolio P&L tracking.

![Dashboard preview: dark 3-panel layout with watchlist, candlestick chart, and details panel]

## Features

- **Live prices** — WebSocket broadcast every 8 seconds for all watchlist tickers
- **Candlestick chart** — OHLCV data with MA(20) overlay and RSI(14) sub-chart
- **Timeframes** — 1m / 5m / 1h / 1d
- **Watchlist** — add/remove tickers, live price & % change
- **Price alerts** — above/below triggers with toast notifications
- **Portfolio tracker** — buy price, quantity, live P&L
- **Persistent storage** — SQLite via Node.js built-in `node:sqlite`
- **Mock data fallback** — always works even if Yahoo Finance is unavailable

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Backend  | Node.js (v22+), Express, express-ws, yahoo-finance2 |
| Database | SQLite (`node:sqlite` built-in) |
| Frontend | React 18, Vite 5, lightweight-charts v5 |

## Prerequisites

- **Node.js v22.5+** (required for built-in `node:sqlite` module)
- npm

## Setup & Run

### 1. Start the backend

```bash
cd server
npm install
node index.js
```

The API server starts on **http://localhost:4000**.

### 2. Start the frontend (separate terminal)

```bash
cd client
npm install
npm run dev
```

The dev server starts on **http://localhost:5173** and proxies `/api` and `/ws` to the backend.

Open **http://localhost:5173** in your browser.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/quote?ticker=TSLA` | Current price, change %, high, low, volume |
| GET | `/api/history?ticker=TSLA&interval=1d` | OHLCV bars (`1m`, `5m`, `1h`, `1d`) |
| GET/POST/DELETE | `/api/watchlist` | Manage watchlist tickers |
| GET/POST/DELETE | `/api/alerts` | Manage price alerts |
| GET/POST/DELETE | `/api/portfolio` | Manage portfolio positions |
| WS | `/ws` | Live price feed + alert triggers |

## Project Structure

```
server/
  index.js          # Express + WebSocket server
  package.json
  data.db           # SQLite database (auto-created)

client/
  vite.config.js    # Vite config with API proxy
  index.html
  src/
    main.jsx
    App.jsx         # Root component, WebSocket client
    App.css         # Dark theme styles
    components/
      Watchlist.jsx # Left panel: ticker list
      Chart.jsx     # Center panel: candlestick + RSI
      Details.jsx   # Right panel: stats, alerts, portfolio
      Toast.jsx     # Alert notifications
```

## Default Watchlist

The app seeds **TSLA**, **AAPL**, and **NVDA** on first run.

## Notes

- Price data is fetched from Yahoo Finance; if unavailable, realistic mock data is generated automatically.
- The SQLite database (`server/data.db`) is created automatically on first run.
- Rate limiting is applied to all `/api` routes (120 requests/minute).
