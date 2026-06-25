# Original User Request

## Initial Request — 2026-06-20T13:52:28+07:00

Conduct a comprehensive audit of the `anng-cli` project to identify, document, and propose fixes for potential bugs, memory leaks, and logic flaws.

Working directory: /run/media/sanng/New Volume/Seminar/Anng_cli
Integrity mode: development

## Requirements

### R1. Systematic Codebase Review
Analyze the core architectural components (`src/session/`, `src/ui/`, `src/prompt-engine/`, `src/tools/`) for logic flaws, race conditions, context window mismanagements, or unhandled promise rejections.

### R2. Audit Report Delivery
Document the findings in an `audit_report.md` artifact in the project root. The report must categorize issues by severity (Critical, High, Medium, Low) and include exact file paths and line numbers.

### R3. Actionable Fixes
For any High or Critical issues discovered, you must write a concrete proof-of-concept (PoC) script to reproduce the bug (saved in `scratch/`) AND provide the exact code changes needed to fix it.

## Acceptance Criteria

### Verification Standards
- [ ] The `audit_report.md` file exists and contains at least 3 distinct, non-trivial findings with file/line references.
- [ ] At least one PoC script is provided in the `scratch/` directory that programmatically demonstrates a bug or bottleneck.
- [ ] The proposed fixes are presented as valid unified diffs or drop-in code replacements that pass the project's existing build step (`npm run build` or `tsc`).

## Follow-up — 2026-06-20T06:55:19Z

The user has requested an addendum to the current audit task: Please also investigate and document any issues related to Prompt Caching (Prefix Caching). Look for inefficiencies in token management, repetitive payload structures that break cache hits, or missing configurations that could optimize token usage. Please include this in your audit report.
