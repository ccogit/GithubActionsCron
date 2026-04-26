import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";

const GH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// GET ?workflow=refresh-foo.yml&since=2024-01-01T10:00:00.000Z
// Returns: { state, conclusion?, runId?, stepsDone?, stepsTotal? }
//
// stepsDone/stepsTotal: derived from the first job's steps list.
// Gives a coarse percentage the UI can show while a run is in progress.
export async function GET(request: NextRequest) {
  const workflow = request.nextUrl.searchParams.get("workflow");
  const since = request.nextUrl.searchParams.get("since");

  if (!workflow || !since) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json({ state: "queued", error: "Not configured" });
  }

  let runsData: { workflow_runs?: unknown[] };
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&per_page=10`,
      { headers: GH_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ state: "queued" });
    runsData = await res.json();
  } catch {
    return NextResponse.json({ state: "queued" });
  }

  // 10s buffer compensates for clock skew between our server and GitHub
  const cutoff = new Date(new Date(since).getTime() - 10_000);

  type Run = { id: number; created_at: string; status: string; conclusion: string | null };
  const run = (runsData.workflow_runs as Run[] | undefined)?.find(
    (r) => new Date(r.created_at) >= cutoff
  );

  if (!run) return NextResponse.json({ state: "queued" });

  if (run.status === "completed") {
    return NextResponse.json({
      state: run.conclusion === "success" ? "completed" : "failed",
      conclusion: run.conclusion,
      runId: run.id,
    });
  }

  // Run is in_progress — fetch job steps to compute a real percentage
  let stepsDone: number | undefined;
  let stepsTotal: number | undefined;
  try {
    const jobsRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${run.id}/jobs`,
      { headers: GH_HEADERS, cache: "no-store" }
    );
    if (jobsRes.ok) {
      const jobsData = await jobsRes.json();
      type Step = { status: string };
      const steps: Step[] = jobsData.jobs?.[0]?.steps ?? [];
      if (steps.length > 0) {
        stepsTotal = steps.length;
        stepsDone = steps.filter((s) => s.status === "completed").length;
      }
    }
  } catch {
    // non-fatal — percentage is optional
  }

  return NextResponse.json({ state: "running", runId: run.id, stepsDone, stepsTotal });
}
