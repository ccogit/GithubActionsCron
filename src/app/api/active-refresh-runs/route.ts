import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";

const GH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const WORKFLOW_NAMES: Record<string, string> = {
  "refresh-index-constituents.yml": "Index Constituents",
  "refresh-analyst-cache.yml":      "Analyst Cache",
  "refresh-politician-trades.yml":  "Politician Trades",
  "refresh-analyst-ratings.yml":    "Analyst Ratings",
  "refresh-technical-signals.yml":  "Technical Signals",
  "refresh-short-interest.yml":     "Short Interest",
  "refresh-insider-signals.yml":    "Insider Signals",
  "refresh-earnings-signals.yml":   "Earnings Signals",
  "refresh-social-sentiment.yml":   "Social Sentiment",
  "refresh-economic-indicators.yml":"Economic Indicators",
  "enrich-politician-signals.yml":  "Enrich Signals",
};

type Run = { id: number; path: string; status: string; conclusion: string | null; created_at: string };

export async function GET() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json({ workflows: [] });
  }

  try {
    const [inProgressRes, queuedRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs?status=in_progress&per_page=50`, { headers: GH_HEADERS, cache: "no-store" }),
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs?status=queued&per_page=50`,      { headers: GH_HEADERS, cache: "no-store" }),
    ]);

    const allRuns: Run[] = [];
    if (inProgressRes.ok) allRuns.push(...((await inProgressRes.json()).workflow_runs ?? []));
    if (queuedRes.ok)     allRuns.push(...((await queuedRes.json()).workflow_runs ?? []));

    const workflows = allRuns
      .map((run) => {
        const filename = run.path.split("/").pop() ?? "";
        const name = WORKFLOW_NAMES[filename];
        if (!name) return null;
        return {
          workflow:     filename,
          name,
          runId:        run.id,
          dispatchedAt: run.created_at,
          state:        run.status === "in_progress" ? "running" : "queued",
        };
      })
      .filter(Boolean);

    return NextResponse.json({ workflows });
  } catch {
    return NextResponse.json({ workflows: [] });
  }
}
