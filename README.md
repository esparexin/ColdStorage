# Cold Storage Management System

Production-grade cold-storage workflow digitization.

## Current Phase: P1 Governance + Foundation

- **Status**: P1 implementation complete, verified through all 7 phase gates.
- **Next Phase**: P2 Auth + Users + RBAC (**Awaiting explicit user approval**).
- **Authoritative Architecture Lock**: [`docs/00-p0-lock.md`](docs/00-p0-lock.md).

## Monorepo Layout (P1 Scope)

```text
ColdStorage/
├── .github/workflows/ci.yml         # CI verification workflow
├── docs/00-p0-lock.md               # Authoritative P0 Requirements & Architecture Lock
├── packages/
│   └── contracts/                   # Shared validation SSOT (@cold-storage/contracts)
│       └── src/
│           ├── common.ts            # Locale and common validators
│           ├── identifiers.ts       # Independent identifier schemas (GRN, Receipt, Challan, Rent Receipt, GP)
│           ├── bags.ts              # Controlled S/B/S+B bag types and dual-weight model
│           ├── storage-hierarchy.ts # Facility -> Chamber -> Rack -> Level -> Position
│           ├── permissions.ts       # Machine-readable permissions matrix and facility scoping
│           ├── settings.ts          # System settings singleton schema
│           └── index.ts             # Package exports
├── scripts/
│   └── hygiene-audit.sh             # Repository hygiene and governance verification gate
├── eslint.config.mjs                # ESLint configuration
├── package.json                     # Monorepo workspaces definition
├── tsconfig.base.json               # Strict root TypeScript configuration
└── README.md                        # Documentation and verification instructions
```

## Governance & Verification Commands

```bash
# 1. Repository hygiene audit
npm run hygiene

# 2. Strict TypeScript type check
npm run type-check

# 3. Code linting
npm run lint

# 4. Unit / contract smoke tests
npm run test

# 5. Production build of workspace packages
npm run build
```

## Mandatory Phase Completion Gates

Every phase must pass all 7 gates before advancing:
1. `type-check`: Strict TypeScript compilation across all packages.
2. `lint`: ESLint passing with zero warnings.
3. `tests`: Vitest contract test suite passing.
4. `build`: Build passes without errors.
5. `security checks`: Zero secrets, dependency audit clean.
6. `manual verification`: Verification steps executed and recorded.
7. `repository hygiene audit`: `npm run hygiene` passes.
