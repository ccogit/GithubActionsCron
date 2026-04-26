export const dynamic = "force-dynamic";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";

// Ordered groups: each group fires in parallel; groups fire sequentially.
//   Group 0 — index_constituents (symbol universe; all signal fetchers read it)
//   Group 1 — all signal fetchers (independent of each other)
//   Group 2 — enrich-politician-signals (reads politician_trade_summary rows)
const WORKFLOW_GROUPS: Array<{ workflow: string; name: string }[]> = [
  [{ workflow: "refresh-index-constituents.yml", name: "Index Constituents" }],
  [
    { workflow: "refresh-analyst-cache.yml",      name: "Analyst Cache" },
    { workflow: "refresh-politician-trades.yml",  name: "Politician Trades" },
    { workflow: "refresh-analyst-ratings.yml",    name: "Analyst Ratings" },
    { workflow: "refresh-technical-signals.yml",  name: "Technical Signals" },
    { workflow: "refresh-short-interest.yml",     name: "Short Interest" },
    { workflow: "refresh-insider-signals.yml",    name: "Insider Signals" },
    { workflow: "refresh-earnings-signals.yml",   name: "Earnings Signals" },
  ],
  [{ workflow: "enrich-politician-signals.yml", name: "Enrich Signals" }],
];

async function dispatchWorkflow(workflow: string): Promise<{ ok: boolean; error?: string }> {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return { ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not set" };
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
    if (res.status === 204) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Streams NDJSON events as each group fires:
//   { type:"dispatched", workflow, name, dispatchedAt, ok, error? }
//   { type:"done" }
export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));

      try {
        for (let i = 0; i < WORKFLOW_GROUPS.length; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, 1500));

          const now = new Date().toISOString();
          await Promise.all(
            WORKFLOW_GROUPS[i].map(async ({ workflow, name }) => {
              const result = await dispatchWorkflow(workflow);
              send({ type: "dispatched", workflow, name, dispatchedAt: now, ...result });
            })
          );
        }
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
