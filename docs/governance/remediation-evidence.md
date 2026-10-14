> **Superseded for new work.** The section below is the archived evidence for the
> 2026-10-12 backup/repository-integrity effort. Current active remediation:
> **W1 Emergency Data & Security** — see the bottom of this file.

# Remediation Evidence — Backup + Repository Integrity (2026-10-12)

**Branch:** `feat/backup-repository-integrity-remediation` (renamed from `audit/*`; `audit/*` is backend-only per `check-backend-cycles.sh`)
**Base:** `origin/main@632d534` → HEAD includes PR 113 merge `493a3d6` as ancestor.
**Constraints honored:** non-breaking only; Atlas + Drive target; full restore with guards; no implementation before confirmation.

## Phase commits
1. `ce750e0` chore(audit): establish remediation baseline and dedicated branch
2. `b2d7299` feat(backup): implement verified backup and recovery controls
3. `01d395a` fix(database): enforce connection and data integrity governance
4. `d3dfc29` refactor(api): consolidate routes and enforce contract consistency
5. `412ae49` refactor(ui): enforce design system and accessibility standards
6. `5fff105` chore(governance): enforce repository hygiene and CI safeguards
7. `f9c1e2b` test(governance): prevent repository integrity regressions
8. (this) docs(audit): record remediation evidence and verification results

## Verification (local 2026-10-12)
- `npm run lint`: PASS; `npm run type-check` (3 workspaces): PASS
- `hygiene-audit.sh`: PASS (line-budget, arch, a11y, ssot, cycles, backup-coverage, db-governance)
- contracts: 15 files / 140 tests PASS
- backend targeted: 6 files / 29 tests PASS (audit-backup 13, restore 2, scheduler 3, collector 2, contract-ssot 2, safety-guard 7) with local `cold_storage_test`
- backend build (scripts excluded, `dist/scripts` absent): PASS
- backup isolated proof: trigger → inspect (`checksumMatch:true`) → download → dry-run restore PASS; mismatched confirm → 400; live write without guard → 403
- secret/artifact scan on `origin/main...HEAD`: no `.enc`, `.env.local`, `dist/`, `.next`, `storage/backups`
- Full backend suite + Playwright: deferred to CI (replica set + browsers)

## Finding disposition vs baseline checklist
- BKP-01..05, DB-01..03, API-01..05, UI-01..02, GOV-01, GATE-01..02: implemented as above.
- Accepted risks (see `exception-approvals.md` EX-01..06): retired repair script deps, envelope incremental adoption, asyncHandler incremental expansion, Node 20 pin, audit warn-not-fail, mobile release placeholder.

## Risks / rollback
- Restore writes are upsert-by-`id` (never drop); always take fresh backup first (runbook §5); live `cold_storage` writes require `BACKUP_ALLOW_LIVE_RESTORE=true` + `confirm=backupId`.
- Rollback: `git revert` phase commits in reverse order; restore pre-change backup via dry-run → confirmed restore; no migrations shipped (no data migration in this change).
- Remaining uncertainty: off-site Drive SDK deferred (status reports `configured:false` until credentials); Atlas snapshots monitored, not managed in code; full e2e + replica-set suite must pass in CI before merge.

---

# W0 Verification Evidence — Code Quality & Technical Debt Audit

**Branch:** `fix/w1-emergency-data-and-security`
**Base:** `feat/rent-outward-bag-lifecycle-fix@7b473ea`
**Date:** 2026-10-13
**Mode:** READ-ONLY. Production writes performed during W0: **0**.

## Repository gates (baseline, pre-change)

| Gate | Result |
|---|---|
| `npm run hygiene` (10 sub-gates: line-budget, architecture, a11y, backend-SSOT, cycles, backup-coverage, DB-governance) | **PASS** |
| `npm run lint` (`eslint . --max-warnings=0`) | **PASS** |
| `tsc --noEmit -p packages/frontend/tsconfig.json` | **PASS** (0 diagnostics) |
| `npm run type-check` / `test` / `build` | deferred to W1 (write to `dist/`) |

## GitHub Actions versions — corrected

An audit sub-finding claimed `actions/checkout@v7`, `setup-node@v7` and
`upload-artifact@v7` might not exist, implying dead CI. **This was incorrect** —
the finding was based on stale v4/v5-era knowledge. Verified against the GitHub API:

| Action | Latest release | Status |
|---|---|---|
| `actions/checkout@v7` | v7.0.1 (2026-07-20) | exists |
| `actions/setup-node@v7` | v7.1.0 (2026-10-08) | exists |
| `actions/upload-artifact@v7` | v7.0.2 (2026-10-07) | exists |
| `github/codeql-action@v4` | rolling major tag | exists |
| `reviewdog/action-actionlint@v1` | v1.80.1 | exists |
| `dependabot/fetch-metadata@v3` | v3.1.0 | exists |

CI is live. **Verified pin values (W1.13):**
`checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` ·
`setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` ·
`upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9` ·
`codeql-action@24c54180a607b1449ed407dd24f251e4e9147c8d` ·
`action-actionlint@27343c2855eedb9702a2a976e7f007170ecb570c` ·
`fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98`

## Production DB verification — `cold_storage` (Atlas cluster0)

Scale: 22 grns · 22 deliverychallans · 18 rentpayments · 15 internalmovements ·
6 customers · 4 commodities · 4 commodityrates · 1 facility · 2 users ·
207 auditlogs · 0 deliveryreversals · 0 rentextensions · 0 backuplogs.
Connections 2/500 in use.

