#!/usr/bin/env bash
# Architecture Boundaries & UI SSOT Automated Governance Enforcement
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0

fail() {
  echo "[BOUNDARY-VIOLATION] $1"
  EXIT=1
}

echo "=== ARCHITECTURE BOUNDARY & UI SSOT GOVERNANCE AUDIT ==="

# 1. Backend Cross-Domain Boundaries: delivery/rent must not import grn internals
if grep -rn --include="*.ts" "from '\.\./\.\./grn/" "$ROOT/packages/backend/src/modules/delivery" 2>/dev/null; then
  fail "Delivery module has unauthorized internal imports from grn module."
fi

if grep -rn --include="*.ts" "from '\.\./\.\./grn/" "$ROOT/packages/backend/src/modules/rent" 2>/dev/null; then
  fail "Rent module has unauthorized internal imports from grn module."
fi

# 2. Storage-hierarchy retirement: the Facility -> Chamber -> Rack -> Level -> Position model
# has been replaced by a free-text chamber field on the GRN. These guards keep it retired.
RETIRED_HIERARCHY_ROUTES=(chamber rack level position)
for entity in "${RETIRED_HIERARCHY_ROUTES[@]}"; do
  if [ -f "$ROOT/packages/backend/src/routes/$entity.routes.ts" ]; then
    fail "Storage hierarchy is retired: $entity.routes.ts must not be reintroduced."
  fi
done

for model in chamber rack level position; do
  if [ -f "$ROOT/packages/backend/src/database/models/$model.model.ts" ]; then
    fail "Storage hierarchy is retired: $model.model.ts must not be reintroduced."
  fi
done

if [ -d "$ROOT/packages/frontend/src/app/storage" ]; then
  fail "Storage hierarchy is retired: the /storage feature module must not be reintroduced."
fi

# 3. UI SSOT Enforcement: feature stylesheets must not define competing UI primitives
FORBIDDEN_CLASSES=("\.modalBackdrop\b" "\.modalCard\b" "\.pageBtn\b" "\.paginationButtons\b" "\.searchBarContainer\b" "\.ledgerTable\b")
for cls in "${FORBIDDEN_CLASSES[@]}"; do
  if grep -rnE "$cls" "$ROOT/packages/frontend/src/app" --include="*.module.css" 2>/dev/null; then
    fail "Feature CSS defines duplicate competing UI primitive: $cls"
  fi
done

# 4. Route Contract Drift Enforcement: customer update must be PATCH, not PUT
if grep -rnE "method:\s*['\"]PUT['\"].*\/api\/customers" "$ROOT/packages/frontend/src" --exclude-dir=.next --exclude-dir=node_modules 2>/dev/null; then
  fail "Customer update route contract mismatch: frontend uses PUT instead of canonical PATCH."
fi

# 5. Legacy Directories Prohibition: packages/backend/src/tests must remain retired
if [ -d "$ROOT/packages/backend/src/tests" ]; then
  fail "Legacy test directory packages/backend/src/tests exists; tests must reside in __tests__."
fi

# 6. Put-Away Route Contract Enforcement: frontend must use /allocations, not /put-away
if grep -rnE "(\/grns\/[^\/]+\/put-away)" "$ROOT/packages/frontend/src" --exclude-dir=.next --exclude-dir=node_modules 2>/dev/null; then
  fail "Put-Away contract violation: frontend must call canonical '/allocations' endpoint, not '/put-away'."
fi

# 7. Chamber is free text, capped at 20 characters. Capacity, occupancy and utilization have no
# denominator once chamber is a label, so none may be reintroduced on the contracts or backend.
# Test files are excluded: they legitimately assert that these payloads are now rejected.
if grep -rnE "(capacityBags|occupiedBags|availableBags|utilizationRate|positionOccupancy)" \
  "$ROOT/packages/contracts/src" "$ROOT/packages/backend/src" \
  --include="*.ts" --exclude-dir=__tests__ --exclude="*.test.ts" 2>/dev/null; then
  fail "Chamber is free text: capacity/occupancy/utilization fields must not be reintroduced."
fi

