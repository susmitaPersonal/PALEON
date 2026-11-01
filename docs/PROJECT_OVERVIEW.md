# Project Overview

> **Version:** 0.2 | **Last updated:** 2026-11-01 | **Phase:** M0 feasibility, Stage B.1 complete

## Vision

ScriptEcho helps people investigate unfamiliar historical writing systems from images of inscriptions, manuscripts, and ancient documents. It reports what is visible, names up to three candidate scripts with evidence, and gives sourced context. When an image does not support a conclusion, it says so.

**Central principle: evidence before explanation.** Script identification, language identification, transcription, transliteration, and translation are separate tasks and are never conflated.

## Objectives

1. Build a focused, working MVP with honest AI limitations.
2. Establish through measurement whether hosted open-weight vision models can do this task.
3. Produce a portfolio-quality open-source project with reproducible evaluation.
4. Teach the maintainer multimodal generative AI, evaluation, and system design.

## Problem statement

People who meet an unfamiliar inscription have two poor options. A general chatbot gives a confident answer with unverifiable history. Specialist resources assume you already know what you are looking at.

## Intended users

| User | Need | What ScriptEcho offers |
|---|---|---|
| Archaeologists | A quick first hypothesis in the field or lab | Candidates with stated visual evidence |
| Historical researchers | Leads on an unfamiliar script outside their specialism | Comparisons and citable sources |
| Museum and archive staff | Triage of uncatalogued items | Abstention and expert-review prompts |
| Students and enthusiasts | Understanding what they are looking at | Plain explanation, with uncertainty |

ScriptEcho is a research aid, not an authority. It does not authenticate, date, or value objects.

## Current status

**Nothing that a user can run exists yet.** The project is an experiment harness and a design.

| Area | Status |
|---|---|
| Product architecture | Proposed. Used as the basis for Phase 1, with no formal approval recorded |
| Six supported scripts | Approved for the feasibility experiment |
| Web application and production API | Not started, and not authorized |
| Experiment harness modules (Stage A) | Implemented. Offline tests pass. Not yet assembled into a runnable experiment |
| Dataset metadata (Stages B and B.1) | Implemented. 29 of 30 in-scope labels count, and 10 of 10 rejection labels count. Images unseen |
| Evaluation gates | Approved as preliminary engineering gates |
| Image download (Stage C) | Not authorized |
| Live provider checks (Stage D) | Not authorized |
| Full experiment (Stage E) | Not authorized |
| Model capability on this task | **Unknown. No model has been called** |

The exact position is in [SESSION_HANDOVER.md](SESSION_HANDOVER.md).

### Hacktoberfest

The Hacktoberfest Week 4 entry period closed at 12:29 PM IST on 2026-11-01, before this project started. The rules require development to begin within the entry period, so **the project is not eligible**. Commits must not be backdated. ScriptEcho continues as a portfolio release.

## Scope

**MVP scope (Proposed):** image upload and validation, up to three candidates for six scripts, explicit abstention, sourced history from a curated collection, and documented comparisons.

**Future scope:** more scripts with wider regional coverage, a Bengali script evolution track, better retrieval, and transcription once measured. Translation and language identification need evidence before they are added.

Full boundaries are in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Status vocabulary

| Status | Meaning |
|---|---|
| **Proposed** | Written down, not approved by the user |
| **Approved** | The user explicitly approved it, and it may not yet be built |
| **Implemented** | The code exists |
| **Verified** | Implemented and confirmed by a named test or check |
| **Pending** | Waiting on a user decision or an unauthorized stage |

## Documentation map

| Document | Purpose |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | Rules for every session |
| [SESSION_HANDOVER.md](SESSION_HANDOVER.md) | Exact current state and next action |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Requirements and acceptance criteria |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Components, data flow, and API |
| [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) | AI pipeline and hallucination controls |
| [DATASET_STRATEGY.md](DATASET_STRATEGY.md) | Scripts, sourcing, labels, and licensing |
| [MODEL_EVALUATION.md](MODEL_EVALUATION.md) | Metrics, thresholds, and limits |
| [MODEL_COMPARISON.md](MODEL_COMPARISON.md) | Candidate models and providers |
| [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) | Keys, uploads, and third-party risk |
| [DECISIONS.md](DECISIONS.md) | Architecture Decision Records |
| [RISKS_AND_LIMITATIONS.md](RISKS_AND_LIMITATIONS.md) | Risks and mitigations |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Milestones and next tasks |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Frozen original design baseline |
| [CHANGELOG.md](../CHANGELOG.md) | Dated record of changes |
