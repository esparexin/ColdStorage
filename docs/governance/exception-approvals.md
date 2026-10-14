# Exception Approvals (permanent gates)

| ID | Scope | Owner | Rationale | Expiry | Removal criteria |
|----|-------|-------|-----------|--------|------------------|
| EX-01 | `scripts/repair-monthly-rent.mjs` (retired one-off) | DBA | RESOLVED: Unsafe repair script deleted in Phase 1 safety isolation | 2026-10-14 | Deleted; zero live mutation risk |
| EX-02 | `errorResponseSchema` incremental adoption | Backend | Non-breaking; new handlers prefer envelope, old `{error}` preserved | 2027-04-12 | All handlers emit envelope |
| EX-03 | `asyncHandler` pilot (dashboard+inventory wrapped; grn/delivery/rent incremental) | Backend | Avoid 250-line violations + large diffs; gate tracks expansion | 2026-12-31 | All routers wrapped |
| EX-04 | `audit/*` branch backend-only rule; this work uses `feat/*` | Governance | Full-stack scope required frontend changes | Permanent | Keep `audit/*` for backend-only work |
| EX-05 | Node 20 pinned (8 workflows + .nvmrc) | Platform | Engines `>=20`, CI green; `npm audit --audit-level=high` has postcss high/critical requiring breaking Next bump | 2027-01-31 | Bump to 22 with Next upgrade |
| EX-06 | `security-audits.yml` warns (not fails) on `npm audit` | Security | Failing on high would turn CI red today; secret-scan now fails reliably via `git ls-files` | 2027-01-31 | Fail on high after vuln remediation |