# 8. Type SSOT: rack/level/position identifiers must not reappear in the shared contracts.
if grep -rnE "\b(positionId|positionCode|rackId|levelId|chamberId|chamberNumber)\b" \
  "$ROOT/packages/contracts/src" \
  --include="*.ts" --exclude-dir=__tests__ --exclude="*.test.ts" 2>/dev/null; then
  fail "Type SSOT violation: storage hierarchy identifiers must not reappear in @cold-storage/contracts."
fi

# 9. Mongoose Duplicate Schema Index Prevention
for model in "$ROOT/packages/backend/src/database/models"/*.ts; do
  [ -f "$model" ] || continue
  indexed_fields=$(grep -oE "[a-zA-Z0-9_]+:\s*\{[^}]*index:\s*true" "$model" | cut -d: -f1 || true)
  for f in $indexed_fields; do
    if grep -E "\.index\(\{\s*$f:\s*1\s*\}\)" "$model" >/dev/null 2>&1; then
      fail "Duplicate schema index on '$f' in $(basename "$model"): declared via both property index: true and schema.index()."
    fi
  done
done

# 11. UI SSOT Primitive Enforcement: no native <select> outside the DS primitive
if grep -rnE "<select(\b|[ >])" "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "components/ui/Select.tsx"; then
  fail "UI SSOT violation: native <select> bypasses the canonical Select primitive (components/ui/Select.tsx). Use <Select> instead."
fi

# 12. UI SSOT Primitive Enforcement: no native <button> in feature/layout code
# AppHeader/SidebarNav retain labeled icon-only chrome buttons by design; any other
# native button must use the canonical Button primitive.
NATIVE_BUTTON_HITS=$(grep -rnE "<button(\b|[ >])" "$ROOT/packages/frontend/src/app" "$ROOT/packages/frontend/src/components/layout" "$ROOT/packages/frontend/src/components/auth" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "AppHeader.tsx" \
  | grep -v "SidebarNav.tsx" || true)
if [ -n "$NATIVE_BUTTON_HITS" ]; then
  echo "$NATIVE_BUTTON_HITS" | head -20
  fail "UI SSOT violation: native <button> found outside components/ui. Use the canonical Button primitive (variant/size/leftIcon/isLoading)."
fi

# 13. Design Token SSOT: no raw hex/hsl colors outside the canonical token sheet
RAW_COLOR_HITS=$(grep -rnE "#[0-9a-fA-F]{3,8}\b|hsl\(" "$ROOT/packages/frontend/src" \
  --include="*.css" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "styles/tokens.css" || true)
if [ -n "$RAW_COLOR_HITS" ]; then
  echo "$RAW_COLOR_HITS" | head -20
  fail "Design Token SSOT violation: raw hex/hsl color found outside styles/tokens.css. Declare a --color-* token and consume var(--color-*)."
fi

# 14. DOM Integrity: duplicate element ids break label/aria association
DUPLICATE_IDS=$(grep -rhoE 'id="[a-zA-Z][a-zA-Z0-9_-]*"' "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | sort | uniq -d || true)
if [ -n "$DUPLICATE_IDS" ]; then
  echo "Duplicate element ids: $DUPLICATE_IDS"
  fail "DOM integrity violation: duplicate id attribute(s) found; label htmlFor/aria-* associations become ambiguous."
fi

# 15. Backend Logging Hygiene: Zero raw console.(log|warn|error) anywhere in backend src.
# utils/logger.ts is the single sanctioned logging entry point; scoping this to src/modules
# previously let a bare console.log survive in the process entry point.
if grep -rnE "console\.(log|warn|error)" "$ROOT/packages/backend/src" --include="*.ts" 2>/dev/null \
  | grep -v "packages/backend/src/utils/logger.ts"; then
  fail "Backend logging hygiene violation: raw console.* calls are prohibited outside utils/logger.ts. Use logger.info/warn/error or auditService."
fi

# 16. Frontend document printing must go through the canonical helper.
PRINT_HITS=$(grep -rn "window.open" "$ROOT/packages/frontend/src" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "packages/frontend/src/lib/print-document.ts" || true)
if [ -n "$PRINT_HITS" ]; then
  echo "$PRINT_HITS"
  fail "UI SSOT violation: document printing must go through lib/print-document.printHtmlDocument()."
fi

# 18. Frontend must not use blocking browser dialogs for errors or confirmations.
if grep -rnE "[^.a-zA-Z](alert|window\.confirm)\(" "$ROOT/packages/frontend/src" \
  --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null; then
  fail "UI SSOT violation: alert()/confirm() are prohibited. Surface errors through FeedbackStates or inline role=alert regions."
fi

# 19. Bag composition SSOT. A receipt, challan or ledger row stores smallBags + bigBags; the total is
# their sum. Reintroducing a stored `quantity`/`totalBags` alongside the parts is how a total and its
# components drift apart, so both are rejected outright.
if grep -rnE "^\s*(quantity|totalBags):\s*\{[^}]*type:\s*Number" \
  "$ROOT/packages/backend/src/database/models" \
  --include="*.ts" --exclude-dir=__tests__ 2>/dev/null; then
  fail "Bag composition SSOT violation: store smallBags + bigBags and derive the total at read time; a stored quantity/totalBags column must not be reintroduced."
fi

# 20. Balance-snapshot SSOT. A challan's opening/closing balance were write-time snapshots that went
# stale on reversal. Balances are derived from the ledger, so the fields must not come back.
if grep -rnE "(openingBags|closingBags):\s*\{[^}]*type:\s*Number" \
  "$ROOT/packages/backend/src/database/models" \
  --include="*.ts" --exclude-dir=__tests__ 2>/dev/null; then
  fail "Balance SSOT violation: stock balances are ledger-derived; stored openingBags/closingBags snapshots must not be reintroduced."
fi

# 21. Ledger self-sufficiency. The inward leg must be written inside the create-GRN transaction:
# without it the ledger holds only outward movements and every summed balance goes one-sided.
# This is a positive guard — the write must be present, not merely not-forbidden.
if ! grep -q "INWARD_PUTAWAY" "$ROOT/packages/backend/src/modules/grn/handlers/create-grn.handler.ts" 2>/dev/null; then
  fail "Ledger self-sufficiency violation: create-grn.handler.ts must write the INWARD_PUTAWAY row in the same transaction as the receipt."
fi

# 22. Single balance formula. The ledger carries the inward leg for every receipt, so there is no
# second formula to fall back to. Switching sources on a row-existence probe is how the dashboard
# once reported negative stock the moment a facility recorded its first delivery.
if grep -rn "hasLedgerTxns" "$ROOT/packages/backend/src" \
  --include="*.ts" --exclude-dir=__tests__ --exclude="*.test.ts" 2>/dev/null; then
  fail "Single-formula violation: balances come from the ledger for every facility; a hasLedgerTxns source switch must not be reintroduced."
fi

# 23. GR Number business-key SSOT. grnNumber is the sole business key across the lifecycle.
# inwardReceiptNumber (RCPT) and bondNumber (BND) may still be minted and printed as reference
# text, but neither may become a lookup, search or sort key, and neither may be minted per
# receipt. Storage Mark and Bond # must not be stored as copies of the GR Number either.
if grep -rnE "(inwardReceiptNumber|bondNumber)\s*:\s*regex" \
  "$ROOT/packages/backend/src/modules" --include="*.ts" --exclude-dir=__tests__ 2>/dev/null; then
  fail "Business-key SSOT violation: inwardReceiptNumber/bondNumber must not be a GRN search key. grnNumber is the sole business key."
fi
if grep -rnE "\{ (inwardReceiptNumber|bondNumber): regex \}" \
  "$ROOT/packages/backend/src/modules" --include="*.ts" --exclude-dir=__tests__ 2>/dev/null; then
  fail "Business-key SSOT violation: inwardReceiptNumber/bondNumber must not appear in a GRN \$or search clause."
fi
if grep -rn "generateBondNumber" "$ROOT/packages/backend/src" --include="*.ts" --exclude-dir=__tests__ 2>/dev/null; then
  fail "Business-key SSOT violation: no BND- bond number may be minted per receipt; the GR Number is displayed as Bond #."
fi

# 23b. The GR Number is entered by the operator as exactly four digits and is never allocated.
# A counter-backed generator would silently reintroduce sequencing the manual flow deliberately
# drops, and a read-only form field would reintroduce the value the operator is meant to own.
# The guidance endpoint may only report a suggestion; it must not gate submission.
if grep -rnE "generateGrnNumber|previewNextGrnNumber|DOCUMENT_PREFIXES\.grn" \
  "$ROOT/packages/backend/src" "$ROOT/packages/frontend/src" --include="*.ts" --include="*.tsx" \
  --exclude-dir=__tests__ 2>/dev/null; then
  fail "Business-key SSOT violation: the GR Number is manual and unsequenced; a counter-backed generator or preview must not return."
fi
if ! grep -q "input.grnNumber" \
  "$ROOT/packages/backend/src/modules/grn/handlers/create-grn.handler.ts" 2>/dev/null; then
  fail "Business-key SSOT violation: create-grn.handler.ts must persist the operator-entered input.grnNumber verbatim."
fi
if grep -rnE "create-gr-number.*readOnly|create-gr-number" \
  "$ROOT/packages/frontend/src/app/grns/components/CreateGrnModal.tsx" 2>/dev/null \
  | grep -q "readOnly"; then
  fail "Business-key SSOT violation: the GR Number input must be operator-editable, not read-only."
fi

# 24. Compact action overrides. Table actions use DS Button size=sm directly; a competing
# .actionBtn class that re-imposes 11px/24px via !important is how compact tables drifted
# off the type scale. Keep the scale in tokens.css, not in feature overrides.
if grep -rnE "\.actionBtn\b" "$ROOT/packages/frontend/src/app" \
  --include="*.module.css" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null; then
  fail "UI SSOT violation: .actionBtn competing override found. Use DS Button size=sm without a feature-level override."
fi
if grep -rnE "styles\.actionBtn" "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null; then
  fail "UI SSOT violation: styles.actionBtn usage found. Render DS Button size=sm without the legacy class."
fi

# 25. Token typography/spacing. Screen UI must consume the type scale (var(--text-*)),
# spacing scale (var(--space-*)) and color roles (var(--color-*-text) for text). Hardcoded
# 11px/10px cell text, hex fallbacks inside var(), and references to tokens that do not
# exist (surface-3, danger-border, space-2-5) are how this audit's drift re-entered.
# The standalone print template (renderGrnStockHtml.ts) and tokens.css itself are excluded:
# it is a 148mm A6 print document that legitimately needs its own px type sizes.
# Raw-px spacing and !important typography are enforced by the two rules that follow.
if grep -rnE "font-size:\s*(11px|10px)" "$ROOT/packages/frontend/src" \
  --include="*.css" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "styles/tokens.css"; then
  fail "UI SSOT violation: hardcoded 11px/10px font-size found. Use var(--text-xs) for micro-label and table subtext."
fi
if grep -rnE "fontSize:\s*['\"](11px|10px)['\"]" "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null; then
  fail "UI SSOT violation: hardcoded fontSize 11px/10px found in TSX. Use fontSize: 'var(--text-xs)'."
fi
if grep -rnE "var\(--[a-zA-Z0-9-]+\s*,\s*#[0-9a-fA-F]{3,6}" "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null; then
  fail "Design Token SSOT violation: hex fallback inside var() found. Reference the canonical var(--color-*) with no hex fallback."
fi
if grep -rnE "(surface-3|danger-border|space-2-5)" "$ROOT/packages/frontend/src" \
  --include="*.css" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "renderGrnStockHtml.ts"; then
  fail "Design Token SSOT violation: reference to a non-existent token found. Use only tokens declared in styles/tokens.css."
fi

# 25b. No !important on typography in feature CSS.
# enforcement-rules.md rule 25 has always promised this and it was never implemented.
# Two tab strips carried 26 !important declarations re-stating the shared Button
# primitive's font-size, font-weight, border and color, which is exactly the drift
# gate 24 blocks .actionBtn for. The proper fix is to scope the feature selector to
# its container so specificity does the work -- (0,0,2,0) outranks the primitive's
# (0,0,1,0) regardless of stylesheet emission order.
# components/ui is excluded: the primitives legitimately own the type scale.
# CSS comments are stripped first so prose mentioning !important does not trip it.
IMPORTANT_TYPOGRAPHY=$(python3 - <<EOF
import os, re
root = "$ROOT/packages/frontend/src/app"
decl = re.compile(r'\b(font-size|font-weight|line-height|letter-spacing|'
                  r'text-transform|font-family|font-stretch)\s*:[^;{}]*!important')
hits = []
for dirpath, _, filenames in os.walk(root):
    for fn in sorted(filenames):
        if not fn.endswith('.css'):
            continue
        p = os.path.join(dirpath, fn)
        with open(p, encoding='utf-8', errors='ignore') as f:
            for i, line in enumerate(f, 1):
                if '/*' in line:
                    line = re.sub(r'/\*.*?\*/', ' ', line)
                if decl.search(line):
                    hits.append(f"{os.path.relpath(p, root)}:{i}: {line.strip()}")
