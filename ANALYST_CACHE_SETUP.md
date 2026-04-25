# Analyst Cache Hourly Refresh Setup

This guide walks through setting up the hourly analyst cache refresh via GitHub Actions.

## Overview

The analyst cache stores analyst price targets fetched from Yahoo Finance. These targets are used by the Market Aggregates dashboard to calculate "hot stocks" (highest upside between current and target price).

- **Refresh frequency:** Every hour
- **Trigger:** GitHub Actions scheduled workflow
- **Target:** `/api/cache-analyst` endpoint

## Setup Instructions

### 1. Generate Analyst Cache Secret Key

Create a secure random key to protect the cache-refresh endpoint:

```bash
# Generate a 32-character random key
openssl rand -hex 16
# Example output: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

Save this key — you'll need it in the next steps.

### 2. Add GitHub Secrets

Go to your repository settings:

1. Navigate to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Add two secrets:

   **Secret 1: `ANALYST_CACHE_KEY`**
   - Name: `ANALYST_CACHE_KEY`
   - Value: Paste the key from step 1 (e.g., `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`)

   **Secret 2: `DEPLOYMENT_URL`**
   - Name: `DEPLOYMENT_URL`
   - Value: Your production domain (e.g., `stock-watcher.vercel.app` or `yourapp.railway.app`)
   - **Do NOT include** `https://` — the workflow adds it automatically

### 3. Add to Environment Variables

Update your deployment platform's environment configuration:

#### If using Vercel:
1. Go to **Project Settings → Environment Variables**
2. Add: `ANALYST_CACHE_KEY` = (same value as GitHub secret)

#### If using Railway:
1. Go to your service settings
2. Add variable: `ANALYST_CACHE_KEY` = (same value as GitHub secret)

#### If using Fly.io:
```bash
flyctl secrets set -a <app-name> ANALYST_CACHE_KEY="your-key-here"
```

### 4. Verify Workflow File

Confirm `.github/workflows/refresh-analyst-cache.yml` exists in your repo:

```bash
ls -la .github/workflows/refresh-analyst-cache.yml
```

### 5. Test the Workflow

#### Option A: Run manually (immediate test)
1. Go to **Actions → Refresh Analyst Cache**
2. Click **Run workflow → Run workflow**
3. Wait ~30s and check the logs

#### Option B: Wait for next scheduled run
The workflow runs automatically at the top of each hour (00:00, 01:00, 02:00, etc. UTC).

## Verification

### Check workflow runs:
1. Go to **Actions** tab in GitHub
2. Look for "Refresh Analyst Cache" workflow
3. Green ✓ = success, Red ✗ = failed

### Monitor cache in Supabase:
```sql
SELECT symbol, target_mean, upside_pct, updated_at 
FROM analyst_cache 
ORDER BY updated_at DESC 
LIMIT 10;
```

Expected: `updated_at` timestamps within the last hour.

### Test the endpoint directly:

```bash
curl -X POST https://your-domain.com/api/cache-analyst \
  -H "Authorization: Bearer your-cache-key" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "updated": 42,
  "symbols": ["AAPL", "MSFT", ...]
}
```

## Troubleshooting

### Workflow fails with 401 Unauthorized
- Check that `ANALYST_CACHE_KEY` in GitHub Secrets matches the one in your deployment
- Check that `DEPLOYMENT_URL` is correct (no `https://` prefix)

### Workflow fails with 404 Not Found
- Confirm deployment is running and accessible
- Verify `/api/cache-analyst` endpoint exists in your codebase

### No stocks updated (response shows `"updated": 0`)
- Yahoo Finance may be rate-limiting requests
- Analyst cache may already be up-to-date (targets don't change frequently)
- Check Supabase for `price_ticks` data — targets are computed against latest prices

### Timeout errors
- Yahoo Finance API may be slow or down
- The endpoint has individual stock timeouts; it will skip problematic stocks

## Cost Considerations

- **GitHub Actions:** Free tier includes 2,000 minutes/month. 1 hourly run = ~24 minutes/month.
- **API calls:** Each run makes ~161 API calls to Yahoo Finance (one per index stock). Not rate-limited by GitHub.
- **Database:** 161 upserts per hour is negligible for Supabase.

## Next Steps

Once verified:
1. Monitor the first few runs to ensure targets are being cached
2. Adjust the schedule in the workflow if needed (e.g., every 6 hours instead of hourly)
3. Consider adding alerts if the workflow fails consistently
