import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";

// GET ?workflow=refresh-foo.yml&since=2024-01-01T10:00:00.000Z
// Returns: { state: "queued"|"running"|"completed"|"failed", conclusion?, runId? }
//
// "since" is the dispatch timestamp. We subtract 10s as a clock-skew buffer
// and find the most recent matching run created after that point.
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
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
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

  return NextResponse.json({ state: "running", runId: run.id });
}