print('\n'.join(hits))
EOF
)
if [ -n "$IMPORTANT_TYPOGRAPHY" ]; then
  echo "$IMPORTANT_TYPOGRAPHY" | head -20
  fail "UI SSOT violation: !important on a typography property in feature CSS. Scope the selector to its container so specificity outranks the primitive instead."
fi

# 26. Undefined Design Token SSOT.
# Previously a four-name denylist (--text-md, bare --color-surface,
# --color-border-subtle, --color-surface-hover). A denylist only rejects names
# someone thought of in advance, which is how --text-2xs, --line-height-tight and
# --color-border-hover all shipped past a green gate. This now resolves every
# var(--x) reference against the declarations actually present in tokens.css.
#
# A reference is legal when the token is declared in tokens.css, when it supplies an
# inline fallback (var(--x, y)), or when the token is set at runtime -- which is how
# --font-inter (injected by next/font) and --stat-min (set by StatCard.tsx) stay legal.
UNDEFINED_TOKEN_HITS=$(python3 - <<EOF
import os, re
root = "$ROOT/packages/frontend"
src = os.path.join(root, "src")
tokens_css = os.path.join(src, "styles", "tokens.css")

declared = set()
try:
    with open(tokens_css, encoding='utf-8', errors='ignore') as f:
        for m in re.finditer(r'(--[A-Za-z0-9-]+)\s*:', f.read()):
            declared.add(m.group(1))
except OSError:
    pass

runtime_set = set()
for dirpath, dirnames, filenames in os.walk(src):
    dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.next')]
    for fn in filenames:
        if not fn.endswith(('.ts', '.tsx')):
            continue
        with open(os.path.join(dirpath, fn), encoding='utf-8', errors='ignore') as f:
            for m in re.finditer(r"['\"](--[A-Za-z0-9-]+)['\"]\s*:", f.read()):
                runtime_set.add(m.group(1))

known = declared | runtime_set
var_ref = re.compile(r'var\(\s*(--[A-Za-z0-9-]+)\s*(,|\))')
hits = []
for dirpath, dirnames, filenames in os.walk(src):
    dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.next')]
    for fn in sorted(filenames):
        if not fn.endswith(('.css', '.ts', '.tsx')):
            continue
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, root)
        with open(p, encoding='utf-8', errors='ignore') as f:
            lines = f.read().splitlines()
        for i, line in enumerate(lines, 1):
            if fn.endswith('.css') and '/*' in line:
                line = re.sub(r'/\*.*?\*/', ' ', line)
            for m in var_ref.finditer(line):
                name, tail = m.group(1), m.group(2)
                if name in known:
                    continue
                # var(--x, fallback) carries its own default, so it cannot resolve empty.
                if tail == ',':
                    continue
                hits.append(f"{rel}:{i}: {name}")
