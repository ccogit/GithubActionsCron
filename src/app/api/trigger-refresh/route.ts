import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";

// Ordered groups: each group fires in parallel; groups fire sequentially.
// Dependencies:
//   Step 1 — index_constituents (symbol universe; everything else reads it)
//   Step 2 — analyst-cache + politician-trades (independent of each other)
//   Step 3 — enrich-politician-signals (reads politician_trades rows)
const WORKFLOW_GROUPS: string[][] = [
  ["refresh-index-constituents.yml"],
  ["refresh-analyst-cache.yml", "refresh-politician-trades.yml"],
  ["enrich-politician-signals.yml"],
];

const WORKFLOW_NAMES: Record<string, string> = {
  "refresh-index-constituents.yml": "Index Constituents",
  "refresh-analyst-cache.yml": "Analyst Cache",
  "refresh-politician-trades.yml": "Politician Trades",
  "enrich-politician-signals.yml": "Enrich Signals",
};

interface StepResult {
  workflow: string;
  name: string;
  ok: boolean;
  error?: string;
}

async function dispatch(workflow: string): Promise<StepResult> {
  const name = WORKFLOW_NAMES[workflow] ?? workflow;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return { workflow, name, ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not set" };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: GITHUB_BRANCH }),
      }
    );

    // 204 = dispatch accepted
    if (res.status === 204) return { workflow, name, ok: true };

    const text = await res.text().catch(() => "");
    return { workflow, name, ok: false, error: `HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (e) {
    return { workflow, name, ok: false, error: String(e) };
  }
}

export async function POST() {
  const results: StepResult[] = [];

  for (let i = 0; i < WORKFLOW_GROUPS.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));

    const groupResults = await Promise.all(WORKFLOW_GROUPS[i].map(dispatch));
    results.push(...groupResults);
  }

  return NextResponse.json({ ok: results.every((r) => r.ok), steps: results });
}
