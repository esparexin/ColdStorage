# Frontend Page & Component Decomposition Guidelines

**Status**: ACTIVE & MANDATORY  
**Target Scope**: Next.js App Router (`packages/frontend/src/app/`)

---

## 1. Architectural Philosophy

Next.js `page.tsx` files must act strictly as **coordinators**, not implementation monoliths.

```text
Route (page.tsx) [<= 100 lines]
  ├── Context & Route Params
  ├── Custom Hook (Domain State, Fetching, Mutations) [<= 150 lines]
  └── Presentation Components (Tables, Modals, Forms, Sections) [<= 150 lines]
```

### Prohibited Monolithic Patterns:
- Inlining multiple modal dialogs directly into page JSX.
- Managing 10+ distinct `useState` calls in a single page component.
- Inlining large `DataTableColumn[]` definitions, date formatters, and math calculations in the page body.
- Embedding raw HTTP client fetchers and error dispatchers in UI components.

---

## 2. Directory Layout Convention

For any application domain with non-trivial functionality (e.g. `grns`, `deliveries`, `inventory`, `storage`, `rent`):

```text
packages/frontend/src/app/<feature>/
├── page.tsx                       # Coordinator shell (Target: <= 100 lines)
├── page.module.css                # Scoped layout CSS
├── components/                    # UI Components (Target: <= 150 lines each)
│   ├── <Feature>Table.tsx         # Data table definition & row actions
│   ├── <Feature>FilterToolbar.tsx # Search input, status & lookup filters
│   ├── Create<Feature>Modal.tsx   # Creation dialog
│   └── <Feature>DetailModal.tsx   # Details inspection drawer/modal
└── hooks/                         # Custom Hooks (Target: <= 150 lines each)
    ├── use<Feature>Data.ts        # Data fetching, lookups, search state
    └── use<Feature>Form.ts        # Form state, calculations, submit handler
```

---

## 3. Strict Boundary Rules

1. **State Ownership**: Data fetching, caching, and state transitions belong in dedicated hooks under `hooks/`.
2. **Modal Isolation**: Each modal must be a self-contained component receiving open/close callbacks and item props.
3. **Table Column Decoupling**: Column definitions should reside either within the dedicated table component or a colocated `columns.tsx` helper.
4. **Zero Duplication**: Extracting components must not duplicate API calls, types, or business validation logic.
