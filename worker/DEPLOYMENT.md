# Deploying the Stock Watcher Stream Worker

This guide covers deploying the persistent Alpaca WebSocket worker to Railway or Fly.io.

## Option 1: Railway.app (Recommended for beginners)

Railway is the simplest for this use case — just connect your GitHub repo and it handles the rest.

### Setup

1. **Create account**: Go to [railway.app](https://railway.app), sign in with GitHub
2. **Create new project**: Click "Create" → "Deploy from GitHub repo"
3. **Select this repository**
4. **Configure service**:
   - In Railway dashboard, click the repo/service
   - In the "Settings" tab, set **Root Directory** to `worker`
   - Railway will auto-detect the `Dockerfile`
5. **Add environment variables**:
   - In "Variables" tab, add:
     - `SUPABASE_URL`: from your Supabase project settings
     - `SUPABASE_SERVICE_ROLE`: from Supabase API keys
     - `ALPACA_KEY`: from Alpaca dashboard
     - `ALPACA_SECRET`: from Alpaca dashboard
     - `RESEND_API_KEY`: (optional) from Resend
     - `ALERT_EMAIL`: your email address
6. **Deploy**:
   - Railway auto-deploys on push to `main`
   - Watch logs in the "Deployments" tab
   - Service runs 24/7

### Scaling & Monitoring

- **Cost**: ~$5/month for 1 always-on service (first $5 free per month)
- **Logs**: View in Railway dashboard under "Logs"
- **Restart**: Service auto-restarts if it crashes
- **Disable old cron**: Remove the Finnhub polling from GitHub Actions (or leave it as backup)

---

## Option 2: Fly.io

Fly.io is great if you want more control and has a generous free tier.

### Setup

1. **Install flyctl**: `curl -L https://fly.io/install.sh | sh` (or `brew install flyctl`)
2. **Login**: `flyctl auth login` (creates account if needed)
3. **Clone/cd to project**: `cd ~/GithubActionsCron`
4. **Create Fly app**:
   ```bash
   flyctl launch --no-deploy --working-dir worker --name stock-watcher-stream
   ```
   - Chooses region (pick one close to you, e.g., `sjc` for US West)
   - Generates `fly.toml`
5. **Set secrets**:
   ```bash
   flyctl secrets set -a stock-watcher-stream \
     SUPABASE_URL="your-url" \
     SUPABASE_SERVICE_ROLE="your-key" \
     ALPACA_KEY="your-key" \
     ALPACA_SECRET="your-secret" \
     RESEND_API_KEY="your-key" \
     ALERT_EMAIL="your@email.com"
   ```
6. **Deploy**:
   ```bash
   flyctl deploy --working-dir worker
   ```
   - Builds Docker image and deploys
   - Service runs with 1 shared-cpu, 256MB RAM (free tier)
7. **Monitor**:
   ```bash
   flyctl logs -a stock-watcher-stream
   ```

### Scaling & Monitoring

- **Cost**: Free tier includes 3 shared-cpu-1x 256MB VMs; extra $0.003/hour per VM
- **Auto-restart**: Fly restarts crashed services
- **Logs**: `flyctl logs -a stock-watcher-stream`
- **GitHub Actions**: Optional: add CD workflow to auto-deploy on push

---

## Verifying Deployment

### Check if streaming is working

1. **Watch logs** (Railway or Fly.io) for startup messages
2. **Expected log output**:
   ```
   Starting Alpaca WebSocket stream...
   Connecting to Alpaca stream (3 symbols)...
   Authenticated. Subscribing to trades...
     Subscribed to ['AAPL', 'MSFT', ...]
   [trade] AAPL @ $185.50
   [trade] MSFT @ $420.25
   ```
3. **Check database**: In Supabase, query `price_ticks` table — should have new rows within seconds of trades

### Troubleshooting

**"Auth failed"**
- Check `ALPACA_KEY` and `ALPACA_SECRET` are correct and not truncated
- Verify Alpaca account is active

**"Watchlist empty"**
- Add stocks to watchlist via the Next.js app first
- Worker queries watchlist on startup and every reconnect

**"No trades received"**
- Trades only come during US market hours (9:30 AM - 4:00 PM ET, Monday-Friday)
- Outside market hours, the stream connects but won't receive trades

**"WebSocket error / Connection drops"**
- Worker has exponential backoff (1s, 2s, 4s, ... up to 60s)
- Retries automatically — check logs for pattern
- May be Alpaca API rate limiting or regional network issues

---

## Disabling the GitHub Actions Cron

Once streaming is live and you've verified data is flowing:

1. **Option A**: Remove `.github/workflows/` files that run `tick.py`
2. **Option B**: Comment out the schedule in `cron-job.yml` as a safety net

The streaming worker replaces the 1-minute polling cron entirely.

---

## Local Testing

To test locally before deploying:

```bash
cd worker
docker-compose up
# Logs should show connection and trade messages
# Press Ctrl+C to stop
```

This reads from your production Supabase/Alpaca (as configured in `.env.local` or passed to `docker-compose`).

---

## Going Back to Cron

If you need to revert to the Finnhub cron approach:

1. In Railway/Fly.io, stop or remove the `stream` service
2. Keep the GitHub Actions workflow to trigger `tick.py` again
3. The database schema is unchanged — both approaches write to the same tables

---

## Next Steps

1. Deploy to Railway or Fly.io
2. Verify logs show trades and ticks are being stored
3. Watch the Stocks page refresh in real-time as trades arrive
4. Optional: Implement Supabase Realtime on the frontend (see DEPLOYMENT.md in root) for live chart updates
