# Stock Watcher

A serverless stock price monitor with a real-time dashboard, per-symbol price history charts, and email alerts — built entirely on free-tier infrastructure.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-worker-2088FF?style=flat-square&logo=githubactions&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-frontend-black?style=flat-square&logo=vercel)

---

## How it works

```
cron-job.org (every minute)
    │
    ▼
GitHub Actions  ──►  Python worker (tick.py)
                          │
                          ├──► Fetch prices  (Finnhub API)
                          ├──► Store ticks   (Supabase)
                          └──► Send alerts   (Resend email)
                                    │
                                    ▼
                          Next.js Dashboard  (Vercel)
```

Every minute, an external cron service fires a `repository_dispatch` event that triggers a GitHub Actions workflow. The Python worker fetches the latest prices, writes them to Supabase, and sends an email if any stock falls below its configured threshold.

The Next.js frontend reads directly from Supabase and auto-refreshes every 60 seconds.

---

## Features

- **Live dashboard** — dark-themed UI with per-stock price charts (2-hour history) and auto-refresh
- **Watchlist management** — add/remove symbols, set per-symbol alert thresholds via the UI
- **Email alerts** — triggered when a price drops below threshold; 1-hour cooldown per symbol prevents spam
- **Price history** — every tick stored in Supabase for charting and audit
- **Fully serverless** — no always-on servers; GitHub Actions is the compute layer

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Recharts |
| Database | Supabase (PostgreSQL) |
| Worker | Python 3.13, `uv`, Finnhub API, Resend |
| Scheduling | cron-job.org → GitHub Actions `repository_dispatch` |
| Hosting | Vercel (frontend) |

---

## Project structure

```
├── src/                  # Next.js frontend
│   ├── app/
│   │   ├── page.tsx      # Dashboard (server component, fetches from Supabase)
│   │   └── actions.ts    # Server actions (add/remove/update watchlist)
│   ├── components/       # WatchlistTable, PriceChart, AlertsTable, AddSymbolForm
│   └── lib/supabase/     # Supabase client (server + browser)
├── worker/
│   └── tick.py           # Price fetch → store → alert loop
├── supabase/migrations/
│   └── 001_init.sql      # watchlist, price_ticks, alert_log tables
└── .github/workflows/
    └── tick.yml          # GitHub Actions workflow (triggered per minute)
```

---

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com) and run the migration:

```sql
-- supabase/migrations/001_init.sql
-- Run in the Supabase SQL editor
```

Copy your **Project URL**, **anon key**, and **service_role key** from *Project Settings → API*.

### 2. GitHub Actions secrets

In your repo go to *Settings → Secrets and variables → Actions* and add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE` | service_role key |
| `FINNHUB_API_KEY` | [finnhub.io](https://finnhub.io) API key |
| `RESEND_API_KEY` | [resend.com](https://resend.com) API key |

### 3. Cron trigger

At [cron-job.org](https://cron-job.org), create a job that sends a POST request every minute to:

```
https://api.github.com/repos/<owner>/<repo>/dispatches
```

With headers:
```
Authorization: Bearer <github-pat>
Content-Type: application/json
```

And body:
```json
{ "event_type": "tick" }
```

### 4. Frontend (local)

```bash
# Install dependencies
npm install

# Create .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE=<service-role-key>

# Run dev server
npm run dev
```

### 5. Deploy to Vercel

Add the same three environment variables in *Vercel → Project → Settings → Environment Variables*, then redeploy.

---

## Database schema

```sql
-- Stocks to monitor with per-symbol alert threshold
watchlist      (id, symbol, min_price, alert_cooldown_until, created_at)

-- Raw price feed — one row per symbol per tick
price_ticks    (id, symbol, price, fetched_at)

-- History of sent email alerts
alert_log      (id, symbol, price, min_price, sent_at)
```

---

## License

MIT
