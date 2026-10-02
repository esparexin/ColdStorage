# Code File Quality Standard: 250-Line Limit & Ratchet Policy

**Status**: ACTIVE & MANDATORY  
**Target Scope**: All TypeScript/TSX source files across `packages/`  
**Automated Enforcement**: `scripts/check-line-budget.sh`, ESLint, Pre-commit, CI

---

## 1. Core Principles

1. **Maximum File Size**: Every `.ts` and `.tsx` source file must strictly remain $\le 250$ lines.
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
- All source files with `.ts` or `.tsx` extensions located within `packages/*/src/`.
- Total lines of code (`wc -l`) are evaluated deterministically.

### What Is Excluded:
- `node_modules/`
- `.next/` and Next.js build caches
- `dist/` and compiler outputs
- `coverage/` reports
- Static assets, SVG files, and documentation markdown files

---

## 3. Ratchet Mechanism (The Burn-Down Policy)

While the repository undergoes remediation of legacy oversized files:
1. **Zero New Oversized Files**: Any newly introduced `.ts` or `.tsx` file that exceeds 250 lines immediately fails CI and pre-commit checks.
2. **No Growth in Legacy Files**: Any file registered in `scripts/line-budget-baseline.json` is strictly prohibited from growing ($Lines_{current} \le Lines_{baseline}$).
3. **Downward Ratchet**: Once a legacy file is decomposed below 250 lines, its entry is permanently graduated from the baseline.
4. **Strict Final Lock**: Once all baseline entries are resolved, strict ESLint `max-lines: ['error', { max: 250 }]` is locked repository-wide with zero baseline exceptions.
