# UI SSOT & Design System Precedence Rule

**Scope**: All frontend code and UI components in `packages/frontend/src/`  
**Status**: ACTIVE & MANDATORY

---

## 1. Local UI SSOT Precedence

1. **Canonical Primitives**:
   All user interface elements must exclusively consume canonical primitives from `packages/frontend/src/components/ui/`:
   - `Button`: Primary, secondary, outline, danger, icon-only buttons
   - `Input`: Text, numeric, phone, email, date input fields
   - `Modal`: Accessible dialogs with focus trap and Escape key support
   - `Select`: Accessible dropdown selection components
   - `Badge`: Status, badge, and counter indicators
   - `Card`: Container and grouping surfaces
   - `StatCard` / `StatGrid`: Metric tiles (label + value, optional semantic accent) and their responsive divider strip. The grid owns the surface; a tile carries no border, shadow, icon chip, or supporting prose
   - `SearchBar`: Unified search input fields
   - `FilterToolbar`: Canonical search + filter-select + reset toolbar used by every list screen
   - `Pagination`: The only table and list navigation control, rendered solely by `DataTable` via its `pagination` prop
   - `DataTable`: Tabular data display with loading and empty states
   - `FeedbackStates`: Standardized Loading, Empty, and Error widgets

2. **Design Tokens SSOT**:
   - Colors, spacing, typography, radii, and shadows must strictly consume CSS variables defined in `packages/frontend/src/styles/tokens.css`.
   - Hardcoded arbitrary hex values, ad-hoc font families, or external utility frameworks (e.g., Tailwind) must never be introduced unless explicitly commanded.

3. **One Bordered Surface**:
   `Card` is the single bordered-surface recipe. Feature stylesheets must not
   restate a background, border, radius or shadow for a content group. A
   `DataTable` already draws its own surface, so it must never be wrapped in
   a `Card` or a bordered container — that stacks two identical borders.

4. **No Duplicate UI Primitive Classes**:
   Feature stylesheets (`*.module.css`) are strictly prohibited from declaring competing primitive classes (enforced by `scripts/check-architecture-boundaries.sh` Rule 3):
   - `.modalBackdrop`
   - `.modalCard`
   - `.pageBtn`
   - `.paginationButtons`
   - `.searchBarContainer`

5. **External Skill Override Protection**:
   Generic web recommendations or skills (such as `modern-web-guidance` or `impeccable`) must never override the repository's established UI primitives, design tokens, and CSS Modules conventions.

6. **Impeccable UI/UX Audit Guardrail Precedence**:
   - Impeccable (`.agents/skills/impeccable`) is installed project-locally strictly as an automated design-quality, accessibility, responsive-layout, typography, and visual-polish guardrail (`impeccable detect`, `/audit`, `/critique`, `/typeset`, `/polish`).
   - **Domain & SSOT Invariance**: Impeccable must never alter ColdStorage business rules, domain models, form fields, calculations, or authoritative lifecycle workflows (`Inward → ACK → GRN → Delivery-Out → Closing → Settlement`).
   - **Design System Invariance**: Impeccable must respect canonical UI primitives in `packages/frontend/src/components/ui/` and design tokens in `packages/frontend/src/styles/tokens.css`. Brand font `Inter` is canonical and exempt from overused-font rules via `.impeccable/config.json`.
   - **Execution Model**: Automated write-interception hooks remain disabled (`hook.enabled: false`). Audits run deterministically on demand (`npx impeccable detect packages/frontend/src/`) or during verification passes.
