# Decisions: where the thresholds are and why

Short ADR-style notes. The point of a gate is that it blocks; the point of these
notes is that everyone knows *why* it blocks there and how to change it.

## 1. Coverage thresholds: 90/85 lines/branches, blocking

- **Decision:** `vitest --coverage` fails the CI job below 90% lines / 85% branches
  on `src/**` (entrypoint wiring excluded — it's covered by smoke tests).
- **Why blocking:** a reported-only number decays into wallpaper. A failing job
  is the only coverage signal teams consistently react to.
- **Why not 100%:** the last percent buys assertions on trivia and teaches the
  team to write tests that satisfy the meter, not tests that catch bugs.
- **Legacy strategy (ratchet):** on a codebase with real debt you don't start
  at 90. Start the gate at the *current* baseline (even if it's 34%), so it
  blocks regressions from day one, then raise the floor a few points with every
  sprint that adds tests. The gate never blocks the team for debt they inherited —
  only for new debt.

## 2. Security scanning: CRITICAL/HIGH block, lower severities report

- OSV on the lockfile + Trivy on the built image, both `exit-code: 1`.
- `ignore-unfixed: true`: blocking on vulnerabilities with no available fix
  only trains people to bypass the gate. Unfixed CVEs stay visible in reports.
- Weekly scheduled rescan, because new CVEs arrive without any code change.

## 3. Post-deploy smoke tests: few, fast, business-shaped

- 4 checks, < 10 s total: liveness, readiness + version match, one real fare
  computation, one idempotency replay. Exit code is the promotion criterion.
- Deliberately **not** a regression suite re-run: smoke answers "is the thing
  we just shipped alive and computing money correctly", nothing more. Anything
  slower gets skipped by humans under incident pressure — then it's worthless.

## 4. AI in the QA cycle: assistive, never authoritative

Three integrations, one rule: **AI proposes, a human disposes.**

| Integration | Output | Blocking? |
|---|---|---|
| PR first-pass review | ≤ 5 inline comments | No — comments only |
| Test generation | proposal file in `ai-proposals/` (gitignored) | No — human commits |
| CI failure triage | classification + probable cause on the run/PR | No — informational |

- Generated tests are never auto-committed: a test generated against buggy code
  asserts the bug and freezes it in place.
- Honest evaluation criteria (review after ~1 month of use): % of AI review
  comments acted on, % of proposed tests kept after human edit, % of triage
  classifications that were correct. If AI review comments are acted on < ~20%
  of the time, it's noise — remove it. Keeping a tool that doesn't earn its
  attention cost is itself a quality regression.

## 5. DORA metrics: from existing CI/CD data only

- Deployment frequency, lead time, CFR and approximate MTTR computed from the
  deploy workflow's runs and commit timestamps — no new agents or platforms.
- Trend over precision: the number that matters is the direction month-over-month.
  MTTR here is an approximation (failed deploy → next successful deploy); good
  enough to see whether recovery is getting faster.
