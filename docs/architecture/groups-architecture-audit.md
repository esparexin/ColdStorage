# ColdStorage — Groups Feature: Architecture Audit and Implementation Plan

**Date**: 2026-10-10  
**Status**: APPROVED & LOCKED  
**Feature Branch**: `feat/groups-management`

---

## 1. Executive Summary & Baseline State

This document records the verified architecture, data flow, contracts, and phased implementation plan for the **Groups** feature in ColdStorage.

In commercial cold storage operations, a single trader often holds tens or hundreds of individual Goods Receipt Notes (GRNs) accumulated across a season. Operators require a high-performance, persistent mechanism to organize these GRNs into named groups (typically corresponding to traders, consignments, or trading entities) to review combined stock, manage memberships, and maintain batch visibility without altering the underlying ledger stock, chamber allocations, rent terms, or delivery status.

### Baseline Verification
- **Base Commit**: `a1db9ae` on `feat/groups-management`.
- **Automated Gates**: 
  - `npm run build`: 100% successful across all 3 workspaces (`backend`, `contracts`, `frontend`).
  - `npm run hygiene`: 100% pass (Line budget 250 max, Boundary checks, UI SSOT, A11y).
  - `npm test`: 100% pass (75 backend, 12 contracts, 10 frontend test suites).

---

## 2. Core Approved Business Rules & Decisions

1. **Trader Linkage (Flexible)**:
   - Group name is operational business data representing the trader name (max 50 chars, trimmed).
   - Optional linkage to a canonical `Customer` record (`customerId: string | null`).
2. **GRN Membership & Cardinality**:
   - $1:N$ relationship: A GRN belongs to **at most one group at a time**.
   - Enforced by `groupId: string | null` on `GrnDoc` (indexed).
   - Any GRN in the facility can be assigned, regardless of status (`OPEN` or `CLOSED`), enabling season-long tracking of a trader's entire receipt history.
3. **Safe Deletion Guard**:
   - Deletion of a group is strictly rejected if `grnCount > 0`.
   - Operators must explicitly unassign or move all member GRNs before deleting a group.
   - Deleting a group never cascades to member GRNs, stock ledger, or audit history.
4. **Stock Authority (Zero Competing Ledgers)**:
   - Group stock summaries derive strictly from the append-only ledger `InventoryTransactionModel`.
   - Calculated via `readLedgerBalanceMany` over member `grnIds`. No stored or cached stock balances.
5. **RBAC & Scoping**:
   - `group:view`: `SUPER_ADMIN`, `ADMIN`, `OPERATOR`, `READ_ONLY`.
   - `group:manage`: `SUPER_ADMIN`, `ADMIN`, `OPERATOR` (create, edit, rename, assign, unassign, move).
   - `group:delete`: `SUPER_ADMIN`, `ADMIN` (delete empty groups).
   - Facility multi-tenancy enforced at all backend boundaries via `requireFacilityScope`.

---

## 3. Data Model & Database Integrity

### Group Collection (`GroupModel`)
- `id`: string (`grp-<uuid>`)
- `facilityId`: string (tenancy root)
- `name`: string (display name, max 50 chars)
- `nameNormalized`: string (lowercase trimmed for case-insensitive unique index)
- `remarks`: string | null (max 500 chars)
- `customerId`: string | null (optional canonical customer reference)
- `createdBy`: string (userId)
- `createdAt`: Date
- `updatedAt`: Date

**Indexes**:
- `{ id: 1 }` (unique)
- `{ facilityId: 1, nameNormalized: 1 }` (unique, concurrency duplicate protection)
- `{ facilityId: 1, customerId: 1 }` (sparse index)
- `{ facilityId: 1, createdAt: -1 }`

### GRN Collection Extension (`GrnModel`)
- `groupId`: string | null (indexed, default null)
- Index: `{ facilityId: 1, groupId: 1 }`

---

## 4. Operation-by-Operation API Contracts

Base route prefix: `/api/facilities/:facilityId/groups`

1. `POST /`: Create group (`createGroupSchema`).
2. `GET /`: Paginated list of groups with ledger stock rollups (`groupQuerySchema`).
3. `GET /:groupId`: Group details with paginated member GRNs and stock summary.
4. `PATCH /:groupId`: Update metadata and rename group (`updateGroupSchema`).
5. `POST /:groupId/grns`: Assign GRNs to group (`assignGrnsSchema`).
6. `DELETE /:groupId/grns`: Unassign GRNs from group (`unassignGrnsSchema`).
7. `POST /:groupId/move`: Move GRNs from source group to target group (`moveGrnsSchema`).
8. `DELETE /:groupId`: Delete empty group (safe deletion guard).
9. `GET /eligible-grns`: Eligible unassigned GRNs picker query.

---

## 5. Phased Delivery Sequence

- **Phase 0**: Architecture audit and implementation plan (`docs/architecture/groups-architecture-audit.md`).
- **Phase 1**: Contracts and domain boundaries (`@cold-storage/contracts`).
- **Phase 2**: Backend persistence, domain service, and handlers (`packages/backend`).
- **Phase 3**: Backend facility-scoped API routes, RBAC, and audit events (`packages/backend`).
- **Phase 4**: Frontend group management interface (`/groups` page, components, navigation).
- **Phase 5**: Integration, concurrency, stock consistency, and regression testing.
- **Phase 6**: Code quality, line budget compliance, and release verification.