print('\n'.join(sorted(set(hits))))
EOF
)
if [ -n "$UNDEFINED_TOKEN_HITS" ]; then
  echo "$UNDEFINED_TOKEN_HITS" | head -20
  fail "Design Token SSOT violation: var() reference to a token that is neither declared in styles/tokens.css nor set at runtime. Declare it in tokens.css or use one that is."
fi

# 27. Single Bordered Surface SSOT:
# DataTable renders its own bordered container; wrapping it in Card creates a duplicate outer border.
DOUBLE_BORDER_HITS=$(python3 - <<EOF
import os, re
root = "$ROOT/packages/frontend/src/app"
violations = []
for dirpath, _, filenames in os.walk(root):
    for f in filenames:
        if f.endswith('.tsx'):
            p = os.path.join(dirpath, f)
            with open(p, 'r', encoding='utf-8') as fp:
                c = fp.read()
                matches = re.finditer(r'<Card\b[^>]*>(.*?)</Card>', c, re.DOTALL)
                for m in matches:
                    if '<DataTable' in m.group(1):
                        violations.append(f"{os.path.relpath(p, root)}: <DataTable> wrapped inside <Card>")
if violations:
    for v in violations:
        print(v)
    exit(1)
EOF
) || true
if [ -n "$DOUBLE_BORDER_HITS" ]; then
  echo "$DOUBLE_BORDER_HITS"
  fail "UI SSOT violation: DataTable wrapped inside Card creates duplicate border. Place DataTable directly on the page surface."
