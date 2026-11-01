# Decisions

> **Version:** 0.3 | **Last updated:** 2026-11-01

Architecture Decision Records for ScriptEcho. Related: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md), [CLAUDE.md](../CLAUDE.md)

**Rule:** never silently change an approved decision. Add a new ADR that supersedes it, and get approval.

Status terms are defined in [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## Open questions

| ID | Question | Recommendation | Status |
|---|---|---|---|
| Q-3 | Should hard negatives replace the two easy no-writing images? | Yes, after image review. Recommendations are in the [quality report](../experiments/m0_feasibility/dataset/QUALITY_REPORT.md). The user said not yet | Pending the user |
| Q-5 | Is the November 15 portfolio target accepted? | Depends on available time | Awaiting the user |
| Q-6 | Is the proposed product architecture formally approved? | Decide at the M0 go/no-go | Awaiting the user |

Q-1 was closed by ADR-031. Q-2 was closed by Stage B.1 approval, with the result in ADR-032. Q-4 was closed by the user approving the first commit.

## Pending changes to the baseline design

Proposed. These apply to the maintained documents, and the frozen baseline stays as it is.

| Baseline section | Baseline text | Proposed |
|---|---|---|
| 12 | M0 tests three models | Two models, as approved |
| 12 | Go if top-3 reaches 70% | The five approved gates, as fractions |
| 7 | Comparison budget includes four models | Limit to the two approved models |

## Records

### ADR-001: The reference collection owns all historical content

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** it is the only reliable way to guarantee no fabricated facts or citations.
- **Decision:** The reference collection owns all historical content.
- **Alternatives:** let the model write context from retrieved passages, then check it afterward.
- **Trade-offs:** answers are less fluent, and coverage is limited to reviewed content.
- **Verification:** confirm the response schema has no model-authored history or URL field, and run a test that fails if any displayed claim is missing from the collection.

### ADR-002: Separate Observe and Hypothesize stages

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** it keeps observations independent from conclusions, and allows an early exit.
- **Decision:** Separate Observe and Hypothesize stages.
- **Alternatives:** one call returning everything, which is faster and cheaper.
- **Trade-offs:** double the calls, and roughly double the latency and cost.
- **Verification:** run both designs on the development set. If two stages show no improvement in accuracy or rejection, merge them and record why.

### ADR-003: Structured lookup instead of a vector store

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** six scripts fit in a prompt, so semantic search solves nothing yet.
- **Decision:** Structured lookup instead of a vector store.
- **Alternatives:** embeddings with a vector database.
- **Trade-offs:** no fuzzy free-text search, and a tag vocabulary to maintain.
- **Verification:** measure whether the correct script's card reaches the Hypothesize stage. Reconsider when the collection exceeds the prompt budget or recall falls.

### ADR-004: Six confusable scripts instead of broad coverage

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** review effort is the true constraint, and hard pairs produce a meaningful test.
- **Decision:** Six confusable scripts instead of broad coverage.
- **Alternatives:** 20 or more scripts with shallow records.
- **Trade-offs:** a narrower product, with limited regional coverage at launch.
- **Verification:** compare confusion-matrix results for the pairs. If nothing is confused, the set is too easy.

### ADR-005: Computed evidence strength instead of model confidence

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** model percentages are not calibrated, and users read them as probabilities.
- **Decision:** Computed evidence strength instead of model confidence.
- **Alternatives:** display the model's score, or calibrate it statistically.
- **Trade-offs:** coarse categories, and a rule that needs tuning.
- **Verification:** check on the test set that `strong` results are correct more often than `moderate`, and `moderate` more often than `weak`. Calibration needs far more data, so this is an ordering check only.

### ADR-006: A single stateless service with synchronous responses

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** no job store, queue, or database is needed for a short request.
- **Decision:** A single stateless service with synchronous responses.
- **Alternatives:** background jobs with polling, or streaming progress.
- **Trade-offs:** no real progress reporting, and a slow model blocks one request.
- **Verification:** measure p95. If it exceeds the 55-second deadline, add server-sent progress, or reconsider the model.

### ADR-007: Gateway plus `ModelProvider` interface

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** models and hosts change often, as the catalog data shows, and the brief requires replaceability.
- **Decision:** Gateway plus `ModelProvider` interface.
- **Alternatives:** a direct provider SDK, or a large abstraction framework.
- **Trade-offs:** another intermediary, and a lowest-common-denominator interface.
- **Verification:** switching to the second gateway must require configuration changes only.

### ADR-008: Local Zod validation regardless of provider guarantees

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** enforcement varies by provider, and validation checks meaning that a JSON schema cannot.
- **Decision:** Local Zod validation regardless of provider guarantees.
- **Alternatives:** trust strict structured output.
- **Trade-offs:** extra code, and occasional retry cost.
- **Verification:** track first-pass validity by provider, and test with injected malformed output.

### ADR-009: No training in the MVP

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** there is no labelled dataset of adequate size, and the brief excludes it.
- **Decision:** No training in the MVP.
- **Alternatives:** fine-tune a model, or train a classifier on script images.
- **Trade-offs:** accuracy is limited by what hosted models already know.
- **Verification:** use the confusion matrix and the M0 gate. Reconsider only with enough licensed data.

### ADR-010: Transcription and translation gated by capability

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** each is a distinct task with distinct evidence requirements.
- **Decision:** Transcription and translation gated by capability.
- **Alternatives:** one "read this inscription" prompt, which looks impressive but invites invention.
- **Trade-offs:** the MVP will disappoint users who want a translation.
- **Verification:** enable transcription for a script only after CER is measured against verified editions.

### ADR-011: Reject non-writing and unknown scripts explicitly

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** a closed-set classifier gives confident wrong answers.
- **Decision:** Reject non-writing and unknown scripts explicitly.
- **Alternatives:** always return the closest match with a warning.
- **Trade-offs:** lower coverage, and some correct answers will be withheld.
- **Verification:** measure out-of-scope and no-writing rejection alongside coverage.

### ADR-012: npm workspaces with shared contracts

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** the API, web app, and evaluation harness must agree on one schema set.
- **Decision:** npm workspaces with shared contracts.
- **Alternatives:** separate repositories, or duplicated types.
- **Trade-offs:** slightly more initial configuration.
- **Verification:** a schema change should fail type checks everywhere it matters.

### ADR-013: Render single-service deployment

- **Date:** 2026-11-01
- **Status:** Proposed
- **Context:** it is the simplest route to a shareable demo.
- **Decision:** Render single-service deployment.
- **Alternatives:** static frontend hosting with a separate API, or Workers.
- **Trade-offs:** cold starts on the free tier. Native image libraries also need Node rather than an edge runtime.
- **Verification:** deploy in M1 rather than at the end, and measure cold-start and request timing.

### ADR-014: Test two models through two gateways

- **Date:** 2026-11-01
- **Status:** Approved (Model A named by the user; Model B chosen under the brief's instruction)
- **Context:** M0 must learn whether hosted open-weight vision models can do the task. The brief named Qwen3-VL-30B through OpenRouter and a suitable alternative through Hugging Face.
- **Decision:** Model A is Qwen3-VL-30B-A3B-Instruct on OpenRouter. Model B is Gemma 4 31B on Hugging Face, pinned to DeepInfra.
- **Alternatives:** The three or four models in the original shortlist.
- **Trade-offs:** Fewer models mean less comparison, but two families and two gateways give an independent check.

### ADR-015: Use five preliminary engineering gates

- **Date:** 2026-11-01
- **Status:** Approved; superseded in part by ADR-031, which restates the first two gates as fractions
- **Context:** Pass criteria must exist before results do, so they cannot be shaped by them.
- **Decision:** Top-1 at least 15/30, top-3 at least 24/30, rejection at least 7/10, valid output at least 90%, and reproducibility at least 80%.
- **Alternatives:** The original 70% top-3 check, which sits too close to the 50% from random picks.
- **Trade-offs:** The thresholds are judgment calls, and they are not evidence of general accuracy.

### ADR-016: Build the virtual environment from local Anaconda

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** Approval excluded accessing package repositories without further permission, and Anaconda already had every dependency.
- **Decision:** `/opt/anaconda3/bin/python -m venv --system-site-packages .venv`, with versions pinned to those installed.
- **Alternatives:** Python 3.13 with a PyPI install, which would need approval.
- **Trade-offs:** Python 3.12 instead of 3.13, and the environment inherits unrelated packages.

### ADR-017: Ship no live network transport in Stage A

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline by `test_no_network_client_is_imported_by_the_harness`
- **Context:** No API calls were permitted, and a prohibition is stronger when enforced by construction.
- **Decision:** `OpenAICompatibleAdapter` takes an injected Transport, and none is included. A test fails if `src/` imports a network client.
- **Alternatives:** An httpx client guarded by a flag.
- **Trade-offs:** Stage D must add one small class.

### ADR-018: Use one adapter for both gateways

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** Both accept the same chat-completions format.
- **Decision:** One configurable adapter, with provider differences in `config/models.yaml`.
- **Alternatives:** One class per provider.
- **Trade-offs:** Differences must fit configuration, and Stage D may disprove that assumption.

### ADR-019: Validate model output strictly

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline
- **Context:** The structured-output rate should reflect real behaviour.
- **Decision:** Markdown fences and surrounding prose are invalid, with one repair retry.
- **Alternatives:** Tolerant parsing that strips fences.
- **Trade-offs:** Some recoverable replies count as invalid on the first pass.

### ADR-020: Forbid candidates on abstaining responses

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline
- **Context:** Rejection cannot be scored if a response abstains and also names a script.
- **Decision:** Any non-`identified` disposition must have an empty candidate list and a reason.
- **Alternatives:** Allowing tentative candidates alongside an abstention.
- **Trade-offs:** The model cannot say "probably X, but abstaining."

### ADR-021: Give the evaluation prompt no script descriptions

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** M0 measures unaided capability.
- **Decision:** The prompt lists script names only.
- **Alternatives:** Include the planned reference cards.
- **Trade-offs:** Likely understates the eventual product.

### ADR-022: Use a single model call per image in M0

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** The required output fits one call, and one variable at a time is easier to interpret.
- **Decision:** One call per repetition.
- **Alternatives:** Testing the two-stage design now.
- **Trade-offs:** ADR-002 stays untested.

### ADR-023: Score images by strict majority across repetitions

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline
- **Context:** Metrics need one prediction per image.
- **Decision:** Strict majority of 3, otherwise `no_consensus`. Failures keep their vote.
- **Alternatives:** Averaging, or scoring only the first repetition.
- **Trade-offs:** Slightly harsher than averaging.

### ADR-024: Count any abstention as rejection

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline
- **Context:** The stated goal is avoiding a forced match.
- **Decision:** The gate uses any abstaining disposition, and strict rejection is reported beside it.
- **Alternatives:** Require the exact expected disposition.
- **Trade-offs:** The gate is more lenient than the strict figure.

### ADR-025: Exclude implied labels from metrics

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline
- **Context:** Met 26.60.69 is catalogued as Roman, yet its inscription is in Greek, so culture does not establish script.
- **Decision:** Add `implied_record`, which does not count until a source names the script.
- **Alternatives:** Accepting culture labels as verification.
- **Trade-offs:** Counted in-scope labels fall from 30 to 22.

### ADR-026: Do not commit images

- **Date:** 2026-11-01
- **Status:** Approved; Implemented
- **Context:** Keeps the repository clean and rights simple.
- **Decision:** `data/` is gitignored, and Git holds URLs, attribution, and hashes.
- **Alternatives:** Commit CC0 images.
- **Trade-offs:** Reproduction depends on source URLs, protected by hashes.

### ADR-027: Make no Git commit without a request

- **Date:** 2026-11-01
- **Status:** Superseded by the first commit, which the user approved at Stage B.1
- **Context:** Committing was not requested.
- **Decision:** Freeze the prompt by a stored SHA-256 for now.
- **Alternatives:** Commit at Stage A.
- **Trade-offs:** A real freeze commit is still needed before Stage E.

### ADR-028: Keep ARCHITECTURE.md as a frozen baseline

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** The permanent document set replaces it in daily use, while approval history needs the original intact.
- **Decision:** Do not edit or delete `docs/ARCHITECTURE.md`. New documents are maintained, and they copied its sections without rewording.
- **Alternatives:** Delete it, or keep editing it as a second source of truth.
- **Trade-offs:** Two files overlap, so `CLAUDE.md` names which is maintained.

### ADR-029: Use a 40-image development dataset

- **Date:** 2026-11-01
- **Status:** Approved
- **Context:** Thirty images in total would leave too few to judge rejection.
- **Decision:** 30 in-scope, 8 out-of-scope, and 2 no-writing images.
- **Alternatives:** 30 images in total.
- **Trade-offs:** Slightly more cost and labelling work.

### ADR-030: Continue as a portfolio release

- **Date:** 2026-11-01
- **Status:** Proposed (the target date has not been approved)
- **Context:** The Week 4 entry period closed before the project started, and the rules require development to begin within it.
- **Decision:** Plan an open-source release targeting 2026-11-15.
- **Alternatives:** Backdating, which would falsify eligibility and was rejected outright.
- **Trade-offs:** No contest entry.

### ADR-031: Express gates as fractions of the actual denominator

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_required_count_follows_the_denominator`
- **Context:** Fixed counts stop working once the verified image count changes. The user approved 11/22 and 18/22, with recalculation on the actual denominator.
- **Decision:** Top-1 is 1/2, top-3 is 4/5, and rejection is 7/10, each rounded up to a whole image. Currently 15/29, 24/29, and 7/10. Reports must give numerator, denominator, percentage, interval, and limitations.
- **Alternatives:** Keep fixed counts, or adjust thresholds by judgment for each dataset.
- **Trade-offs:** The numerator moves with the dataset, so reports must state it each time.

### ADR-032: A language tag alone does not verify a script

- **Date:** 2026-11-01
- **Status:** Implemented in the manifest
- **Context:** Stage B.1 found scholarly records tagged by language, while the user required explicit identification of the writing system.
- **Decision:** A label counts when a source names the script, assigns the text to a script-specific corpus, or pairs a language tag with a letter-for-letter edition. A language tag alone stays `implied_record`.
- **Alternatives:** Accept any language tag, which would have counted Met 26.60.6.
- **Trade-offs:** Greek stays one image short, though the row is very probably correct.

### ADR-033: Record the Bajaur accession conflict without resolving it

- **Date:** 2026-11-01
- **Status:** Implemented in the manifest; resolution Pending Stage C
- **Context:** Baums 2012 and the Met assign 1987.142.70 and 1987.142.71 to the two caskets in opposite ways. Both are in the Corpus of Kharoṣṭhī inscriptions.
- **Decision:** Keep both rows counted, keep Met object URLs, and record the conflict. Compare shapes against Baums at Stage C.
- **Alternatives:** Drop both rows, or pick one source's numbering.
- **Trade-offs:** Accession metadata stays uncertain, while script labels are unaffected.

### ADR-034: Keep the easy no-writing rows for now

- **Date:** 2026-11-01
- **Status:** Approved by the user
- **Context:** Both no-writing rows are easy cases, but replacements need approval and evidence.
- **Decision:** Keep them, and publish recommendations for harder negatives. Add no images or rows.
- **Alternatives:** Swap in the reserve rows now.
- **Trade-offs:** Rejection results may be overstated until harder negatives exist.
