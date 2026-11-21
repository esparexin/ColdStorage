# Code File Quality Standard: 250-Line Limit & Ratchet Policy

**Status**: ACTIVE & MANDATORY  
**Target Scope**: All TypeScript/TSX and CSS source files across `packages/`  
**Automated Enforcement**: `scripts/check-line-budget.sh`, Pre-commit, CI (`coldstorage-ci.yml`)

---

## 1. Core Principles

1. **Maximum File Size**: Every `.ts`, `.tsx`, and `.css` source file must strictly remain $\le 250$ lines.
2. **Architecture by Single Responsibility**:
   - `page.tsx`: Coordinator shell only ($\le 100$ lines target). Must not contain inline forms, complex table schemas, inline modals, or raw API handling.
   - Custom Hooks (`use*.ts`): State ownership, mutations, and async loading ($\le 150$ lines target).
   - Presentation Components: Dedicated widgets, modals, and toolbars ($\le 150$ lines target).
   - Backend Domain Handlers / Use Cases: Single command or query execution ($\le 200$ lines target).
   - Test Suites: Focused test scenarios consuming shared test fixtures and builders ($\le 200$ lines target).
3. **No Artificial Chunking**:
   - Files must be partitioned around logical domains, UI responsibilities, and single canonical ownership.
   - Arbitrary line splitting, comment removal to game the line count, or using `// eslint-disable` is strictly prohibited.
4. **No Functional Alterations**:
   - Refactorings must preserve 100% of business rules, validation schemas, API contracts, RBAC permissions, and transactional semantics.

---

## 2. Counting Rules & Exclusions

### What Is Counted:
- All source files with `.ts`, `.tsx`, or `.css` extensions located within `packages/*/src/`.
- Total lines of code (`wc -l`) are evaluated deterministically.

### What Is Excluded:
- `node_modules/`
- `.next/` and Next.js build caches
- `dist/` and compiler outputs
- `coverage/` reports
- Static assets, SVG files, and documentation markdown files

---

## 3. Permanent Zero-Baseline Enforcement Policy

The legacy burn-down remediation is **100% complete**: all 29 historical oversized files (8 CSS + 21 TypeScript/TSX) have been permanently decomposed and graduated.

1. **Zero Exceptions**: No grandfathered files exist (`scripts/line-budget-baseline.json` is strictly locked at `{}`).
2. **Hard 250-Line Ceiling**: Every `.ts`, `.tsx`, and `.css` file across `packages/*/src/` must strictly remain $\le 250$ lines.
3. **Automated CI / Pre-Commit Blocker**: `scripts/check-line-budget.sh` executes deterministically in `pre-commit`, `npm run hygiene`, and CI (`coldstorage-ci.yml`). Any file exceeding 250 lines or any re-introduction of baseline entries fails the build immediately.
4. **Permanent Graduation**: Zero-baseline policy is locked repository-wide with zero exceptions.
