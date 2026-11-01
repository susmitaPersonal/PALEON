# Session Handover

> **Version:** 0.2 | **Last updated:** 2026-11-01, Stage B.1

Update this document at the end of every substantial session, with observed results only. Older entries move to the session log at the bottom.

## Where the project stands

ScriptEcho is at milestone M0, the feasibility experiment. **Stages A, B, and B.1 are done, and the project is waiting for user review.** No model has been called, no image has been downloaded, and no money has been spent, so **it is still unknown whether any model can do this task**.

## Exact next action

**Wait for the user's explicit approval of the next stage.** Do not start anything until it arrives.

The recommended next step is closing the harness gaps offline, then Stage C. Still open: Q-3, Q-5, and Q-6 in [DECISIONS.md](DECISIONS.md).

## Authorization

### Authorized

- Maintaining documentation.
- Stages A, B, and B.1, which are complete. This included exactly one Git commit.

### Not authorized

Each of these needs explicit user approval. Approval of one does not extend to another.

- **Stage C:** downloading any image, including candidate negatives.
- **Stage D:** live provider checks, or any model API call.
- **Stage E:** the full experiment.
- Any spending or paid inference.
- Any further Git commit, and any push to a remote.
- Accessing PyPI, npm, or any other package repository.
- Closing the harness gaps.
- Replacing or adding no-writing images.
- Starting the React frontend or production backend.
- Editing `docs/ARCHITECTURE.md`, or changing `prompts/eval_v1.md`.
- Reclassifying a label without direct evidence.

## Completed in Stage B.1

1. Reviewed all 8 uncounted labels against published sources. 7 were upgraded, and Met 26.60.6 stays uncounted.
2. Found and recorded a Bajaur casket accession conflict between Baums 2012 and the Met.
3. Wrote the dataset quality report, including recommendations for harder negatives.
4. Restated gates as fractions of the actual denominator, and extended report output.
5. Added ADR-031 to ADR-034 and 9 tests.
6. Updated the persistent documentation, and made the first Git commit.

## Files created or modified in Stage B.1

| Area | Files |
|---|---|
| Dataset | `dataset/manifest.csv`, `dataset/SOURCING.md`, new `dataset/QUALITY_REPORT.md` |
| Code | `src/metrics.py`, `src/report.py`, `config/run.yaml` |
| Tests | `tests/test_metrics.py`, `tests/test_runner.py`, `tests/test_preprocess_and_manifest.py` |
| Experiment docs | `METHODOLOGY.md`, `README.md` |
| Project docs | `CLAUDE.md`, `CHANGELOG.md`, and `docs/` overview, dataset, evaluation, comparison, decisions, risks, roadmap, and this handover |

`prompts/eval_v1.md` and `docs/ARCHITECTURE.md` were not changed.

## Tests and checks run

| Check | Result |
|---|---|
| `../../.venv/bin/python -m pytest -q` in `experiments/m0_feasibility` | **113 passed**: the original 104, plus 9 added in Stage B.1. Synthetic data only |
| Manifest `check_rows` | 0 problems |
| Prompt SHA-256 | `7240f44be2fd870fd2e596d5d317b10ca8ba18e4f8a408f2cac4da760775b902`, matching `config/run.yaml` |

**Not checked:** new Mermaid diagrams have not been parsed, because that needs an npm package. External URLs were not re-tested.

## Decisions made

- ADR-031: gates are fractions of the actual denominator (Approved).
- ADR-032: a language tag alone does not verify a script (Implemented).
- ADR-033: record the casket accession conflict, and resolve it at Stage C (Implemented).
- ADR-034: keep the easy no-writing rows for now (Approved).

## Current evaluation gates

| Gate | Required now | Status |
|---|---|---|
| Top-1 | 15/29 | Approved |
| Top-3 recall | 24/29 | Approved |
| Rejection | 7/10 | Approved |
| Valid output after retry | 90% | Approved |
| Reproducibility | 80%, currently 32/39 | Approved |

These are preliminary engineering gates. Recalculate them when verified counts change.

## Outstanding issues

### Harness gaps

Modules pass their own tests but are **not joined into a runnable experiment**:

- No command-line entry point.
- Nothing loads `config/models.yaml` or `config/run.yaml`.
- `GoldItem` is not built from the manifest, so `eligible_for_metrics` is not applied in a real flow.
- `preprocess.py` is not connected to the runner.
- There is no image downloader, `httpx` transport, or preflight script.
- Subgroup results, failure analysis output, and a go/no-go report section do not exist.

The full list is in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

### Dataset

- 29 of 30 in-scope labels count: Brahmi 5, Kharosthi 5, Phoenician 5, Greek 4, Latin 5, Runic 5. All 10 rejection labels count.
- No image has been viewed, so `image_quality` is `unassessed` for every row.
- 4 of 5 Brahmi rows are both printed plates and famous objects.
- Rummindei and several Met facts came from search excerpts, because those sites returned HTTP 403 and 429.
- The Bajaur casket accession conflict is unresolved.
- No epigrapher has reviewed the labels.

### Provider

- Image input and structured output are not proven for either model.
- DeepInfra and Hugging Face data policies have not been read.
- `OPENROUTER_API_KEY` and `HF_TOKEN` are not set. Hugging Face free accounts have no included credits.

### Environment

- `.venv` uses Python 3.12.7 and inherits local Anaconda packages. A clean install needs approval to access PyPI.

## Git status

One commit exists on `main`, titled `chore: establish ScriptEcho multimodal feasibility experiment`. Run `git log -1` for its hash, which cannot be recorded inside the commit itself. The commit includes this file. No remote is configured, and nothing has been pushed.

## How to resume

1. Read [CLAUDE.md](../CLAUDE.md), [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), and this file.
2. Run `git status` and the tests to confirm this state still holds.
3. Check the user's latest message for approvals. Do not infer approval from these documents.

## Session log

| Date | Summary |
|---|---|
| 2026-11-01 | Architecture, Stage A, Stage B, and permanent documentation. Waiting for user review |
| 2026-11-01 | Stage B.1: label evidence, quality report, gates as fractions, first commit. Waiting for user review |
