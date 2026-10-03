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

input_regex = re.compile(r'<input\b(?![^>]*\b(type=["\']hidden["\']))[^>]*>')
label_attrs = ['aria-label', 'aria-labelledby', 'id', 'placeholder', '{...rest}', '{...props}']

for dirpath, _, filenames in os.walk(frontend_src):
    for fn in filenames:
        if fn.endswith('.tsx'):
            fpath = os.path.join(dirpath, fn)
            rel = os.path.relpath(fpath, root)
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
                # Find input tags
                for match in input_regex.finditer(content):
                    tag = match.group(0)
                    if not any(attr in tag for attr in label_attrs):
                        violations.append(f"{rel}: input missing accessible label/id: {tag[:60]}")

if violations:
    print(f"[FAIL] Found {len(violations)} accessibility label violations:")
    for v in violations[:10]:
        print(f"  - {v}")
    sys.exit(1)
else:
    print("[PASS] All interactive inputs have accessible identifiers or labels.")
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
