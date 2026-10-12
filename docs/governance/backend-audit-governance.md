# Backend Audit Governance (Permanent, R8)

**Branch:** `audit/backend-complete-audit-remediation` cut from `main`.
**Scope:** backend only (`packages/backend/src`, `packages/contracts/src` additive, `scripts/`, `docs/governance/`). Frontend (`packages/frontend/`) must never change on this branch — enforced by `check-backend-cycles.sh` + `backend-governance.yml`.
**Business behavior:** preserved unless a Finding (F01-F34) is explicitly approved. API envelopes, auth flows, rent math, and P0 lock decisions stay intact.

## Ownership

| Area | Owner | Reviews |
|---|---|---|
| Auth/session (R1) | Auth Owner | `auth.service`, `session.model/repository` |
| Ledger/txn (R2) | Ledger Owner + DBA | `inventory-transaction`, loan-status, internal-movement scope |
| Schema (R3) | Schema Owner | models, `indexes.ts`, mappers alias |
| Cycles (R4) | Architecture Owner | `users/auth`, `rent/delivery`, batched queries |
| API (R5) | API Owner | limiter, `async-handler`, `http-error`, types |
| Ops (R6) | Ops Owner | backup, documents preview, `index.ts` shutdown, scripts |
| Tests (R7) | QA Owner | `backend-audit-regression.test.ts` + failure paths |
| Governance (R8) | Governance Owner | this file, scripts, workflow, CODEOWNERS |

## Dependencies

R0 -> R1 -> R2 -> R3 -> R4 -> R5 -> R6 -> R7 -> R8. No phase starts with a red gate. Each phase owns exclusive files (see plan); no overlapping edits.

## Gates per phase

```bash
npm run build --workspace=@cold-storage/contracts
npm run type-check
npm run lint
npm run test
npm run build
npm run hygiene
npm run line-budget
bash scripts/check-backend-ssot.sh
bash scripts/check-backend-cycles.sh
```

Conventional Commits enforced by `commitlint.yml` (`audit` type allowed). PRs <500 lines per `dangerfile.ts`.

## Bypass authorization

Never bypass hygiene, line-budget, SSOT, or cycle gates without: `governance-bypass` label + written maintainer approval in the PR + follow-up issue within 7 days. Pre-commit runs `npm run hygiene`; CI `Backend Governance` is required.
