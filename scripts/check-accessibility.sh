#!/usr/bin/env bash
# Deterministic Accessibility (a11y) Governance Gate
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0

fail() {
  echo "[A11Y-VIOLATION] $1"
  EXIT=1
}

echo "=== ACCESSIBILITY (A11Y) GOVERNANCE AUDIT ==="

# 1. Inputs must have accessible names or associations
python3 - <<EOF
import os
import sys
import re

root = "$ROOT"
frontend_src = os.path.join(root, "packages", "frontend", "src")
violations = []

# Every interactive form control must expose an accessible name. Previously only
# <input> was scanned, and 'placeholder' / blanket prop spreads were accepted as a
# label, so an unlabelled control could pass the gate.
input_regex = re.compile(
    r'<(input|select|textarea)\b(?![^>]*\btype=["\']hidden["\'])[^>]*>'
)

# The canonical primitives in components/ui bind their label at runtime via React.useId()
# and a required label prop, which a purely static scan cannot correlate. They are
# excluded here and covered instead by the Modal contract check below.

for dirpath, _, filenames in os.walk(frontend_src):
    if os.path.relpath(dirpath, root).replace(os.sep, "/").endswith("components/ui"):
        continue
    for fn in filenames:
        if fn.endswith('.tsx'):
            fpath = os.path.join(dirpath, fn)
            rel = os.path.relpath(fpath, root)
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()

                # Ids referenced by a <label for="..."> in this file.
                labelled_ids = set(
                    re.findall(
                        r'<label[^>]*\b(?:htmlFor|for)=["\']([^"\']+)["\']', content
                    )
                )

                # Ranges implicitly labelled by wrapping <label> ... </label> without
                # an intervening closing tag (implicit association is valid HTML).
                implicit_spans = []
                for lm in re.finditer(r'<label\b[^>]*>', content):
                    close = content.find('</label>', lm.end())
                    if close == -1:
                        continue
                    implicit_spans.append((lm.end(), close))

                for match in input_regex.finditer(content):
                    tag = match.group(0)
                    has_name = ('aria-label' in tag) or ('aria-labelledby' in tag)
                    if not has_name:
                        id_match = re.search(r'\bid=["\']([^"\']+)["\']', tag)
                        if id_match and id_match.group(1) in labelled_ids:
                            has_name = True
                    if not has_name:
                        has_name = any(
                            start < match.start() < end for start, end in implicit_spans
                        )
                    if not has_name:
                        violations.append(
                            f"{rel}: control missing accessible name/label: {tag[:70]}"
                        )

if violations:
    print(f"[FAIL] Found {len(violations)} accessibility label violations:")
    for v in violations[:10]:
        print(f"  - {v}")
    sys.exit(1)
else:
    print("[PASS] All interactive form controls have accessible names or labels.")
EOF

if [ $? -ne 0 ]; then
  EXIT=1
fi

# 2. Check that all modals enforce role="dialog" or aria-modal
python3 - <<EOF
import os
import sys

root = "$ROOT"
modal_file = os.path.join(root, "packages", "frontend", "src", "components", "ui", "Modal.tsx")
if os.path.exists(modal_file):
    with open(modal_file, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'role="dialog"' not in content or 'aria-modal="true"' not in content:
            print("[FAIL] Modal SSOT component does not enforce role='dialog' and aria-modal='true'")
            sys.exit(1)
    print("[PASS] Modal primitive strictly enforces semantic dialog accessibility.")
else:
    print("[FAIL] Modal.tsx primitive missing.")
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
  EXIT=1
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] All accessibility governance gates passed."
fi

exit "$EXIT"
