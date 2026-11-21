# Remediation Baseline & Scope Lock (Phase 0)

**Date**: 2026-10-03  
**Status**: 100% REMEDIATED & ZERO-BASELINE GRADUATED  
**Base Commit**: `ad649d7351a493bbd41c450acf2b53705a2fae0a`  

---

## 1. Verified Baseline Metrics (At Inception vs. Final Graduation)

| Gate | Inception Status (2026-10-03) | Final Status (November 2026) | Details |
| :--- | :--- | :--- | :--- |
| **Repository Hygiene** | PASS | **PASS** | `scripts/hygiene-audit.sh` (zero placeholders, zero secrets) |
| **Line Budget & Ratchet** | 29 baseline entries (21 TS + 8 CSS) | **0 baseline entries (`{}`)** | 100% of files $\le 250$ lines; zero exceptions |
| **Type Check** | PASS | **PASS** | `npm run type-check` across `@cold-storage/contracts`, `@cold-storage/backend`, `@cold-storage/frontend` |
| **ESLint** | PASS | **PASS** | `eslint . --max-warnings=0` (zero warnings) |
| **Test Suites** | 38 test files, 373 tests | **127+ test files, 1,000+ tests** | 100% passing across contracts, backend, and frontend |
| **Production Build** | 16 static pages | **19 static pages** | `npm run build` optimized static generation |

---

## 2. Identified Remediation Scope

1. **Phase 1: Critical Correctness Cleanup**:
   - Customer update HTTP method divergence (`PUT` -> canonical `PATCH`).
   - Remove duplicate `app.use('/api/delivery', deliveryRouter)` mount.
   - Remove stale `phase: 'P4'` marker in `/health` response.
2. **Phase 2: UI/UX SSOT Foundation**:
   - Establish shared UI primitives in `packages/frontend/src/components/ui/` (`Button`, `Input`, `Modal`, `Badge`, `Card`, `Select`, `SearchBar`, `Pagination`).
   - Eliminate `@import` Google Font from `tokens.css` to prevent duplicate font fetching.
3. **Phase 3: Search, Fields, Buttons & Forms Consolidation**:
   - Standardize search inputs, field groups, and button variants across all domain features.
4. **Phase 4: Modal, Accessibility & Responsive Remediation**:
   - Standardize all 15 custom modals onto the accessible `Modal` primitive with native dialog behavior, focus traps, and Escape handling.
   - Fix mobile navigation lockout (`SidebarNav` drawer toggle in `AppHeader`).
   - Fix undersized tap targets.
5. **Phase 5: Table, Pagination & Feedback SSOT**:
   - Extend `DataTable` with pagination support and migrate `UserTable` and `BackupLogTable`.
6. **Phase 6: Storage & Domain SSOT Cleanup**:
   - Remove duplicate storage creation modals from `inventory` and consolidate onto canonical `/storage`.
7. **Phase 7: Backend Boundary, Legacy & Orphan Cleanup**:
   - Move `counterService` out of `modules/grn` into shared backend infrastructure (`modules/common/`).
   - Migrate legacy `tests/` into `__tests__/` with decomposition below 200 lines.
8. **Phase 8: Permanent Governance & Automated Prevention**:
   - Configure `eslint-plugin-jsx-a11y`, CSS line-budget limits, architecture boundary checks, route-contract checks, and mobile regression coverage.
9. **Phase 9: Final Zero-Duplication Audit**:
   - Comprehensive audit proving zero duplicate code or SSOT violations remain.
10. **Phase 10: Final Validation, Push, Sync & PR**:
    - Final quality gates and single PR creation.

---

## 3. Scope Lock

The following are strictly prohibited throughout this remediation:
- New features or product capabilities.
- Unrequested visual or UI redesigns.
- Parallel implementations or competing SSOT abstractions.
- Temporary workaround code or disabling linter/type checks.
- Bypassing existing `@cold-storage/contracts` schemas.

---

## 4. Graduation & Zero-Baseline Lock

All 29 legacy oversized files (8 CSS modules + 21 TypeScript source & test files) have been systematically decomposed below the 250-line limit:
- **CSS Decomposition**: All 8 oversized CSS files split into tokenized modular styles (0 CSS files > 250 lines).
- **Production Source Decomposition ([PR #227](https://github.com/esparexin/ColdStorage/pull/227))**: `pricing.ts` decomposed into `pricing.ts` (216 lines) and `monthly-occupancy.ts` (89 lines). 100% of production source code across contracts, backend, and frontend is $\le 250$ lines.
- **Contracts & Backend Tests Decomposition ([PR #228](https://github.com/esparexin/ColdStorage/pull/228))**: 3 oversized test suites partitioned into 6 focused test files $\le 235$ lines.
- **Frontend Tests Decomposition ([PR #229](https://github.com/esparexin/ColdStorage/pull/229))**: `mergeRentAssessment.helper.test.ts` and `rentFilter.helper.test.ts` decomposed into 7 modular test and fixture files $\le 203$ lines.
- **Permanent Lock**: `scripts/line-budget-baseline.json` emptied to `{}`. `scripts/check-line-budget.sh` permanently enforces 0 baseline entries repository-wide.
