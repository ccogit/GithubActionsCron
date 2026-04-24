# Stock Watcher — Setup

## 1. Supabase

1. Create a free project at supabase.com
2. Run `supabase/migrations/001_init.sql` in the SQL editor
3. (Optional) Enable the `pg_cron` extension and schedule the retention job from the comment at the bottom of the migration
4. Copy your keys from **Project Settings → API Keys**:

   Supabase has migrated to new key names. Both sets are active simultaneously during the transition:

   | What the code calls | New name (use this) | Legacy fallback |
   |---|---|---|
   | Public / anon key | **Publishable key** (`sb_publishable_...`) | `anon` key |
   | Server-side secret | **Secret key** (`sb_secret_...`) | `service_role` key |

   If your project was created recently you'll see the new keys under the **API Keys** tab. Older projects may show them under **Legacy API Keys** — either works, but prefer the new ones.

## 2. Finnhub

1. Sign up at finnhub.io (free tier: 60 req/min, plenty for a personal watchlist)
2. Copy your API key

## 3. Resend

1. Sign up at resend.com (free: 100 emails/day, 3,000/mo)
2. Verify a sending domain OR use the sandbox `onboarding@resend.dev` address for testing
3. Copy your API key

## 4. GitHub repository

1. Push this repo to GitHub (public — required for unlimited Actions minutes)
2. Add the following repository secrets (Settings → Secrets → Actions):
   - `FINNHUB_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE` — paste your **secret key** (`sb_secret_...`) or the legacy `service_role` key
   - `RESEND_API_KEY`
3. Create a **fine-grained PAT** with `Actions: Read and Write` and `Contents: Read and Write` scoped to this repo — used by cron-job.org

## 5. cron-job.org (external 1-minute scheduler)

1. Sign up at cron-job.org (free)
2. Create a new cron job:
   - **URL:** `https://api.github.com/repos/YOUR_GITHUB_USERNAME/YOUR_REPO/dispatches`
   - **Method:** POST
   - **Headers:**
     ```
     Accept: application/vnd.github+json
     Authorization: Bearer YOUR_FINE_GRAINED_PAT
     X-GitHub-Api-Version: 2022-11-28
     Content-Type: application/json
     ```
   - **Body:** `{"event_type":"tick"}`
   - **Schedule:** every 1 minute

## 6. Frontend (Vercel)

1. Import the `web/` directory into a new Vercel project
2. Set root directory to `web`
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — paste your **publishable key** (`sb_publishable_...`) or the legacy `anon` key
   - `SUPABASE_SERVICE_ROLE` — paste your **secret key** (`sb_secret_...`) or the legacy `service_role` key
4. Deploy

## Usage

- **Add a stock:** Enter a ticker symbol (e.g. `AAPL`) and optionally a minimum price, then click Add
- **Edit min price:** Click the price value in the Min Price column to edit inline
- **Remove a stock:** Click the trash icon
- **Alerts:** When a stock falls below its min price, an email is sent to christopher.ridder@gmail.com with a 1-hour cooldown per symbol
