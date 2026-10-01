# P0 Requirements & Architecture Lock

**Date**: 2026-10-01  
**Status**: LOCKED (Awaiting Final Review Before P1)  
**Implementation**: STOPPED (No application implementation is currently approved or present. P1 remains NOT APPROVED.)  
**P1 Gate**: NOT APPROVED  

---

## 1. Ten Core Locked Decisions

1. **Numbering (GRN / Receipt / Delivery Challan / Gate Pass / Rent Receipt)**:
   - FY-sequential independent counters (e.g. `GRN-25-26-0001`, `CHL-25-26-0001`, `RCPT-25-26-0001`).
   - Inward Receipt Number is strictly independent; must NOT be assumed equal to GRN Number.
   - Delivery Challan Number is strictly independent from inward counters.
   - Rent Payment Receipt Number is an independent system-generated identifier; must NOT reuse GR Number, Inward Receipt Number, or Delivery Challan Number.
   - G.P. Number (Gate Pass) remains optional, opaque free-text; has NO automatic sequence and NO format validation in V1.
2. **GP / S-B / Marks**:
   - Optional, opaque free-text fields.
   - No format validation in V1; no invented business meanings.
3. **Bag Type**:
   - Exactly controlled vocabulary: `S`, `B`, or `S+B`.
   - Single canonical bag model; no separate bag subsystems.
   - Do not invent speculative meanings for S/B.
4. **Weight Authority**:
   - Nominal weight captured (calculated from bag count $\times$ nominal bag weight).
   - Actual / weighbridge weight captured.
   - Actual / weighbridge weight is **authoritative**.
   - Weight unit (e.g. Kg vs. Quintal standard) remains **PENDING CONFIRMATION**.
   - No duplicate inventory or parallel balance tracking systems.
5. **Initial Seed & Storage Hierarchy**:
   - Initial seed: 1 facility minimal.
   - Chambers, racks, levels, and positions created by Admin in P3.
   - No dummy production seed data.
   - Approved physical hierarchy:
     ```text
     Facility
     └── Chamber
         └── Rack
             └── Level
                 └── Position
     ```
6. **Hosting Architecture Target**:
   - Frontend: Vercel.
   - Backend: Render OR Railway.
   - Database: MongoDB Atlas (Replica Set).
   - Caching / Queue: Upstash Redis.
   - Off-site backup worker deployment details deferred until Render vs. Railway hosting selection is finalized.
7. **Backup Policy & Mechanism Separation**:
   - MongoDB Atlas managed backups: 7-day retention (automated platform snapshots).
   - Application-level encrypted Google Drive backup: 30-day retention (AES-256 encrypted export).
   - The two mechanisms are strictly separate.
8. **User Passwords & Provisioning**:
   - Admin sets initial temporary password.
   - Forced password change on first user login.
   - No self-service email reset-link workflow in V1.
9. **Rent Collection & Payment Management (P12 Scope & Boundary)**:
   - Rent collection is an acknowledged dedicated functional module, distinct from inward GRN capture.
   - The GR remains the canonical source of the rent obligation (`Rent Type`, `Rent Amount`).
   - Rent payment transactions are recorded against the GR obligation in an append-only ledger.
   - Payment Mode is strictly controlled: `Cash` or `UPI`.
   - Payment Status is strictly derived: `Settled` (balance = ₹0) or `Not Settled` (balance > ₹0).
   - Negative balance is not an approved state; the system must not silently accept or create a negative rent balance. Until overpayment rules are explicitly approved, any payment exceeding the remaining balance must not be committed.
   - Do not implement refunds, excess-payment credit, carry-forward, automatic adjustment, or any other overpayment behavior.
   - Unspecified rules (refunds, cancellations, reversals, UPI reference ID, overpayment handling, backdated payments, late fees, grace periods, GST/tax, rent calculation formulas, invoicing, payment gateways) are NOT invented and are explicitly parked.
10. **Locale & Standards**:
    - Timezone: `Asia/Kolkata` (IST).
    - Documents & Print: English.
    - Input formats: India-oriented vehicle registration and 10-digit mobile number validation.
    - No artificial or unconfirmed stricter format restrictions.

---

## 2. Confirmed Business Workflows

### Inward Entry (Goods Receipt Note)
- Customer Name
- GR Number (Financial Year sequential)
- Date
- Commodity
- Number of Bags
- Bag Type: `S` / `B` / `S+B`
- Rent Type: `Monthly` / `Seasonal`
- If Monthly: No. of Months
- Rent Amount
- Vehicle Number
- Chamber Number
- Remarks

