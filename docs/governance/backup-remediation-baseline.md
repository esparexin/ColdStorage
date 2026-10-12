# Remediation Baseline — Backup + Repository Integrity

**Date:** 2026-10-12
**Branch:** `audit/backup-repository-integrity-remediation` from `origin/main@632d534` (PR 111 merged)
**Working tree at branch-off:** clean (`git status --short` empty)
**Open PRs noted:** 111 merged; dependabot mongoose/next/eslint/express/react + 2 security-workflow PRs left untouched.

## Verified baselines (local, 2026-10-12)
- hygiene-audit.sh: PASS
- check-line-budget.sh: PASS (baseline 2 entries)
- check-architecture-boundaries.sh: PASS
- check-backend-cycles/ssot/accessibility: PASS (via hygiene)
- eslint --max-warnings=0: PASS
- type-check (contracts+backend+frontend): PASS
- contracts tests: 15 files / 140 tests PASS
- backend audit-backup.routes.test.ts: 13 PASS (with `MONGODB_TEST_URI=127.0.0.1/cold_storage_test`, local mongod 8.0.32 running)
- full backend suite: NOT run to green locally (requires replica-set; CI spins Mongo replica; local single node times out) — deferred to CI per phase.
- build contracts: PASS; full build deferred to Phase 7 CI.

## Skills / standards in force
- `impeccable` Operate mode for app UI; `DESIGN.md` tokens; `check-accessibility.sh` + `enforcement-rules.md`; backend SSOT/cycle boundary scripts; conventional commits; non-breaking constraint for API/permissions.

## Risks accepted at baseline
- `.env.local` points at Atlas live; backend tests must export `MONGODB_TEST_URI` local to avoid Atlas test-DB creation.
- `packages/backend/storage/backups/*.enc` (5 files) present locally, gitignored, not committed.
