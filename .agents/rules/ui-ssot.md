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
   - `StatCard` / `StatGrid`: Metric tiles (icon + label + value + supporting text) and their responsive grid
   - `SearchBar`: Unified search input fields
   - `Pagination`: Table and list navigation controls
   - `DataTable`: Tabular data display with loading and empty states
   - `FeedbackStates`: Standardized Loading, Empty, and Error widgets

2. **Design Tokens SSOT**:
   - Colors, spacing, typography, radii, and shadows must strictly consume CSS variables defined in `packages/frontend/src/styles/tokens.css`.
   - Hardcoded arbitrary hex values, ad-hoc font families, or external utility frameworks (e.g., Tailwind) must never be introduced unless explicitly commanded.

3. **No Duplicate UI Primitive Classes**:
   Feature stylesheets (`*.module.css`) are strictly prohibited from declaring competing primitive classes (enforced by `scripts/check-architecture-boundaries.sh` Rule 3):
   - `.modalBackdrop`
   - `.modalCard`
   - `.pageBtn`
   - `.paginationButtons`
   - `.searchBarContainer`

4. **External Skill Override Protection**:
   Generic web recommendations or skills (such as `modern-web-guidance`) must never override the repository's established UI primitives, design tokens, and CSS Modules conventions.