fi

# 28. Screen Table SSOT:
# Interactive screen tabular views must consume canonical <DataTable> from components/ui.
# Zero baseline exceptions: all screen tabular views are standardized to <DataTable>.
RAW_TABLE_HITS=$(grep -rnE "<table(\b|[ >])" "$ROOT/packages/frontend/src/app" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null || true)
if [ -n "$RAW_TABLE_HITS" ]; then
  echo "$RAW_TABLE_HITS"
  fail "Table SSOT violation: raw <table> found in feature code. Migrate to canonical <DataTable>."
fi

# 29. Shared Button Primitive SSOT:
# Feature and utility components must consume Button primitive rather than raw <button>.
RAW_FEEDBACK_BTN_HITS=$(grep -rnE "<button(\b|[ >])" "$ROOT/packages/frontend/src/components/ui/FeedbackStates.tsx" 2>/dev/null || true)
if [ -n "$RAW_FEEDBACK_BTN_HITS" ]; then
  echo "$RAW_FEEDBACK_BTN_HITS"
  fail "UI SSOT violation: raw <button> found in FeedbackStates.tsx. Use canonical Button primitive."
fi

# 30. Document Print Paper Size SSOT (A6 Only: 105 x 148 mm):
# All document templates and print stylesheets must conform exclusively to A6 dimensions.
# Unintended A4, A5, or Letter page-size configurations are prohibited.
FORBIDDEN_PAGE_SIZES=$(grep -rnE "@page\s*\{[^}]*size:\s*(A4|A5|Letter)" "$ROOT/packages" \
  --include="*.ts" --include="*.tsx" --include="*.css" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next 2>/dev/null || true)
