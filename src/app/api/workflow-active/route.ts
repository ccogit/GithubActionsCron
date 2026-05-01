import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";

const GH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

type Job = { name: string; status: string };

export async function GET() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json({ active: false });
  }

  try {
    const [inProgressRes, queuedRes] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/daily-rebalance.yml/runs?status=in_progress&per_page=1`,
        { headers: GH_HEADERS, cache: "no-store" }
      ),
      fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/daily-rebalance.yml/runs?status=queued&per_page=1`,
        { headers: GH_HEADERS, cache: "no-store" }
      ),
    ]);

    let activeRunId: number | null = null;

    if (inProgressRes.ok) {
      const data = await inProgressRes.json();
      if (data.workflow_runs?.[0]) activeRunId = data.workflow_runs[0].id;
    }
    if (!activeRunId && queuedRes.ok) {
      const data = await queuedRes.json();
      if (data.workflow_runs?.[0]) activeRunId = data.workflow_runs[0].id;
    }

    if (!activeRunId) return NextResponse.json({ active: false });

    // Determine phase: if the rebalance job is active we're rebalancing, otherwise still refreshing
    const jobsRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${activeRunId}/jobs`,
      { headers: GH_HEADERS, cache: "no-store" }
    );

    let phase: "refreshing" | "rebalancing" = "refreshing";

    if (jobsRes.ok) {
      const { jobs = [] }: { jobs: Job[] } = await jobsRes.json();
      const rebalanceActive = jobs.some(
        (j) => j.name === "rebalance" && (j.status === "in_progress" || j.status === "queued")
      );
      if (rebalanceActive) phase = "rebalancing";
    }

    return NextResponse.json({ active: true, phase, runId: activeRunId });
  } catch {
    return NextResponse.json({ active: false });
  }
}
