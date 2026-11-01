# CLAUDE.md: ScriptEcho Session Instructions

Instructions for every Claude Code session in this repository. Conversation history may not be available, so the repository is the source of truth.

## Start of every session

Read these in order, before doing any work:

1. This file.
2. [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
3. [docs/SESSION_HANDOVER.md](docs/SESSION_HANDOVER.md). Its "Not authorized" list is binding.
4. The architecture and decision documents relevant to the task, before modifying code:
   - [docs/DECISIONS.md](docs/DECISIONS.md)
   - [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md)
   - [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md)

## Rules

1. **Never assume undocumented functionality exists.** Check the code. A design described in the docs may not be built, so look at its status label.
2. **Never perform an unauthorized stage.** Stages need explicit user approval, and approval for one stage does not extend to the next.
3. **Never silently change an approved decision.** Propose the change in [docs/DECISIONS.md](docs/DECISIONS.md) and wait for approval.
4. **Update documentation whenever architecture or implementation changes,** in the same piece of work.
5. **Keep code and documentation consistent.** If they disagree, verify which is right and fix it, then record the fix in [CHANGELOG.md](CHANGELOG.md).
6. **Never fabricate results.** Report tests, metrics, and completed work only as observed. Do not present estimates as measurements.
7. **Update [docs/SESSION_HANDOVER.md](docs/SESSION_HANDOVER.md) before ending a substantial session,** using the real test output and `git status`.

## Status vocabulary

Use these terms exactly, in all documents:

| Status | Meaning |
|---|---|
| **Proposed** | Written down, not approved by the user |
| **Approved** | The user explicitly approved it, and it may not yet be built |
| **Implemented** | The code exists |
| **Verified** | Implemented and confirmed by a named test or check, stating what was checked |
| **Pending** | Waiting on a user decision or an unauthorized stage |

Offline tests verify code behaviour only. They never verify any model capability.

## Project rules that are easy to break

- Do not make model API calls, download images, or spend money without stage approval.
- Do not access package repositories such as PyPI or npm without approval. Stating the need first is required.
- Do not commit unless the user asks, and approval for one commit does not extend to the next. Never push without approval. Never commit `.env`, keys, or images.
- Do not tune prompts on the development set and then present the result as independent evaluation.
- Do not change gates or `prompts/eval_v1.md` after results exist. That requires a new, documented experiment.
- Do not count `implied_record`, `secondary_source`, or `unverified` labels in metrics.
- Do not infer a script from culture, location, or period. A language tag alone is not enough (ADR-032).
- When verified counts change, recalculate gates on the actual denominator (ADR-031).
- Do not claim 88% accuracy unless the measured results support it.
- Do not edit [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). It is the frozen 2026-11-01 baseline. See ADR-028.

## Working commands

```bash
cd experiments/m0_feasibility
../../.venv/bin/python -m pytest -q
```

`.venv` is gitignored and inherits packages from the local Anaconda install. To recreate it: `/opt/anaconda3/bin/python -m venv --system-site-packages .venv`.
