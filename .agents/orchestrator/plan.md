# Plan: anng-cli Codebase Audit

## Objective
Conduct a comprehensive audit of the `anng-cli` codebase to identify bugs, logic flaws, memory leaks, and context window mismanagements in `src/session/`, `src/ui/`, `src/prompt-engine/`, and `src/tools/`. Document findings in `audit_report.md` in the project root, create at least one reproduction PoC in `scratch/`, and ensure all proposed fixes pass the project build.

## Milestones

### Milestone 1: Codebase Review and Auditing (Status: PLANNED)
- **Objective**: Identify at least 3 distinct, non-trivial bugs or flaws in the specified directories.
- **Tasks**:
  1. Spawn a `teamwork_preview_explorer` subagent to analyze `src/session/`, `src/ui/`, `src/prompt-engine/`, and `src/tools/`.
  2. The explorer will look for: unhandled promise rejections, race conditions, memory leaks (e.g., event listener/subscription leaks), context window mismanagement, and general logic flaws.
  3. Aggregate the findings and select at least 3 distinct, non-trivial findings (prioritizing High/Critical ones).
- **Verification**: Review explorer's handoff. Ensure it has exact file paths, line numbers, and proposed fix strategies for the findings.

### Milestone 2: Proof of Concept (PoC) Development & Verification (Status: PLANNED)
- **Objective**: Write reproduction scripts in `scratch/` for the selected issues and verify they reproduce the issues and that the fixes work.
- **Tasks**:
  1. Spawn a `teamwork_preview_worker` to write a reproduction PoC script in `scratch/` demonstrating at least one High/Critical issue or bottleneck.
  2. Spawn a `teamwork_preview_worker` to create the exact code changes/diffs to fix the issues, and run the project's build (`npm run build` or `tsc`) to ensure they compile without errors.
  3. Spawn a `teamwork_preview_challenger` to run the PoC script and verify it demonstrates the bug, and verify that the fixes resolve the issue.
  4. Spawn a `teamwork_preview_reviewer` to review the PoC script and proposed fixes for correctness and compliance.
- **Verification**: Challenger confirms PoC succeeds in reproducing the issue (or demonstrating the bottleneck) and that the fix resolves it. Reviewer approves.

### Milestone 3: Report Synthesis and Victory Audit (Status: PLANNED)
- **Objective**: Generate `audit_report.md` at project root and perform the final integrity audit.
- **Tasks**:
  1. Spawn a `teamwork_preview_worker` to write `audit_report.md` at the project root. The report must contain at least 3 distinct findings with file/line references, categorized by severity, and include the exact proposed diffs or replacements.
  2. Spawn a `teamwork_preview_auditor` to audit the final report, PoC, and proposed fixes. The auditor must verify all requirements are met and that there is no hardcoding or dummy implementations.
  3. If all gates pass (Build/tests pass, no reviewer vetoes, auditor reports CLEAN), report victory back to parent/user.
- **Verification**: Forensic Auditor reports CLEAN. All tests pass, and report matches verification checklist.