| # | Query | Prediction | Result |
|---|---|---|---|
| Q1 | `grns.getIndexes()` — bond index | missing (illegal `sparse`+`partialFilterExpression`) | **CONFIRMED absent** |
| Q2 | `customers.getIndexes()` — `mobile_1` | present, blocking inserts | **CLEARED — not present** |
| Q3 | counters + duplicate gpNumber | FY collision | **PARTIAL — different defect found** |
| Q4 | `rentAmount` null population | non-zero | **CLEARED — 0 null, 0 missing** |
| Q5 | collection census | — | 16 of 17 collections non-empty |
| Q6 | orphaned rentpayments | > 0 | **CLEARED — 0 orphans** |
| Q7 | paid vs rentAmount | overpayment | **DISPROVED — see below** |

### CONFIRMED — Inward Receipt counter poisoned at 758,696 (expected ≈22)

`counters`: `INWARD_RECEIPT FY=26-27 lastSequence=758696`.

Receipt chain proves the `$max` ratchet from the unanchored `/(\d+)$/` match on a
non-numeric operator `billNumber` (`create-grn.handler.ts:138-144`):

```
RCPT-26-27-0001 → 05505 → 093949 → 758686 → 758687 … 758696
                 ^5505   ^93949  ^758686
```

Monotonic and irreversible: it cannot self-heal. **Resolution:** the counter is
eliminated entirely in W1.3 (receipt number derived from the GRN number), which
makes this poisoned value inert — no production write required.

### CONFIRMED — Bond-number uniqueness is not enforced

`grn.model.ts:144-147` declares `{unique, sparse, partialFilterExpression}` — an
illegal MongoDB combination. **`facilityId_1_bondNumber_1` is absent from the live
DB.** No existing duplicates, so the index can be built safely.
(`facilityId_1_grnNumber_1` and `facilityId_1_inwardReceiptNumber_1` are live
and correct; 0 duplicates.)

### CONFIRMED — Gate Pass unique index missing AND would fail to build

`delivery-challan.model.ts:94-97` correctly declares
`{facilityId:1, gpNumber:1}` unique + `partialFilterExpression`. It is **absent**
from the live DB, and **2 duplicate string gpNumbers already exist**:

| gpNumber | facility | delivery ids |
|---|---|---|
| `094049` | `fac-246d79d6-e935-49fa-bafa-12fe6d506a6e` | `del-5a6e35e4-a496-43a5-a671-4f1d7a89739e`, `del-770b781f-ab4b-4250-babf-f2b7c5d7dc44` |
| `994477` | `fac-246d79d6-e935-49fa-bafa-12fe6d506a6e` | `del-61f289ba-6c9d-434a-ad1e-53bc45d20f0e`, `del-5680b372-2719-43ed-83a9-a49dc025ca77` |

gpNumber values are heterogeneous: `null`, `13`, `104`, `105`, `994477`,
`094049`, `094904`, plus `GP-0001`…`GP-0009`.

**Consequence:** with `autoIndex: true` the next boot attempts this index and
fails with E11000. De-duplication must precede index creation.
**W1.6–1.7 — production writes, gated on explicit approval (not yet executed).**

### CONFIRMED — Backup restore would silently drop org settings

`systemsettings` contains exactly `{ _id: "SYSTEM_SETTINGS" }` — **no `id` field**.
`backup-restore.service.ts:154` reads `doc['id']`, so `typeof id !== 'string'`
→ `continue`. Combined with the naive-pluralisation key derivation
(`SystemSettings`→`systemSettingss`, `Facility`→`facilitys`,
`Commodity`→`commoditys`), org identity and 2 of 3 master-data collections
restore zero documents while the API returns `200 "Restore complete"`.

### DISPROVED — no overpayment exists (hypothesis was wrong)

Q7 showed 14 GRNs with payments, 9 with `rentAmount = 0`, which looked like
`totalPaid > totalDue`. The decisive check refutes it — outward charges match
payments exactly:

```
grn 0015  rentAmount=0  paid=422250  outwardCharges=422250
grn 0022  rentAmount=0  paid=171678  outwardCharges=171678
grn 0018  rentAmount=0  paid= 73800  outwardCharges= 73800
grn 0026  rentAmount=0  paid= 59000  outwardCharges= 59000
```

`rentAmount = 0` means "derive from outward charges" (canonical
`rent-summary.helper.ts:38`). The data is internally consistent.

**The finding survives in a different form:** under the other five derivations
(`rent-gate.service.ts:25-30`, `storage-audit-report.ts:75-79`,
`transfer-ownership.handler.ts:84-89`, `merge-grn.helper.ts:160-165`) the same
GRN reports ₹0 obligation against ₹4,22,250 collected — a ₹4.22 lakh phantom
overpayment on GRN 0015 alone. **The data is correct; the reporting is not.**
W2 is a reporting-correctness fix requiring **no data migration**.

### OPEN — GRN with no stock ledger

`GRN-26-27-0001` — 300 bags, rentAmount ₹3,000, status `CLOSED`, has a rent
payment and a challan, but **no `INVENTORY_TRANSACTION` inward row**.
Note the `GRN-26-27-*` series resembles e2e/test seed data in production.
**Per instruction 7 these rows are left untouched** pending ownership verification.

## Governance decisions taken

| Decision | Resolution |
|---|---|
| Sequencing | W0→W7 sequential; one commit per step; single `git revert` rollback |
| DB verification | Read-only by default; production writes require explicit approval |
| 12 orphan endpoints | Delete (blast radius presented per-endpoint before removal) |
| gpNumber duplicates | De-duplicate, then add index (approved; execution gated) |
| Receipt numbering | `RCPT-<FY>-<grnNumber>`; requires amendment to `docs/00-p0-lock.md:14` |