if [ -n "$FORBIDDEN_PAGE_SIZES" ]; then
  echo "$FORBIDDEN_PAGE_SIZES"
  fail "Document Page Size SSOT violation: print layouts must use A6 dimensions (105mm 148mm or 148mm 105mm). A4/A5/Letter sizes are prohibited."
fi

# 31. Component File Naming SSOT (PascalCase Only):
# All React .tsx component files under components/ directories must be named in PascalCase.
# camelCase or kebab-case .tsx components are prohibited.
CAMEL_COMPONENT_HITS=$(find "$ROOT/packages/frontend/src" -path "*/components/*.tsx" -exec basename {} \; | grep -E '^[a-z]' || true)
if [ -n "$CAMEL_COMPONENT_HITS" ]; then
  echo "$CAMEL_COMPONENT_HITS"
  fail "Component File Naming SSOT violation: component files under components/ must be PascalCase (e.g. TableColumns.tsx, not tableColumns.tsx)."
fi

# 32. GRN Search Placeholder Field Alignment Governance:
# Placeholders in GlobalGrnSearch and GrnFilterToolbar must not promise fields (such as 'Bill #' or 'Bond #')
# that are not queryable in the backend grn.service.ts $or search clause.
FORBIDDEN_PLACEHOLDER_HITS=$(grep -rnE '(placeholder|searchPlaceholder)=.*(Bill #|Bond #)' "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null || true)
if [ -n "$FORBIDDEN_PLACEHOLDER_HITS" ]; then
  echo "$FORBIDDEN_PLACEHOLDER_HITS"
  fail "Search Placeholder Governance violation: frontend search inputs must not advertise unqueryable fields ('Bill #' or 'Bond #'). Backend grn.service.ts only indexes grnNumber, customerName, commodityName, gpNumber, vehicleNumber."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] All architecture boundaries and UI SSOT governance checks passed."
fi

exit "$EXIT"


