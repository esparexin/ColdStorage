# Cold Storage Management System

Production-grade cold-storage workflow digitization.

## Authoritative Architecture Lock

[`docs/00-p0-lock.md`](docs/00-p0-lock.md) — LOCKED.

Key data model decisions:

- **Chamber** is free text (max 20 characters), not a managed entity. There is no rack, level or
  position beneath it, and no occupancy or capacity tracking.
- **Facility** is the tenancy and access-scope root only; SUPER_ADMIN manages facilities from
  System Settings.
- **Customer** identity is a single name (max 50 characters, special characters allowed).
- **Rental** is Monthly (amount + month count) or Seasonal — a fixed **10-month** period whose
  amount is the total for the whole term.

## Monorepo Layout (see docs/ui-backend-wiring-matrix.md for route inventory)

```text
ColdStorage/
├── .github/workflows/coldstorage-ci.yml  # CI verification workflow
├── docs/00-p0-lock.md               # Authoritative P0 Requirements & Architecture Lock
├── packages/
│   ├── contracts/                   # Shared validation SSOT (@cold-storage/contracts, 34 modules)
│   │   └── src/                     # common, identifiers, bags, inventory, permissions,
│   │                                # settings, user, auth, backup, rent, groups, ... + index.ts
│   ├── backend/                     # Backend API service (@cold-storage/backend, 19 routers)
│   │   └── src/
│   │       ├── config.ts            # Environment and server configuration
│   │       ├── utils/crypto.ts      # Native crypto password hashing & JWT utilities
│   │       ├── modules/*/           # users, auth, grn, delivery, rent, backup, ...
│   │       ├── middleware/          # JWT authentication, RBAC guard, facility scope guard
│   │       ├── routes/              # 19 mounted routers (auth..group, see wiring matrix)
│   │       └── app.ts               # Express application
│   └── frontend/                    # Next.js UI (@cold-storage/frontend, 14 routes: / + 13 features incl. /groups)
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

# 2. Strict TypeScript type check across all workspaces
npm run type-check

# 3. Code linting
npm run lint

# 4. Unit / contract and integration tests
npm run test

# 5. Production build of all workspace packages
npm run build
```

## Mandatory Phase Completion Gates

Every phase must pass all 7 gates before advancing:
1. `type-check`: Strict TypeScript compilation across all packages.
2. `lint`: ESLint passing with zero warnings.
3. `tests`: Vitest contract & integration test suites passing.
4. `build`: Build passes without errors.
5. `security checks`: Zero secrets, dependency audit clean.
6. `manual verification`: Verification steps executed and recorded.
7. `repository hygiene audit`: `npm run hygiene` passes.
