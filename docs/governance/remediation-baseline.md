# Remediation Baseline & Scope Lock (Phase 0)

**Date**: 2026-10-03  
**Status**: ACTIVE & LOCKED  
**Dedicated Remediation Branch**: `fix/ui-ux-ssot-code-hygiene`  
**Base Commit**: `ad649d7351a493bbd41c450acf2b53705a2fae0a`  

---

## 1. Verified Baseline Metrics

| Gate | Status | Details |
| :--- | :--- | :--- |
| **Branch** | Verified | `fix/ui-ux-ssot-code-hygiene` branched from `main` |
| **Repository Hygiene** | PASS | `scripts/hygiene-audit.sh` (zero placeholders, zero secrets) |
| **Line Budget & Ratchet** | PASS | `scripts/check-line-budget.sh` (29 baseline entries — 21 TypeScript + 8 CSS — 0 new violations) |
| **Type Check** | PASS | `npm run type-check` across `@cold-storage/contracts`, `@cold-storage/backend`, `@cold-storage/frontend` |
| **ESLint** | PASS | `eslint . --max-warnings=0` (zero warnings) |
| **Test Suites** | PASS | 38 test files, 373 total tests passing (Backend: 303, Contracts: 70) |
| **Production Build** | PASS | `npm run build` (16 Next.js static pages generated) |

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
