# Changelog

All notable changes to ScriptEcho. Dates are in IST. No version has been released.

## [Unreleased]

### 2026-11-01: Stage B.1, evidence review and baseline

Added:
- `dataset/QUALITY_REPORT.md` with the bias assessment and hard-negative recommendations.
- ADR-031 to ADR-034, and 9 offline tests, for 113 in total.

Changed:
- 7 of 8 uncounted labels upgraded on direct evidence. 29 of 30 in-scope labels now count.
- Gates restated as fractions of the actual denominator: currently 15/29, 24/29, and 7/10.
- Report output now gives required counts, intervals, and dataset limitations.
- Met 1987.142.70 notes updated with CKI 242 and an accession conflict.

Retained:
- Met 26.60.6 stays uncounted, because a language tag alone does not identify a script.
- The two easy no-writing rows stay. Replacements need approval.

First Git commit made at this stage.

### 2026-11-01: Persistent documentation

Added:
- `CLAUDE.md` with rules for every session.
- Permanent documents in `docs/`: overview, requirements, system and AI architecture, dataset strategy, evaluation, security, risks, roadmap, and session handover.

Changed:
- `docs/DECISIONS.md` rewritten as full ADRs, ADR-001 to ADR-030. The earlier D-01 to D-12 entries became ADR-016 to ADR-027 in a new order.
- `docs/MODEL_COMPARISON.md` restructured, and it now has a benchmark results section.
- `experiments/m0_feasibility/METHODOLOGY.md` and `README.md` gained an implementation status note, because the harness modules are not yet joined up.

Unchanged:
- `docs/ARCHITECTURE.md` is the frozen baseline. See ADR-028.

### 2026-11-01: Stage B, dataset metadata

Added:
- `dataset/manifest.csv` with 40 development and 3 reserve rows, and `dataset/SOURCING.md`.
- `implied_record` label status, excluded from metrics.

Result: 22 of 30 in-scope labels and 10 of 10 rejection labels count. No image was downloaded.

### 2026-11-01: Stage A, offline harness

Added:
- Git repository, `.gitignore`, and a virtual environment inheriting local Anaconda packages.
- Experiment harness in `experiments/m0_feasibility/`: schema, validation, adapter, manifest, metrics, runner, preprocessing, and report.
- Frozen evaluation prompt `prompts/eval_v1.md`, and configuration.
- Offline tests using synthetic data, with no live network code.

### 2026-11-01: Architecture

Added:
- `docs/ARCHITECTURE.md` with the 15 design deliverables.

Noted: the Hacktoberfest Week 4 entry period had closed, so the project is not eligible and continues as a portfolio release.
