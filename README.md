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

## Monorepo Layout (P2 Scope)

```text
ColdStorage/
├── .github/workflows/ci.yml         # CI verification workflow
├── docs/00-p0-lock.md               # Authoritative P0 Requirements & Architecture Lock
├── packages/
│   ├── contracts/                   # Shared validation SSOT (@cold-storage/contracts)
│   │   └── src/
│   │       ├── common.ts            # Locale and common validators
│   │       ├── identifiers.ts       # Independent identifier schemas (GRN, Receipt, Challan, Rent Receipt, GP)
│   │       ├── bags.ts              # Controlled S/B/S+B bag types and dual-weight model
│   │       ├── inventory.ts         # Put-away allocations and stock ledger contracts
│   │       ├── permissions.ts       # Machine-readable permissions matrix and facility scoping
│   │       ├── settings.ts          # System settings singleton schema
│   │       ├── user.ts              # User provisioning and summary schemas
│   │       ├── auth.ts              # Authentication DTOs (login, password change, tokens)
│   │       └── index.ts             # Central package exports
│   └── backend/                     # Backend API service (@cold-storage/backend)
│       └── src/
│           ├── config.ts            # Environment and server configuration
│           ├── utils/crypto.ts      # Native crypto password hashing & JWT utilities
│           ├── modules/users/       # User entity, repository, and service
│           ├── modules/auth/        # Authentication service and credential workflows
│           ├── middleware/          # JWT authentication, RBAC guard, facility scope guard
│           ├── routes/              # Auth and user management API routes
│           └── app.ts               # Express application
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
