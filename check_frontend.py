"""
Check frontend .tsx files for obvious broken import patterns.
"""
import os, re, sys

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

files = [
    "AssessmentModal.tsx",
    "RoadmapView.tsx",
    "NegotiationPanel.tsx",
    "QuizFlowManager.tsx",
    "ai-agent.service.ts",
    "CoachChat.tsx",
]

import_re = re.compile(r"^import\s+.*?from\s+'([^']+)'", re.MULTILINE)

issues = []
for fname in files:
    fpath = os.path.join(FRONTEND_DIR, fname)
    if not os.path.exists(fpath):
        issues.append(f"MISSING FILE: {fname}")
        continue
    with open(fpath, encoding="utf-8") as fh:
        src = fh.read()

    open_braces  = src.count("{")
    close_braces = src.count("}")
    if abs(open_braces - close_braces) > 5:
        issues.append(f"BRACE MISMATCH in {fname}: {{ = {open_braces}, }} = {close_braces}")

    for m in import_re.finditer(src):
        imp = m.group(1)
        if imp.startswith("."):
            # Strip extension if absent
            for ext in ["", ".tsx", ".ts", ".jsx", ".js"]:
                target = os.path.join(FRONTEND_DIR, imp.lstrip("./") + ext)
                if os.path.exists(target):
                    break
            else:
                issues.append(f"MISSING IMPORT '{imp}' in {fname}")

    print(f"OK: {fname}  ({{ {open_braces}, }} {close_braces})")

if issues:
    print("\nISSUES FOUND:")
    for i in issues:
        print(" -", i)
    sys.exit(1)
else:
    print("\nAll frontend files look good")
