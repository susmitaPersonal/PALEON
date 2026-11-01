# Decisions

> **Version:** 1.3 | **Last updated:** 2026-11-02

Architecture Decision Records for ScriptEcho. Related: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md), [CLAUDE.md](../CLAUDE.md)

**Rule:** never silently change an approved decision. Add a new ADR that supersedes it, and get approval.

Status terms are defined in [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## Open questions

| ID | Question | Recommendation | Status |
|---|---|---|---|
| Q-10 | Should printed numbers be cleared from blank paper, so whole plates can be used? | Yes, as the next offline step. Only blank-paper pixels would change, and each plate must pass inspection | Closed by ADR-064. Applied to SE003 and SE004. SE010 stays held |
| Q-5 | Is the November 15 portfolio target accepted? | Depends on available time | Awaiting the user |
| Q-6 | Is the proposed product architecture formally approved? | Decide at the M0 go/no-go | Awaiting the user |

Q-3 and Q-9 were closed by the user at Stage C.2 (ADR-048, ADR-049). Q-7 was closed by the user conditionally approving crops (ADR-044). Q-8 was closed by the user holding SE008 (ADR-046). Q-1 was closed by ADR-031. Q-2 was closed by Stage B.1 approval, with the result in ADR-032. Q-4 was closed by the user approving the first commit.

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
- **Status:** Approved; Implemented; Verified offline by `test_required_count_follows_the_denominator`. Reproducibility part superseded by ADR-035
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
- **Status:** Implemented; image review at Stage C found that image and text agree, so only accession numbers differ
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

### ADR-035: Measure the reproducibility gate on in-scope images only

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_gate_requirements_use_the_verified_denominators`
- **Context:** The gate was calculated over all 39 counted images as 32/39, which mixed identification with rejection. The user required separate calculation, and a 24/29 gate.
- **Decision:** The gate is in-scope images with identical top-one labels across all three repetitions, at least 4/5, currently 24/29. Rejection images get their own reproducibility figure and a separate rejection consistency figure, neither gated.
- **Alternatives:** One combined figure over 39 images.
- **Trade-offs:** More numbers to report, and rejection stability has no pass mark.

### ADR-036: Never fill in unknown usage, cost, or latency

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_fixture_usage_is_never_invented`
- **Context:** Inspection found `FixtureAdapter` hardcoding 5,000 input and 800 output tokens for every response, which fabricated usage.
- **Decision:** Usage comes only from a recording or a provider. Where absent it stays null, cost stays null, and reports state the share of attempts with usage. Latency is measured, never recorded in fixtures.
- **Alternatives:** Keep a placeholder estimate, or treat unknown as zero.
- **Trade-offs:** Cost totals can be partial, so they must be read with that share.

### ADR-037: Keep live mode refused in the entry point

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline by `test_live_mode_is_refused`
- **Context:** The harness now has one command, so an accidental real run must be impossible until approval.
- **Decision:** `--live` exits with an error. No live transport exists, and synthetic runs use a separate manifest and model file that name no real model.
- **Alternatives:** A live mode behind an environment flag.
- **Trade-offs:** Stage D must add code, not only configuration.

### ADR-038: Keep synthetic fixtures in Git and synthetic results out of it

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline by `test_fixtures_match_the_generator`
- **Context:** Fixtures are the reproducible input. Results can be regenerated, and invented numbers should not sit beside real ones in history.
- **Decision:** Commit `fixtures/synthetic/`, and gitignore `results/synthetic/`. A test confirms fixtures match their generator.
- **Alternatives:** Commit synthetic results as examples.
- **Trade-offs:** A reader must run the command to see example output.

### ADR-039: Expect hand-calculated values in end-to-end tests

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** Tests that copy program output would only confirm that the code does what it does.
- **Decision:** Expected numbers are worked out from the scenario lists. Six deliberate faults were injected on 2026-11-01, and the tests caught all six.
- **Alternatives:** Snapshot the output.
- **Trade-offs:** Changing scenarios means recalculating by hand.

### ADR-040: Add Stage C status, and count only accepted images

- **Date:** 2026-11-01
- **Status:** Implemented; Verified offline by `test_excluded_and_held_rows_never_count`
- **Context:** A verified label says nothing about whether an image shows readable writing.
- **Decision:** Each row gets `stage_c_status`: accepted, held, excluded, or not_acquired. Only accepted rows count. Held and excluded rows need a recorded reason.
- **Alternatives:** Remove unsuitable rows from the manifest, which would lose history.
- **Trade-offs:** Counted in-scope images fall from 29 to 21 for now.

### ADR-041: Hold captioned plates instead of cropping or excluding them

- **Date:** 2026-11-01
- **Status:** Superseded by ADR-044 and ADR-045
- **Context:** Six plates print the site name, which can reveal the script. Excluding them would remove Brahmi. Cropping changes the pixels a model sees, which is an evaluation decision.
- **Decision:** Hold them, and publish checked crop boxes without applying them.
- **Alternatives:** Crop silently, exclude outright, or evaluate as they are.
- **Trade-offs:** Brahmi has no counted images until a decision is made.

### ADR-042: Keep the downloader outside src/

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** A test forbids network clients in `src/`, and that protection should survive Stage C.
- **Decision:** `tools/fetch_images.py` fetches only accepted rows from three allowlisted hosts, never overwrites, and defers files on long rate-limit waits.
- **Alternatives:** Add a network client to `src/`, and relax the test.
- **Trade-offs:** One more top-level folder.

### ADR-043: Record manifest changes in a separate file

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** The manifest must stay traceable, and the user required no silent label changes.
- **Decision:** `manifest_changes.csv` lists every changed field with old and new values. Commit 5e5941d holds the baseline.
- **Alternatives:** Rely on Git history alone.
- **Trade-offs:** The file must be regenerated if decisions change.

### ADR-044: Apply lossless crops in a separate folder

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_cropped_row_never_falls_back_to_the_original`
- **Context:** The user conditionally approved crops, and required originals to stay unchanged.
- **Decision:** Crop with exact coordinates to PNG in `data/processed/`, with no resampling. Originals stay in `data/images/`, set read-only. A cropped row can load only its crop, and shared preprocessing follows.
- **Alternatives:** Crop during preprocessing, or overwrite originals.
- **Trade-offs:** Another folder and more records to keep aligned.

### ADR-045: Require the complete inscription before accepting a crop

- **Date:** 2026-11-01
- **Status:** Implemented; exception decided by the user, see ADR-048
- **Context:** The user required the complete visible inscription. Approved boxes keep 45% to 80% on four plates, and a rectangle cannot do better there, because printed numbers sit beside the text.
- **Decision:** Apply the boxes exactly, measure what they keep, and hold the four partial crops. Code refuses to count a crop whose review says otherwise.
- **Alternatives:** Accept them silently, widen the boxes without approval, or mask printed text.
- **Trade-offs:** Brahmi and Kharosthi keep 2 counted images each until decided.

### ADR-046: Hold SE008 until its licence is independently verified

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_se008_is_not_counted_or_redistributable`
- **Context:** SE008's permission rests on a ticket that cannot be read publicly.
- **Decision:** Keep its metadata, mark it `held` with `redistribution=unknown`, and do not count or redistribute it.
- **Alternatives:** Keep counting it with a caveat.
- **Trade-offs:** Kharosthi loses a rare ink-on-wood example.

### ADR-047: Keep replacement records alongside the original acquisition

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_bad_replacements_are_reported`
- **Context:** SE001 needed a larger file, and the user required its original record to survive.
- **Decision:** Record the replacement in `replacement_images.csv`, with checks on accession, licence, dimensions, and pixel similarity. The manifest URL and hash keep the original acquisition.
- **Alternatives:** Overwrite the manifest URL and inventory entry.
- **Trade-offs:** The counted image's source is found through the crop record, not the manifest URL.

### ADR-048: Count excerpts only if no character is clipped

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_excerpt_with_clipping_or_clues_cannot_be_accepted`. No excerpt has passed
- **Context:** The user conditionally accepted SE003, SE004, and SE010 as excerpts, for script identification only, if no characters are clipped.
- **Decision:** Add `sample_type` and `evaluation_scope`. An excerpt needs a recorded review showing no clipping and no answer clues. All three failed, so they stay held. Complete samples and excerpts are reported separately.
- **Alternatives:** Accept them with a caveat, or change the boxes without approval.
- **Trade-offs:** The expected count of 25 was not reached.

### ADR-049: Keep hard negatives outside the manifest until justified

- **Date:** 2026-11-01
- **Status:** Approved; Implemented; Verified offline by `test_no_hard_negative_counts_or_enters_the_manifest`
- **Context:** The user approved inspection, but not automatic counting. Appearance and catalogue silence do not prove absence of writing.
- **Decision:** Store images in `data/hard_negatives/`, which no evaluation path reads, and record each decision in `hard_negative_review.csv`. Three are held, and two are excluded.
- **Alternatives:** Add them as reserve rows.
- **Trade-offs:** Rejection still rests on easy negatives.

### ADR-050: Treat published parallels as parallels

- **Date:** 2026-11-01
- **Status:** Implemented
- **Context:** Lüders edits the same words as SE001, but on a rail-bar in Calcutta.
- **Decision:** Record it as a parallel on a different object. SE001 stays `verified_institution`, and it is not described as independently verified.
- **Alternatives:** Treat matching text as verification.
- **Trade-offs:** The label rests on one institution.

### ADR-051: Use the holding institution's accession numbers

- **Date:** 2026-11-01
- **Status:** Implemented; conflict Pending independent confirmation
- **Context:** Baums 2012 transposes the Met's numbers for two caskets, and the sources that could settle this were not reachable.
- **Decision:** Keep Met object records and numbers, which agree with their dimensions and images, and record the conflict.
- **Alternatives:** Adopt Baums's numbers, or drop both rows.
- **Trade-offs:** A published scholarly source stays unreconciled.

### ADR-052: Build the MVP on a mock provider before the M0 go/no-go

- **Date:** 2026-11-01
- **Status:** Approved by the user's implementation mission; Implemented
- **Context:** The roadmap held product work until M0. The user directed a complete local MVP, without model calls.
- **Decision:** Build it on a mock provider, with simulated results labelled everywhere. Any real launch still depends on M0.
- **Alternatives:** Wait for M0.
- **Trade-offs:** The product may be built around a capability that M0 shows to be absent. The guided fallback product would reuse the reference collection and interface.

### ADR-053: Use the npm registry for the named stack, and require Node 22.12

- **Date:** 2026-11-01
- **Status:** Implemented. npm registry access Approved by the user on 2026-11-01. The Node 22.12 minimum stays Proposed, and has not been run on Node 22
- **Context:** The mission named the stack, which can only be installed from npm, but the standing rule requires stating the need first. `npm audit` found 7 vulnerabilities, including critical ones in the Vitest chain.
- **Decision:** Treat the named stack as authorization, for it and its test tools only, and disclose this. Upgrade `sharp`, `vitest`, `react-router-dom`, and `@hono/node-server`. Vitest 5 sets the minimum of Node 22.12.
- **Alternatives:** Stop and wait, which the mission ruled out.
- **Trade-offs:** The minimum Node version rises. Playwright uses installed Chrome, so no browser download took place.
- **Approval, 2026-11-01:** The user approved npm registry access for project dependencies and security audits. This covers installing the dependencies in `package-lock.json`, and running `npm audit`. **It is not permission to add arbitrary dependencies.** A new package, or a version change, still needs the need stated first and fresh approval. PyPI and other registries are unchanged.

### ADR-054: Use one structured call in the MVP

- **Date:** 2026-11-01
- **Status:** Proposed; Implemented
- **Context:** ADR-002 proposes separate Observe and Hypothesize stages, to be decided by measurement. No measurement can exist yet.
- **Decision:** Make one call, then verify deterministically. Observations and candidates stay separate fields. ADR-002 stays open.
- **Alternatives:** Build two stages now, untested.
- **Trade-offs:** Hypotheses may influence observations. Compare both designs when evaluation is approved.

### ADR-055: Keep the reference collection as validated JSON, with scripts as data

- **Date:** 2026-11-01
- **Status:** Proposed; Implemented
- **Context:** The six scripts are an initial scope, not a limit. The baseline suggested YAML.
- **Decision:** One JSON file per script, validated by Zod at startup. Every claim carries a source and locator. Unknown fields stay `null`. Only sources read directly are allowed. Adding a script needs no code change.
- **Alternatives:** YAML, which needs another parser. A database, which is unnecessary.
- **Trade-offs:** Characteristics are curated by hand. The comparison service only finds what records state.

### ADR-056: Require two settings for external inference

- **Date:** 2026-11-01
- **Status:** Proposed; Implemented
- **Context:** A real provider sends user images to a third party and costs money.
- **Decision:** Default to the mock. A real provider needs `MODEL_PROVIDER` and `ALLOW_EXTERNAL_INFERENCE=true`, or the server refuses to start.
- **Alternatives:** One setting, or inferring intent from the presence of a key.
- **Trade-offs:** One extra setting.

### ADR-057: Show evidence strength by rule, and no numeric confidence

- **Date:** 2026-11-01
- **Status:** Approved in principle by the user's mission. No-percentage principle stands. The strength rule below is superseded by ADR-065
- **Context:** Model confidence is not calibrated.
- **Decision:** Compute strong, moderate, or weak from evidence counts and image quality. Show no percentage, and label it as a statement about the evidence listed.
- **Alternatives:** Show model confidence.
- **Trade-offs:** The rule is crude, and is untested on real output.

### ADR-058: Keep uploads in memory, and store nothing

- **Date:** 2026-11-01
- **Status:** Proposed; Implemented
- **Context:** Uploads may be sensitive, and retention creates obligations.
- **Decision:** Process each image in memory for one request. Write no temporary file or history. Results stay in the browser tab.
- **Alternatives:** Saved investigations.
- **Trade-offs:** A reload loses the result.

### ADR-059: Ignore forwarded client addresses by default

- **Date:** 2026-11-01
- **Status:** Proposed; Implemented
- **Context:** Keying the rate limit on `x-forwarded-for` let a client bypass it by changing the header.
- **Decision:** Use the header only when `TRUST_PROXY=true`. Otherwise all clients share one bucket, which suits a loopback server.
- **Alternatives:** Read the socket address, which would still need proxy handling.
- **Trade-offs:** Direct clients share one limit.

### ADR-060: Allow historical images to be processed through the Claude Code session

- **Date:** 2026-11-01
- **Status:** Approved by the user
- **Context:** Opening an image in a Claude Code session sends it to Anthropic's model as part of the conversation. Stage C disclosed this for the dataset inspection. The standing rule forbids sending images to any third-party service.
- **Decision:** Allow the project's historical images to be processed through this model session, for work such as inspection and review.
- **Scope limits:** This is not Stage D or Stage E, and it approves no provider, no external inference, no spending, and no sending of images to any other service. What this session reads is not a model result, and must never be counted as evaluation output or quoted as model performance. It does not lift the holds on SE002 or SE008, or allow SE008 to be redistributed. It allows no new downloads, and no change to images, crops, or labels. Treat it as covering this session, and confirm it with the user in a later one.
- **Alternatives:** Forbid all session viewing, which would stop visual review of crops and labels.
- **Trade-offs:** Images leave the machine in the course of a session, so Anthropic's data handling applies to them. Ordinary user uploads are not covered.

### ADR-061: Keep Git author identity unconfirmed until the user verifies it

- **Date:** 2026-11-01
- **Status:** Resolved by the user on 2026-11-01: keep the current global identity. No configuration changed, and `origin` is confirmed as the intended remote. Each commit and push still needs its own approval
- **Context:** The user stated that the Git author identity is not yet verified. Global Git configuration supplies the name `Rohanhola1990`, which commit `5e5941d` also carries for author and committer. No repository-level identity or environment override is set. A commit having used an identity does not show that it is correct.
- **Decision:** Treat the identity as unverified. Change no Git configuration, and create no commit or push, until the user confirms the identity to use.
- **Alternatives:** Assume the identity on the existing commit is correct, which the user ruled out.
- **Trade-offs:** The first commit of the accumulated work waits for this confirmation. If the identity is wrong, correcting `5e5941d` means rewriting history, which needs separate approval. That is easiest now, because there is one commit, and local refs show no sign that it was fetched from or pushed to the `origin` remote added on 2026-11-01.

### ADR-062: Run the independent M0 experiment before product-level real-model fixes

- **Date:** 2026-11-01
- **Status:** Approved by the project owner. This authorizes no inference, Stage D, or Stage E
- **Context:** M0 uses the Python harness and `eval_v1`, so the product's API, adapter, and verifier are not on its path. A first review wanted the product P0 list fixed first.
- **Decision:** M0 comes first. The product P0 list, including the 13 adversarial verifier cases, stays in the backlog and must be fixed and tested before real inference through the application. The product verifier is not changed for M0 unless a shared dependency creates a demonstrable experiment correctness issue. The 2026-11-01 review found no shared dependency. See [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md).
- **Alternatives:** Fix P0 first, which delays the test of the riskiest assumption.
- **Trade-offs:** A pass on M0 says nothing about the product path (F-19), and product defects remain open for longer. Harness fixes are separate from this backlog, and still come before Stage D.

### ADR-063: Keep network code outside src/, and require a guard for live runs

- **Date:** 2026-11-01
- **Status:** Approved by the user as the harness fixes; Implemented; Verified offline by `tests/test_live_safety.py`. Never run against a provider
- **Context:** The review found no spending guard, no stop on fatal errors, and no transport (H-01 to H-03). ADR-037 and an existing test keep network clients out of `src/`. This updates ADR-037, because a transport now exists.
- **Decision:** Put the `httpx` transport and preflight in `live/`, which nothing in `src/` imports. `--live` stays refused, and no command can start preflight. A run that is not synthetic must have a `RunGuard`. Fixture replays have none, so their recorded failures still play out in full. Limits live in `run.yaml`, and they are estimates from list prices.
- **Alternatives:** Allow `httpx` in `src/`, which would weaken an existing safety test.
- **Trade-offs:** Stage D must still add an entry point. Until H-11 is done, a stopped run produces no metrics.

### ADR-064: Clear printed marks from blank paper, and count only plates with no mark left

- **Date:** 2026-11-01
- **Status:** Approved by the user; Implemented; Verified offline by `tests/test_margin_clearing.py`. This closes Q-10
- **Context:** The user approved Q-10 in principle on the conditions that only blank-paper pixels change, each plate passes inspection, and rows and gates are recalculated. No mask existed, caption handling was unstated, and inspection conflicted with that session's ban on external image transmission. The user settled all three on 2026-11-01.
- **Decision:** New crop boxes may replace SE003 and SE004's crops. Printed numbers and captions on blank paper are filled with the median colour of the surrounding paper, recorded per region. A region is refused unless at least 75% of the 12 px ring around it is paper-bright. No pixel on the inked impression may change, and a plate with any printed mark left stays held. For this work the user confirmed ADR-060 for SE003, SE004, SE010, and their outputs, in this session only. That covers Anthropic only, and it is not a model result.
- **Result:** SE003 and SE004 are accepted as `complete`. 69 regions are recorded in `dataset/margin_regions.csv`. **SE010 stays held**, because its numbers 2, 4, 10, 12, and 14 are printed on or at the inked impression. In-scope images rise from 22 to 24, and gates are 12/24, 20/24, and 20/24. Labels and gate fractions are unchanged.
- **Alternatives:** Flat white fill, which Stage C proposed. Paint over SE010's labels, which would change inked pixels. Hand-drawn masks, which are harder to review.
- **Trade-offs:** Regions were found by a detector and then checked by eye, so the record is a set of reviewed rectangles and not a rerunnable detection. Kharosthi stays at 2 images. Three of the four Brahmi images are now printed plates, which strengthens the plate-versus-photograph cue. The measured paper tone was white or nearly white, so fills are not visible as patches.

### ADR-065: Require sourced matches for Strong, and refuse contradictory output

- **Date:** 2026-11-01
- **Status:** Implemented at the user's direction; Verified offline by `apps/api/test/adversarial.test.ts`. Proposed as the lasting rule, because handover decision 5 on the name and display of evidence strength is still open. It supersedes the strength rule in ADR-057, and keeps ADR-057's ban on percentages. Never tested on real model output
- **Context:** 12 of 13 hostile outputs were handled wrongly, because strength counted model-written lines, cross-field contradictions were ignored, stored records were never consulted, and those same lines could switch off the expert notice.
- **Decision:** Strong needs at least 2 stored traits confirmed by a structured field, plus 3 items, no contradicting evidence, and a good image. Direction is the only such check today, so **no result can currently be strong**. A conflict with a stored direction lowers a candidate to weak, and never removes it. Supporting evidence must use a word from `knowledge/visual_vocabulary.json`, must not name the candidate, and counts once. Evidence against is kept unless it breaks the written-form history rule. `writingPresent: false` with `candidates` or `out_of_scope`, and `candidates` or `no_writing` on a poor image, become `insufficient_evidence`. The expert notice can no longer be switched off by model text, and stays on for `no_writing` (ADR-049).
- **Alternatives:** A longer blocklist of names and periods, which is arbitrary and always incomplete. Removing `strong` from the contract, which would also remove the target for sourced features.
- **Trade-offs:** The vocabulary classifies a statement and cannot show that it is true. False statements in visual words still pass, and history mixed with a visual word can survive, so both are pinned as known limits and capped at moderate. Correct evidence in unlisted words or other languages is rejected. That rate is unmeasured, and only the product-path experiment can measure it. The product prompt does not yet tell a model about this vocabulary.

### ADR-066: Commit app screenshots, and keep dataset images out of Git

- **Date:** 2026-11-01
- **Status:** Approved by the user for the M0 freeze commit
- **Context:** `CLAUDE.md` said never to commit images, while ADR-026's context is historical dataset images. `docs/screenshots/` holds 6 PNGs of the app in demo mode, showing only a generated test image, and the README embeds one of them.
- **Decision:** Commit the app screenshots. ADR-026 stands for everything under `data/`.
- **Alternatives:** Exclude and gitignore them, which breaks the README image.
- **Trade-offs:** They add 5.3 MB to history. The browser suite rewrites them, so a browser test run marks them as modified (F-18).

### ADR-067: Run Stage D through one approval-gated command

- **Date:** 2026-11-02
- **Status:** Implemented at the user's direction; Verified offline by `tests/test_stage_d.py`. Proposed as the way to run Stage D. **Running it needs separate approval.** This updates ADR-063, which said no command could start preflight
- **Context:** Stage D needs an entry point, and hosts can be read only through a catalog endpoint that needs a key. An accidental paid call or Stage E run must be impossible by construction.
- **Decision:** `live/stage_d.py` has a free `catalog` step and a `preflight` step, for one named model. It refuses before any network use unless the approved commit is HEAD, the tree is clean, frozen hashes match, the gateway is expected, and a key is present. It refuses before any paid call unless the catalog confirms host, price, and structured output. It imports no dataset loader, and it stops at $0.05 of estimated usage and 18 attempts per model, across runs. Model A's host is a command argument, so `config/models.yaml` keeps its frozen hash. `--live` stays refused.
- **Alternatives:** Enable `--live`, which sits beside the Stage E path. Write the host into `config/models.yaml` first, which changes a frozen file before the host is confirmed.
- **Trade-offs:** The command needs a clean tree, so the preparation must be committed before it can run. The catalog reply shapes come from documentation and an earlier snapshot, and a mismatch refuses safely. Moving to Stage E still needs a change to `config/models.yaml` and `FROZEN_SHA256`.

### ADR-068: Prefer DeepInfra as Model A's host

- **Date:** 2026-11-02
- **Status:** Proposed. Depends on the Stage D catalog step
- **Context:** OpenRouter's public pages name no host. ADR-014 fixes the model and gateway, and leaves the host open.
- **Decision:** Pin Model A to DeepInfra through OpenRouter, using the exact catalog tag, with fallbacks off.
- **Alternatives:** Novita, whose listed price is above the configured price. Calling DeepInfra directly, which would change the gateway in ADR-014.
- **Trade-offs:** Both models would sit on one host, so a host fault would affect both. Strict `json_schema` is undocumented there, so the `json_object` fallback may be needed.