### Delivery Entry (Outward Challan)
- Customer Name (auto-filled from GR)
- GR Number (selected reference)
- Delivery Challan Number (independent sequence)
- Date
- Commodity (auto-filled from GR)
- Number of Bags to Deliver
- Vehicle Number
- Driver Name
- Weight
- Remarks

### GR Search & Operational Ledger View
- Search by GR Number
- Customer Name (auto-filled)
- GR Number
- Date
- Commodity (auto-filled)
- Chamber Number (auto-filled)
- Total Bags Received (derived from ledger)
- Total Bags Delivered (derived from ledger)
- Current Balance Bags (derived from ledger)
- Delivery History (list of confirmed delivery challans)
- Rent Type
- Rent Amount
- Payment Status (`Settled` / `Not Settled`)
- GR Status (`Open` / `Closed`)

### Rent Collection Workflow (P12)
1. **Search**: Search by GR Number.
2. **Load GR Details (Auto-filled from GR, Read-Only)**:
   - Customer Name
   - GR Number
   - Commodity
   - Date of Inward
   - Rent Type
   - Rent Amount
3. **Payment Entry (User Input)**:
   - Amount Paid (valid positive monetary amount)
   - Payment Date (valid date)
   - Payment Mode (strictly `Cash` or `UPI`)
4. **Automatic Calculation & Validation (Derived)**:
   - $\text{Balance Amount} = \text{Rent Amount} - \sum(\text{Amount Paid})$
   - **Overpayment Guard**: Negative balance is not an approved state. The system must not silently accept or create a negative rent balance. Until an overpayment business rule is explicitly approved, a payment that would make the balance negative must not be committed.
   - **Payment Status**:
     - If $\text{Balance Amount} = 0 \longrightarrow \text{Settled}$
     - If $\text{Balance Amount} > 0 \longrightarrow \text{Not Settled}$
   - No manual override of Balance or Payment Status permitted.
5. **Receipt Generation**:
   - System generates independent, FY-sequential Rent Receipt Number.
6. **Payment History**:
   - Append-only transaction record added (Receipt Number, Payment Date, Amount Paid, Payment Mode, Remaining Balance, Payment Status, Created By/At).
   - Confirmed payment transactions must not be silently edited or deleted. Any future correction or reversal must use the approved correction/reversal workflow once its detailed rules are specified and approved.
7. **Print Receipt**:
   - Rendered through standard document/printing architecture binding to System Settings.

---

## 3. Core Business & Architecture Rules

1. **Derived Fields Are Immutable to User Edits**:
   - Users must never manually edit:
     - Total Bags Received
     - Total Bags Delivered
     - Current Balance Bags
     - GR Status
     - Rent Balance Amount
     - Payment Status
   - Customer and Commodity in Delivery Entry are auto-filled from the selected GR.
   - Rent details in Rent Collection are auto-filled from the selected GR.
2. **Canonical Data Ownership & SSOT**:
   - GR is the sole SSOT for the rent obligation.
   - The Rent Collection module records transaction records referencing the GR.
   - Hierarchy:
     $$\text{GRN} \longrightarrow \text{Rent Obligation} \longrightarrow \text{Rent Payment Transactions } [T_1, T_2, \dots]$$
   - Single canonical source for Rent Amount, Total Paid, Balance, and Payment Status.
   - No duplicate rent obligation records or parallel payment ledger systems.
3. **Overpayment & Balance Invariant**:
   - Negative balance is strictly prohibited.
   - The system must reject any payment transaction where $\text{Amount Paid} > \text{Remaining Balance}$.
   - No excess credit, refund, carry-forward, or adjustment logic is to be assumed or implemented.
4. **Atomic Over-Delivery Protection**:
   - Deliveries support both Partial and Full delivery.
   - Outward delivery transactions must atomically check available remaining balance on the backend; over-delivery is strictly rejected.
5. **Automatic Lifecycle Transition**:
   - When remaining balance bags reaches zero through a valid delivery transaction:
     $$\text{GR Status} \longrightarrow \text{CLOSED}$$
6. **Transaction Immutability & Reversal Governance**:
   - Confirmed inventory, receipt, delivery, and rent payment transactions must not be silently edited or deleted.
   - Any future correction or reversal must use the approved correction/reversal workflow. Detailed correction/reversal rules for P12 remain pending approval and will not be implemented prematurely.
