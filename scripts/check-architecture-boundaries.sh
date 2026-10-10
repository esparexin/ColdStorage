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
FORBIDDEN_CLASSES=("\.modalBackdrop\b" "\.modalCard\b" "\.pageBtn\b" "\.paginationButtons\b" "\.searchBarContainer\b")
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
# The standalone print template (renderPassbookHtml.ts) and tokens.css itself are excluded.
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
  | grep -v "renderPassbookHtml.ts"; then
  fail "Design Token SSOT violation: reference to a non-existent token found. Use only tokens declared in styles/tokens.css."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] All architecture boundaries and UI SSOT governance checks passed."
fi

exit "$EXIT"

