// DORA metrics from data the pipeline already produces — no extra tooling.
// Sources: GitHub Actions runs of the deploy workflow (deployments) and the
// commits they shipped (lead time).
//
//   deployment frequency  = successful deploy-workflow runs / period
//   lead time for changes = median (deploy time - commit time)
//   change failure rate   = failed deploy runs / total deploy runs
//   MTTR (approx.)        = median time from a failed deploy run to the next successful one
//
// Usage: GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/dora-metrics.mjs

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const WORKFLOW = process.env.DEPLOY_WORKFLOW ?? 'deploy.yml';
const DAYS = Number(process.env.DORA_WINDOW_DAYS ?? 30);

if (!TOKEN || !REPO) {
  console.error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  process.exit(1);
}

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
const { workflow_runs: runs } = await gh(
  `/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?created=>${since.toISOString().slice(0, 10)}&per_page=100`,
);

const finished = runs.filter((r) => ['success', 'failure'].includes(r.conclusion));
const successes = finished.filter((r) => r.conclusion === 'success');
const failed = finished.filter((r) => r.conclusion === 'failure');

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function hours(ms) {
  return (ms / 3_600_000).toFixed(1);
}

// Lead time: head-commit timestamp -> deploy completion, per successful deploy.
const leadTimes = [];
for (const run of successes.slice(0, 20)) {
  const commit = await gh(`/repos/${REPO}/commits/${run.head_sha}`);
  leadTimes.push(new Date(run.updated_at) - new Date(commit.commit.committer.date));
}

// MTTR approximation: failed deploy -> next successful deploy after it.
const chronological = [...finished].reverse();
const restoreTimes = [];
for (let i = 0; i < chronological.length; i++) {
  if (chronological[i].conclusion !== 'failure') continue;
  const fix = chronological.slice(i + 1).find((r) => r.conclusion === 'success');
  if (fix) restoreTimes.push(new Date(fix.updated_at) - new Date(chronological[i].updated_at));
}

const perWeek = (successes.length / DAYS) * 7;
const cfr = finished.length ? ((failed.length / finished.length) * 100).toFixed(0) : '0';
const medianLead = median(leadTimes);
const medianRestore = median(restoreTimes);

const report = `## DORA metrics — last ${DAYS} days (\`${REPO}\`, workflow \`${WORKFLOW}\`)

| Metric | Value |
|---|---|
| Deployment frequency | ${successes.length} deploys (${perWeek.toFixed(1)}/week) |
| Lead time for changes (median) | ${medianLead === null ? 'n/a' : `${hours(medianLead)} h`} |
| Change failure rate | ${cfr}% (${failed.length}/${finished.length}) |
| Time to restore (median, approx.) | ${medianRestore === null ? 'n/a — no failures or none restored yet' : `${hours(medianRestore)} h`} |

_Computed only from existing CI/CD data (workflow runs + commits). Interpretation beats precision: watch trends, not decimals._`;

console.log(report);