7. **Single Validation Source of Truth (SSOT)**:
   - Shared Zod contracts package (`packages/contracts`) consumed by frontend and backend.
   - No competing validation definitions. Backend domain services enforce transaction/business constraints.
8. **Machine-Readable Permissions & Facility Scoping**:
   - Centralized permission mapping; no inline role check scattering.
   - Permissions include `rent:collect`, `rent:view`, `rent:print`.
   - `SUPER_ADMIN`, `ADMIN`, `OPERATOR` may record payments; `READ_ONLY` restricted to viewing.
   - Facility-scoped access control: users operate strictly within assigned `facilityIds[]`. `SUPER_ADMIN` holds global facility scope.
9. **System Settings Singleton & Unified Document SSOT**:
   - Centralized management for Organization Name, Address, Contact, GSTIN, Logo, Print Footer, Document Numbering, and Timezone.
   - Document templates (GRN, Inward Receipt, Delivery Challan, Rent Payment Receipt) dynamically consume settings.
   - Single printing/document rendering engine; zero hard-coded company information.
10. **DataTable State Rule**:
    - UI table state (filters, sorting, column visibility, pagination) is presentation-only and must NEVER be treated as a source of truth for business balances or occupancy.
    - All table controls must be fully functional when built; no decorative controls.
11. **Responsive UI/UX Standards**:
    - Mobile-first, single visual design system across desktop, tablet, and mobile.
    - Rent Collection screen structured into 7 functional sections:
      1. GR Number search
      2. GR details section
      3. Rent summary
      4. Payment entry section
      5. Current balance / status
      6. Payment history
      7. Receipt / print action
    - Auto-filled fields visually distinguished from editable payment inputs.

---

## 4. Pending Business Decisions (P12 Parking)

The following billing and payment parameters remain pending formal business specification and must NOT be implemented or assumed:
- Refund handling workflow.
- Payment cancellation rules.
- Payment reversal / correction workflow for rent transactions.
- UPI transaction reference / UTR number capture.
- Overpayment handling rules (excess-payment credit, carry-forward, automatic adjustment).
- Backdated payment entry rules.
- Receipt cancellation workflow.
- Late-payment fees and grace periods.
- Interest calculation rules.
- GST / tax calculation and invoicing requirements.
- Rent-rate calculation engine (e.g. per bag-month, per quintal-season).
- Online payment gateway integration.
- Additional payment modes beyond Cash and UPI.

---

## 5. Implementation Roadmap (P0 – P12)

| Phase | Phase Name | Focus |
|---|---|---|
| **P0** | **Discovery + Requirement Lock** | Architecture lock, assumptions isolation, business sign-off |
| **P1** | **Governance + Foundation** | Monorepo setup, shared contracts SSOT, hygiene gate, CI |
| **P2** | **Auth + Users + RBAC** | User accounts, temporary passwords, facility scoping, RBAC middleware |
| **P3** | **Master Data + Storage Hierarchy** | Customers, commodity catalog, warehouse layout (`Facility -> Chamber -> Rack -> Level -> Position`) |
| **P4** | **GRN + Acknowledgement** | Inward Goods Receipt, independent receipt numbers, S/B/S+B bag types, rent terms |
| **P5** | **Inventory + Rack Allocation** | Put-away workflow, rack allocation, immutable stock ledger |
| **P6** | **Delivery + Full/Partial + Closure** | Outward orders, partial deliveries, challan issuance, compensating reversals, GRN closure |
| **P7** | **Shared Tables + Dashboard + Responsive UX** | Functional DataTable (search/filter/sort/export/paginate), operational dashboard |
| **P8** | **Import + Export** | Validated bulk CSV/Excel import and stream-safe export |
| **P9** | **Documents + Print + PDF** | Dynamic print templates binding to System Settings (GRN, Receipt, Challan, Rent Receipt) |
| **P10** | **Audit + Backup** | Immutable audit log trail, Atlas snapshot monitoring, encrypted Google Drive backup job |
| **P11** | **Security + Performance + E2E + Hardening** | Rate-limiting, OWASP hardening, full end-to-end multi-facility verification |
| **P12** | **Rent Collection & Payment Management** | Rent Collection, GR-based rent obligation, payment transactions, balance calculation, Settled / Not Settled status, payment history, independent receipt numbering, rent payment receipt, print receipt, audit integration, RBAC integration, document/printing integration |
