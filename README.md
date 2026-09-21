# qa-quality-gates

Minimal, **working** examples of quality gates for a Node.js/TypeScript delivery
pipeline — the kind that actually block, not just report. The demo domain is a
tiny fare/refund service (money in integer minor units, per-line tax rounding,
idempotent refunds), because gates are only interesting on code where bugs cost
money.

> Ejemplos mínimos y funcionales de puertas de calidad bloqueantes para un
> pipeline Node.js/TypeScript: cobertura, seguridad, IA en el ciclo de QA,
> smoke tests post-despliegue y métricas DORA.

## What's demonstrated, and where

| Capability | Gate behavior | Files |
|---|---|---|
| **Blocking test coverage** | CI job fails below 90% lines / 85% branches — enforced via required status checks, not a dashboard | [`vitest.config.ts`](vitest.config.ts), [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **Security scanning as a gate** | PRs: only *newly introduced* vulnerable deps block (dependency-review); main + weekly: full OSV scan; Trivy on image and k8s manifests (CRITICAL/HIGH, accepted risks in `.trivyignore`); gitleaks + CodeQL | [`.github/workflows/security.yml`](.github/workflows/security.yml), [`.trivyignore`](.trivyignore), [`Dockerfile`](Dockerfile) |
| **Post-deploy smoke tests** | 4 fast business-shaped checks (incl. a real fare computation and an idempotency replay); exit code = promotion criterion | [`smoke/smoke.mjs`](smoke/smoke.mjs), [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), [`k8s/deployment.yaml`](k8s/deployment.yaml) |
| **Deploy → smoke → rollback, reusable** | One workflow for staging and production (GitOps + Argo CD): smoke failure auto-restores the previous image tag | [`.github/workflows/_deploy-env.yml`](.github/workflows/_deploy-env.yml) |
| **AI: first-pass PR review** | Claude comments on money-handling / idempotency / test gaps; advisory only, humans keep merge authority | [`.github/workflows/ai-pr-review.yml`](.github/workflows/ai-pr-review.yml) |
| **AI: test generation** | Finds the worst-covered file from the coverage report, proposes tests to a gitignored folder — a human reviews and commits | [`scripts/ai-test-gen.mjs`](scripts/ai-test-gen.mjs) |
| **AI: CI failure triage** | Classifies failed runs (real bug / flaky / infra) and comments the probable cause on the PR | [`scripts/ai-ci-triage.mjs`](scripts/ai-ci-triage.mjs), [`.github/workflows/ci-failure-triage.yml`](.github/workflows/ci-failure-triage.yml) |
| **DORA metrics** | Deployment frequency, lead time, CFR, ~MTTR — computed weekly from existing workflow-run data only | [`scripts/dora-metrics.mjs`](scripts/dora-metrics.mjs), [`.github/workflows/dora.yml`](.github/workflows/dora.yml) |

Threshold placement, the legacy-code ratchet strategy, and the honest-evaluation
criteria for the AI tooling are written up in
[`docs/decisions.md`](docs/decisions.md) — that document is half the point of
this repo.

## The delivery cycle, gated

```
        PR opened                    merge to main                after deploy
  ┌────────────────────┐       ┌──────────────────────┐      ┌─────────────────────┐
  │ typecheck          │       │ security: OSV + Trivy │      │ smoke tests against  │
  │ tests + coverage ◄─┼─block │ (CRITICAL/HIGH block) │◄block│ the live instance ◄──┼─promotion
  │ AI review (advise) │       │ build image           │      │ version verification │
  │ AI triage on fail  │       │ deploy                │      │ DORA data emitted    │
  └────────────────────┘       └──────────────────────┘      └─────────────────────┘
```

## Run it locally

```bash
npm ci
npm run typecheck
npm run test:coverage        # fails if coverage drops below thresholds — try deleting a test
npm start &                  # service on :3000
npm run smoke                # post-deploy checks against BASE_URL (default localhost:3000)
```

AI tools (need `ANTHROPIC_API_KEY`; every one degrades gracefully without it):

```bash
npm run test:coverage && npm run ai:test-gen   # proposes tests for the least-covered file
npm run ai:triage -- path/to/failed.log        # classifies a CI failure
```

DORA report (needs `GITHUB_TOKEN` and `GITHUB_REPOSITORY=owner/repo`):

```bash
npm run dora
```

## Principles

1. **A gate that only reports is not a gate.** Every check here exits non-zero
   and is meant to be wired into branch protection / promotion criteria.
2. **Gates must not train people to bypass them.** Ratchet coverage on legacy
   code instead of demanding 90% on day one; don't block on unfixable CVEs;
   keep smoke tests under 10 seconds.
3. **AI proposes, humans dispose.** All three AI integrations are advisory,
   and each has an explicit evaluation criterion for whether it earns its keep
   (see `docs/decisions.md` §4).
4. **Measure with what you already have.** DORA metrics come from workflow runs
   and commit timestamps — no new platform required to start seeing trends.
