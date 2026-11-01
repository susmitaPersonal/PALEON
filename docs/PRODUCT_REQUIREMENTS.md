# Product Requirements

> **Version:** 0.1 | **Last updated:** 2026-11-01 | **Status:** Proposed. None of these requirements is implemented in a product yet.

Related: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)

## Core design rule

**The model may interpret the image. It may never author history.**

Every historical fact, date, citation, and character example comes verbatim from a curated reference collection.

## MVP script scope

Approved for the feasibility experiment. Proposed for the product.

| Script | Region | Why it is included |
|---|---|---|
| Brahmi | South Asia | Ancestor of later South Asian scripts, and the route to the Bengali research track |
| Kharosthi | South Asia | Hard contrast with Brahmi |
| Phoenician | Eastern Mediterranean | Hard contrast with early Greek |
| Greek (epigraphic) | Mediterranean | Bridges Phoenician and Latin |
| Latin (Roman epigraphic) | Mediterranean, Europe | Control class, with the best transcription references |
| Runic | Northern Europe | Angular forms that can be mistaken for other inscribed scripts |

Regional coverage is limited in the MVP, and the README must say so.

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | Upload JPEG, PNG, or WebP up to 8 MB, with type checked from file content | Must |
| F2 | Return structured observations, kept separate from hypotheses | Must |
| F3 | Return 0 to 3 ranked candidates, each with evidence | Must |
| F4 | Show historical context and sources from the reference collection only | Must |
| F5 | Compare candidates using documented features | Must |
| F6 | Return explicit `insufficient_evidence`, `out_of_scope`, and `no_writing_detected` outcomes | Must |
| F7 | Validate all model output with Zod and verify every evidence ID | Must |
| F8 | Handle timeouts, rate limits, malformed output, and provider outages | Must |
| F9 | Offer a labelled demo mode using recorded responses | Should |
| F10 | Experimental transcription for Latin and Greek only, enabled only after CER is measured | Could |

## Non-functional requirements

| ID | Category | Requirement | Measure |
|---|---|---|---|
| N1 | Honesty | No fabricated citation, date, or example | Citation validity of 100% and manual claim audit |
| N2 | Honesty | No claim of certainty the image does not justify | No numeric confidence; computed evidence strength |
| N3 | Evaluation | Results reproducible from the repository | Clean-clone re-run |
| N4 | Latency | A complete analysis within the deadline | 55-second deadline; p95 measured |
| N5 | Security | The API key never reaches the browser | CI bundle check |
| N6 | Privacy | Uploads are not retained | No disk writes; no image bytes in logs |
| N7 | Replaceability | Provider swap needs configuration only | Second gateway works unchanged |
| N8 | Reliability | Failures return typed, retryable errors | Failure-path tests |
| N9 | Cost | Spending has a hard ceiling | Per-key limit and daily budget |
| N10 | Accessibility | Usable at phone width and by keyboard | Manual review |

## User journeys

### Researcher with a clear inscription

1. Uploads a photograph and crops to the inscribed area.
2. Sees what was observed in the image.
3. Sees ranked candidates, the evidence for and against each, and evidence strength.
4. Reads sourced history and opens the source links.
5. Takes the leads to a specialist or reference work.

### Archaeologist with a damaged fragment

1. Uploads a worn image.
2. Receives `insufficient_evidence` and the stated limitation.
3. Is advised to obtain a better image or expert review. No identification is forced.

### User with an unsupported script

1. Uploads a cuneiform tablet.
2. Receives `out_of_scope`, possibly with an unverified label that carries no history.
3. Learns which scripts are supported.

### User with no writing

1. Uploads a decorated pot.
2. Receives `no_writing_detected`, and the second model call is skipped.

### User who wants a translation

1. Asks for meaning.
2. Is told that translation is unavailable, and why. The product does not invent one.

## Explicitly out of scope for the MVP

- Translation of any script. The API reports it as unavailable.
- Language identification. The response field stays `null`, because a script does not determine a language.
- Accounts, databases, vector stores, multi-agent frameworks, and model training.
- PDF or multi-page input, and streaming.
- Dating, authentication, or valuation of artefacts.
- Claims about historical descent. Visual similarity is never presented as proof of a relationship.

## MVP acceptance criteria

The release is complete when all of these hold:

1. All six scripts have source-reviewed records.
2. The deployed demo handles a valid image, an out-of-scope image, and a non-writing image correctly.
3. All failure-path tests pass.
4. Tests run in CI with no provider key.
5. The evaluation report is reproducible from a clean clone, on a held-out set.
6. The README states scope, limitations, model, and licensing.

The 88% figure is a research target. Missing it does not block release, but reporting it honestly does.

## Precondition

No product work starts until the M0 go/no-go. See [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
