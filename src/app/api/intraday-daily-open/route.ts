export const dynamic = "force-dynamic";

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN  ?? "";
const GITHUB_REPO   = process.env.GITHUB_REPO   ?? "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";

export async function POST() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return Response.json(
      { ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not configured" },
      { status: 500 },
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/intraday-daily-open.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization:        `Bearer ${GITHUB_TOKEN}`,
        Accept:               "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type":       "application/json",
      },
      body: JSON.stringify({ ref: GITHUB_BRANCH }),
    },
  );

  if (res.status === 204) {
    return Response.json({ ok: true });
  }

  const text = await res.text().catch(() => "");
  return Response.json(
    { ok: false, error: `GitHub API HTTP ${res.status}${text ? `: ${text}` : ""}` },
    { status: 502 },
  );
}
