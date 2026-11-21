#!/usr/bin/env bash
# Deterministic line-budget & ratchet audit for source files (.ts, .tsx, .css)
# Standard: Max 250 lines per source file.
# Permanent Zero-Baseline: scripts/line-budget-baseline.json must remain empty ({}).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_FILE="$ROOT/scripts/line-budget-baseline.json"
MAX_LINES=250

EXIT=0
NEW_VIOLATIONS=()
GREW_VIOLATIONS=()

# Helper python script to perform the exact audit
python3 - <<EOF
import os
import sys
import json

root = "$ROOT"
baseline_path = "$BASELINE_FILE"
max_lines = $MAX_LINES

baseline = {}
if os.path.exists(baseline_path):
    with open(baseline_path, 'r', encoding='utf-8') as f:
        baseline = json.load(f)

scan_dirs = [
    os.path.join(root, 'packages', 'frontend', 'src'),
    os.path.join(root, 'packages', 'backend', 'src'),
    os.path.join(root, 'packages', 'contracts', 'src'),
]

exit_code = 0
new_violations = []
grew_violations = []
remediated = []

if len(baseline) > 0:
    print(f"\n[FAIL] Baseline exceptions are permanently retired. Found {len(baseline)} unauthorized baseline entry/entries:")
    for rel_path, allowed in baseline.items():
        print(f"  - {rel_path}: {allowed} lines")
    print("ColdStorage line-budget governance mandates 0 baseline entries. All files must strictly be <= 250 lines.")
    exit_code = 1

for s_dir in scan_dirs:
    if not os.path.exists(s_dir):
        continue
    for dirpath, _, filenames in os.walk(s_dir):
        if any(ignored in dirpath for ignored in ['node_modules', '.next', 'dist', 'coverage']):
            continue
        for fn in filenames:
            if fn.endswith(('.ts', '.tsx', '.css')):
                full_path = os.path.join(dirpath, fn)
                rel_path = os.path.relpath(full_path, root)
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as fp:
                    lines = sum(1 for _ in fp)

                if lines > max_lines:
                    new_violations.append((rel_path, lines, max_lines))
                    exit_code = 1

print("=== LINE BUDGET AUDIT (Limit: 250 lines) ===")
if new_violations:
    print(f"\n[FAIL] {len(new_violations)} file(s) exceed 250 lines:")
    for rel_path, lines, max_limit in new_violations:
        print(f"  - {rel_path}: {lines} lines (max allowed: {max_limit})")

if exit_code == 0:
    print(f"\n[PASS] All source files satisfy line budget constraints (0 exceptions repository-wide).")

sys.exit(exit_code)
EOF
