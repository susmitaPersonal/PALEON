# Session Handover

> **Version:** 1.8 | **Last updated:** 2026-11-02, catalog report change committed locally

Update this document at the end of every substantial session, with observed results only. Older entries move to the session log at the bottom.

## What this project is

ScriptEcho helps people investigate unfamiliar historical scripts from images, reporting evidence and uncertainty, with history only from curated sources. A local MVP runs on simulated fixtures. The owner now calls the project PALEON, and the repository still says ScriptEcho. Milestone M0, still unrun, tests whether hosted open-weight vision models can do the task at all. See [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## Where the project stands

**The local MVP is complete in demo mode, and a post-MVP review found confirmed defects that are not yet fixed.** See [POST_MVP_ARCHITECTURE_REVIEW.md](POST_MVP_ARCHITECTURE_REVIEW.md). The earlier statement that no bugs were known is superseded. The user approved one local freeze commit, which holds all work to date. It has not been pushed. No model has been called, and no money has been spent, so **it is still unknown whether any model can do this task**.

**Naming trap:** the mission called model integration "Stage D" and the backend "Stage E". In this repository, Stage D and Stage E mean the experiment's live checks and full run. **Those have not happened, and finishing the mission approved neither.**

| Area | Status |
|---|---|
| Web app and API | Implemented; Verified by `npm test` and live runs of `npm start` and `npm run dev` |
| Provider | Mock by default. Real adapter tested with a fake `fetch` only |
| Product verifier | Hardened (ADR-065). Verified offline against the 13 adversarial cases. Never seen real model output |
| Reference collection | 6 records, 8 sources, 32 citations all resolve. Source-checked by a non-specialist, no expert review |
| Offline harness | Implemented; Verified offline on synthetic fixtures |
| Dataset | 43 rows: 34 accepted, 3 held, 2 excluded, 4 not acquired |
| Counted images | 24 in-scope, all complete samples, and 10 rejection. No excerpt counts |
| Evaluation gates | Approved fractions. Currently 12/24, 20/24, 7/10, 20/24, and 92/102 valid |
| Hard negatives | 5 inspected: 3 held, 2 excluded, 0 counted |
| Experiment Stages D and E | Not started, and not authorized |

### Held and excluded

| Row | State | Why |
|---|---|---|
| SE002 | Held, by user decision | About 45% kept, from a blurred book-page photograph |
| SE010 | Held | Marked as an excerpt, and its numbers 2, 4, 10, 12, and 14 are printed on or at the impression, so Q-10 cannot clear them (ADR-064) |
| SE008 | Held, by user decision | Licence not independently verified. Not redistributable |
| SE009 | Excluded | Signs cannot be separated from speckle |
| SE028 | Excluded | No recognisable writing |

## Exact next action

**Wait for explicit approval.** The freeze commit is `67de8e71b119620a296fd3664d81de1f9e9aa0d9`. Stage D is prepared and has not run. The preparation is commit `285d91da9aad818b132ca362d9d146b57a5990e0`, the direct child of the freeze commit. **The catalog report change is committed locally as the direct child of `285d91d`. That commit is HEAD, and `git log` shows its hash, which a commit cannot contain.** The first approved catalog run, on `285d91d`, refused locally, because `OPENROUTER_API_KEY` was not set. No live catalog response exists. The owner decided that M0 precedes product-level real-model fixes (ADR-062), and that decision authorizes no inference. Stage D and Stage E stay unauthorized. Do not start anything until the user says so.

The path to Stage D is in [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md#required-before-stage-d):

1. **Next approval required:** approve the catalog call on the current HEAD hash, accepting that its cost is undocumented and that a normal key may be refused. The earlier approval named `285d91d`, and the command no longer accepts that hash. The owner runs it, because keys never enter this session.
2. Approve Stage D: the $0.10 budget, keys, and whether Model B runs canaries before DeepInfra answers.
3. Run the commands in [Phase 4](M0_READINESS_AND_EXECUTION_SPEC.md#phase-4-stage-d-preparation) with the approved hash. Send DeepInfra the drafted question before Stage E.

**Before any push:** `origin/main` is at `3508da65`, which this clone does not have. Inspect it first, and do not force-push.

The 13 adversarial cases now have permanent tests. The rest of the product P0 list must still be fixed and tested before real inference through the application.

| # | Decision waiting on the user |
|---|---|
| 1 | Keep one vision call plus deterministic lookup as the baseline (ADR-054)? |
| 2 | Must the product path be evaluated later as a second experiment? |
| 3 | Approve the remaining product P0 list? The harness fixes are done |
| 4 | Approve Stage D, and separately Stage E, as specified? |
| 5 | Keep the ADR-065 rule, and rename or hide evidence strength now that Strong cannot be reached? |

## User decisions recorded on 2026-11-01

| Decision | Status | Limits |
|---|---|---|
| npm registry access (ADR-053) | Approved, for project dependencies and security audits | Not permission to add arbitrary dependencies. New packages and version changes need fresh approval. PyPI and other registries are unchanged |
| Historical images through this model session (ADR-060) | Approved | Not Stage D or E. No provider, third-party inference, or evaluation use. SE002 and SE008 stay held. Confirm it again in a later session |
| Git identity (ADR-061) | Confirmed: keep the current global identity | No configuration changed. Each commit and push needs its own approval |
| `origin` remote | Confirmed as intended | No push is approved |
| Harness fixes H-01 to H-06, H-08, H-10 | Approved, Implemented, Verified offline | No commit, API call, or spending. `--live` stays refused |
| Q-10 margin clearing | Approved, scope settled, and applied (ADR-064) | Numbers and captions on blank paper only. No inked pixel changes. Local paper tone. SE010 stays held |
| Session image access for Q-10 | Approved for SE003, SE004, SE010, and their outputs, in this session only | Anthropic only. Not a model result. Confirm again in any later session |
| Verifier hardening | Directed by the user, and Implemented (ADR-065) | The rule stays Proposed until decision 5 |

### Git identity check

Read-only checks on 2026-11-01. Nothing was changed.

| Item | Result |
|---|---|
| Source of configuration | Global `~/.gitconfig`, with no repository-level value and no `GIT_AUTHOR_*` or `GIT_COMMITTER_*` override |
| Name for a future commit | `Rohanhola1990`, with the email in global Git configuration |
| Commit `5e5941d` | The same identity as author and committer |
| Remote | `origin` at `git@github.com:susmitaPersonal/PALEON.git`, added outside this session at 22:35 on 2026-11-01. `main` has no upstream, and no remote-tracking refs exist. A read-only `git ls-remote` shows `main` at `3508da65`, which this clone does not have. Its contents are unknown. **Pushing still needs approval** |
| Decision | The Git email differs from this Claude session's account email. The user chose to keep the Git identity |

Other open questions are Q-5 and Q-6 in [DECISIONS.md](DECISIONS.md).

## M0 readiness review

[M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md) holds the review and the Proposed specification. **The review changed no harness code, prompt, label, configuration, dataset, or result.** Its fix status section records the later approved fixes. No model or provider API was called, no image was opened or sent, and no money was spent.

| Result | Detail |
|---|---|
| Scoring | Passed: prompt, labels, row selection, preprocessing, top-1, top-3, reproducibility, and retry counting |
| Gaps at review | No live path, no spending guard, fatal errors did not stop the run, OpenRouter route not pinned. **Now fixed offline, except that Stage D must name Model A's host** |
| Crashes shown by probe, now fixed | `httpx` timeouts, malformed envelopes, a lone surrogate, and `Retry-After` of `inf` or `-5` |
| Largest model risk | Model B may see about 800 × 800 px by default (H-12). This is arithmetic on published config |
| Unresolved | Model A's host is Proposed as DeepInfra, unconfirmed until the catalog step. DeepInfra has not confirmed that its "Google models" exception excludes Gemma |
| Proposed limits | 648 requests at most, and a $2.00 stop limit. Calculated ceiling $1.39, planned $0.26, all estimates |
| Product verifier | No shared dependency with M0, so unchanged |

Model A is proposed as primary, and Model B as conditional on Stage D findings. Stage D uses generated canaries only. **ADR-060 does not cover Stage E.** Sending the 34 images to third parties needs its own approval.

## Post-MVP review

**The review changed no source, prompt, or dataset file.** It created `docs/POST_MVP_ARCHITECTURE_REVIEW.md` and updated this handover. Probes ran from the session scratchpad with fake providers and synthetic images, and they are not in the repository. No model was called.

Version 1.1 re-verified the findings against unchanged source, and added mock and real separation, candidate ranking, and uncertainty and rejection handling. It also added F-23 (demo results report identification as available) and F-24 ("no writing" never recommends expert review).

Confirmed by probe, and still unfixed:

| Finding | Issue | Result |
|---|---|---|
| F-01 | Concurrency cap fails over real sockets | Cap 1: 6 in flight, in 10 of 10 rounds |
| F-02 | Deadline does not bound retry waits | 200 ms deadline took 3,004 ms |
| F-03 | Warnings fail open if `/runtime` fails | No banner and no error, upload still offered |
| F-04 | Product adapter lacks `max_tokens`, seed, provider options, and `finish_reason` | Request has 4 keys |
| F-08 | History filter is easily bypassed | **Partly addressed by ADR-065.** History mixed with a visual word can still survive, and stays below Strong |
| F-14 | Citations jump to the wrong record | Kharosthi citation lands in the Brahmi panel |

F-09 and F-24 are fixed. F-10 is fixed apart from the abstention question.

The review also found these structural issues: **M0 does not test the product path (F-19)**, 28 of 32 citations go to Unicode (F-20), and now 8 of 34 accepted images exceed the 8 MB upload limit (F-21).

**Known wrong statements still in documents**, left unchanged until the user decides on P0: the concurrency row in `SECURITY_AND_PRIVACY.md`, the deadline row in `MODEL_PROVIDER_GUIDE.md`, the `data_collection` row in `SECURITY_AND_PRIVACY.md`, and the Playwright line in `CHANGELOG.md`. The review lists each one.

## Competition readiness audit

[COMPETITION_READINESS_AUDIT.md](COMPETITION_READINESS_AUDIT.md) measures the project against the Week 1 to 3 overall winners and 12 criteria, as a quality benchmark only. The project is not eligible, and all five challenge windows are closed.

| Status | Count | Criteria |
|---|---|---|
| Complete | 0 | None |
| Partial | 7 | Problem and user, end-to-end experience, evidence, safeguards, limitations, privacy, documentation |
| Blocked | 2 | Open-weight core, evaluation |
| Missing | 3 | User or expert feedback, demo, why open AI matters |

Findings beyond the review:

- Evidence has no link to an image region or a sourced feature, and the winners' main strength is checking output against something outside the model.
- 12 of 13 hand-written hostile outputs were handled wrongly. `writingPresent: false` still earned Strong evidence. These cases were chosen to break the verifier, so this is not a rate.
- All four counted runic images are among the 6 that exceed the upload limit.
- Results report script identification as `available`, even in demo mode.
- This machine is an M1 with 8 GB of memory, so neither selected model is a realistic local candidate.
- No document explains why open models matter here, and no real demo, user feedback, licence, or CI exists.

Offline re-run: 537 passed, 0 failed, on Node 24.3.0. Eight of 8 source URLs returned HTTP 200, and 5 of 5 sampled claims matched the live text. No model was called. The audit changed no code, label, prompt, gate, or evaluation record. Rerunning the browser suite regenerated `docs/screenshots/` (see F-18).

## Authorization

### Authorized

- Maintaining documentation.
- Stages A, B, B.1, B.2, C, C.1, and C.2, and the local MVP mission, which are complete.
- npm registry access for project dependencies and security audits (ADR-053).
- Processing historical images through this model session (ADR-060).
- Preparing the M0 specification, and reading public model and policy pages. Neither is preflight.

### Requires explicit approval

Each of these needs its own approval. Approval of one does not extend to another.

- **Any Git commit or push, or any change to Git identity.** The identity and remote are confirmed (ADR-061), and that approves no commit.
- **Stage D:** live provider checks, provider preflight, any model API call, or connecting OpenRouter or Hugging Face.
- **Model inference, and Stage E.**
- Any spending or paid services.
- Public deployment, or publishing the repository.
- Adding new packages, or changing a dependency's version. The npm approval in ADR-053 does not cover this.
- Enabling `ALLOW_EXTERNAL_INFERENCE`, or supplying a key.
- Changing crops further, masking any other image, or moving a held row to accepted. SE010 stays held.
- Counting any hard negative, or adding one to the manifest.
- Counting or redistributing SE008, or attempting to bypass its licensing.
- Downloading or adding any further image.
- Sending images to any third-party service, other than this session under ADR-060.
- Modifying `data/images/`.
- Enabling `--live`, or running `live/stage_d.py` in any mode that reaches a network. Its catalog step counts.
- Accessing PyPI or any registry other than npm. Use of a local cache must be disclosed.
- Editing `docs/ARCHITECTURE.md`, or changing `prompts/eval_v1.md`.
- Changing a script label, or reclassifying one without documented evidence and approval.

## How to run

On this machine, first run `export PATH=/opt/homebrew/bin:$PATH`, because the default `node` is too old.

```bash
npm install
npm run dev     # http://127.0.0.1:5173
npm start       # http://127.0.0.1:8787
npm test        # Complete offline suite
```

From `experiments/m0_feasibility`:

```bash
../../.venv/bin/python -m pytest -q
../../.venv/bin/python -m src.run --check
../../.venv/bin/python -m src.run --synthetic
```

Images are gitignored. On a machine without them, `--check` validates metadata only. The scripts in `tools/` rebuild them.

## Completed in the MVP mission

| Item | State |
|---|---|
| Stage C.2 items | Already complete at the start |
| Model integration, with mock provider | Done |
| Backend | Done |
| Frontend | Done |
| End-to-end flow in demo mode | Done |
| Test suite, one command | Done |
| Security and production-readiness documents | Done for local use. Deployment gaps are listed in [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) |
| Repository documents | Done |
| Final verification | Done, on Node 24.3.0 |

## Tests and checks run

Final run on the finished MVP code, 2026-11-01. **Passing tests do not cover the defects listed under [Post-MVP review](#post-mvp-review).**

**Latest run, catalog report change:** 468 pytest and 219 Vitest tests passed, `--check` exited 0, and `--live` exited 2. Browser tests were not rerun.

**Run for the Stage D preparation:** 438 pytest tests passed, `--check` exited 0, `--live` exited 2, and the real Stage D command refused locally with exit 2. Vitest and browser tests were not rerun, because no product file changed.

**Run after Q-10 and the verifier work:** on Node 24.3.0 and Python 3.12.7, `npm test` exited 0 with **659 passed, 0 failed**: contracts 4, API 183, web 32, browser 36, experiment 404. `--check` exited 0 with no dataset problems and one expected live blocker, `--synthetic` kept its gate results, and `--live` exited 2. 19 of 19 deliberate breaks were caught. The browser run regenerated `docs/screenshots/`.

Earlier run, after the harness fixes: 179 Vitest and 384 pytest tests passed, and 24 of 24 deliberate breaks were caught.

M0 readiness run, before the fixes: pytest 322 passed, `--check` exit 0 with no dataset problems, `--synthetic` to the scratchpad exit 0 and matching `s03` apart from latency, `--live` refused, 0 image hash mismatches, and all 32 counted images deterministic through `LocalImageSource`. See the changelog entry for the combined offline run.

Earlier rerun, same source, on Node 24.3.0 for review version 1.1: typecheck and reference validation passed, 179 Vitest tests passed (4 contracts, 143 API, 32 web), 322 pytest tests passed, `--check` exited 0, `--live` was refused, and `npm audit` reported 0 vulnerabilities. The 36 browser tests were not rerun, because they rewrite tracked screenshots. The audit session last ran them, on the same source.

| Check | Result |
|---|---|
| `npm test` | Exit 0. **537 passed, 0 failed** |
| Typecheck, reference collection | Pass |
| Contracts | 4 passed |
| API | 143 passed |
| Web | 32 passed |
| Browser, real Chrome | 36 passed: 18 tests at desktop and mobile sizes, with axe on every page |
| Experiment `pytest -q` | 322 passed |
| `npm start` live | Health, readiness, deep links, upload, and 5 rejections, by `curl` |
| `npm run dev` live | Web app, deep link, proxy, and upload through the proxy, by `curl` |
| Citations live | 6 scripts, 32 citations, 0 unresolved |
| `npm audit` | 0 vulnerabilities |
| `--check`, `--synthetic` | Exit 0, with no dataset problems |
| `--live` | Refused, as intended |
| Original image hashes | 40 OK |
| Frozen prompt | Unchanged from the commit. File hash `67085eb8...`; harness hash `7240f44b...`, which covers the parsed parts and matches `run.yaml` |
| `docs/ARCHITECTURE.md` | Unchanged |
| Mermaid | 10 of 10 diagrams parse |
| Relative Markdown links | 160 checked, 0 broken |
| Secret scan | No key patterns in tracked or new files, or the web bundle |
| Screenshots | Viewed. They contain only a generated image. Committed under ADR-066 |
| Mutation checks | Allowing `unsafe-inline` failed the API run. Removing the proxy fix failed its test |

**Not checked:** a fresh clone or clean install, Node 22 itself (the runs used 24.3.0, and `node@22` here links to that version), browsers other than Chrome, Windows or Linux, a screen reader, and external URLs after their first reading.

## Decisions

New in the MVP mission: ADR-052 to ADR-059. Most are Implemented but Proposed, so they need user review. In ADR-053, npm access is Approved, and the Node 22.12 minimum stays Proposed. ADR-060, ADR-062, and ADR-063 are Approved, and ADR-061 is resolved.

Approved and in force: ADR-014, ADR-015 with ADR-031, ADR-026, ADR-029, ADR-034, ADR-035, ADR-036, ADR-044, ADR-046, ADR-047, ADR-048, and ADR-049.

The wider product architecture (ADR-001 to ADR-013) and the November 15 target (ADR-030) remain Proposed. ADR-002 stays open (ADR-054).

## Outstanding issues

### Dataset

- Brahmi has 4 counted images and Kharosthi 2, so their contrast rests on 6 images.
- 3 of 4 Brahmi images are printed plates, so medium may act as a cue. SE003's signs are small at model size.
- Rejection rests on 2 easy negatives. No harder example has qualified.
- 26 of 34 counted rows come from the Met.
- Greek and runic have 4 counted rows each.
- Modern marks, conservators' paint, art style, and crop framing may act as cues.
- No epigrapher has reviewed the labels.

### Unresolved evidence

- **Caskets:** Baums 2012 and the Met disagree on accession numbers. Met records and images agree. Not independently resolved, and asking the Met would settle it.
- **SE001:** the label rests on Cleveland. Lüders A 101 is a parallel on a different object.
- **SE008:** licence not independently verified.
- **Rummindei and several Met facts:** still search excerpts, because those sites return HTTP 403 and 429.

### Not built

- Experiment: live mode for Stage E, and fixes H-07, H-09, H-11, and H-15.
- Product: crop tool, transcription, authentication, CI, spending budget, a clean-install check.

### Provider

- Image input and structured output are not proven for either model.
- DeepInfra and Hugging Face data policies were read as vendor statements. The evidence suggests the "Google models" exception does not cover Gemma, and DeepInfra has not confirmed that.
- Model A's host is Proposed as DeepInfra (ADR-068), because OpenRouter's public pages name none.
- `OPENROUTER_API_KEY` and `HF_TOKEN` are not set. Hugging Face free accounts have no included credits.

### Environment

- `.venv` uses Python 3.12.7 and inherits local Anaconda packages.
- Default `node` here is 16. The app needs `/opt/homebrew/bin` (24.3.0). Mermaid checks need Node 20 from `~/.nvm`, and their checker sits in the session scratchpad, so it must be rebuilt.
- Commits will carry the global Git identity, which the user confirmed (ADR-061).

## Git status

`main` has four commits, and the tree is clean: `5e5941dd2b823e06981e6dad42cbd490b7d5e4fa`, its child the M0 freeze commit `67de8e71b119620a296fd3664d81de1f9e9aa0d9`, the Stage D preparation commit `285d91da9aad818b132ca362d9d146b57a5990e0`, and the catalog report commit. Run `git log` for that hash, which a commit cannot contain. **All work to date is committed, and none of it has been pushed.** A remote, `origin`, is configured, its `main` holds a commit this clone does not have, and nothing has been pushed from this session. `data/`, `results/`, `node_modules/`, `dist/`, and test output are gitignored, apart from `results/.gitkeep`. Six screenshots in `docs/screenshots/` are committed, and a browser test run rewrites them, so it marks the tree as modified. Do not start a live run on a dirty tree.

## How to resume

1. Read [CLAUDE.md](../CLAUDE.md), [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), and this file.
2. Run `git status`, `npm test`, and `--check` to confirm this state still holds. Read the counts, because the exit code alone has misled this project before.
3. Check the user's latest message for approvals. Do not infer approval from these documents.

## Session log

| Date | Summary |
|---|---|
| 2026-11-01 | Architecture, Stage A, Stage B, and permanent documentation. Waiting for user review |
| 2026-11-01 | Stage B.1: label evidence, quality report, gates as fractions, first commit. Waiting for user review |
| 2026-11-01 | Stage B.2: offline harness joined, one-command synthetic run, 196 tests. Uncommitted, waiting for user review |
| 2026-11-01 | Stage C: 39 images acquired and inspected, 31 accepted, 7 held, 1 excluded. 233 tests. Uncommitted, waiting for user review |
| 2026-11-01 | Stage C.1: 7 crops inspected, 32 accepted, 5 held, 2 excluded. 288 tests. Uncommitted, waiting for user review |
| 2026-11-01 | Stage C.2: excerpts failed the clipping check, 5 hard negatives inspected, none counted. 322 tests. Uncommitted, waiting for user review |
| 2026-11-01 | MVP mission: local app on a mock provider, reference collection, offline suite, documents. 537 tests passed. No model called. Uncommitted, waiting for user review |
| 2026-11-01 | Competition readiness audit: 0 complete, 7 partial, 2 blocked, 3 missing. 537 tests re-run and passed. No model called. Uncommitted, waiting for user review |
| 2026-11-01 | Post-MVP review: architecture and ADR review, offline probes, 21 numbered findings plus a list of smaller issues. No source changed. Waiting on five user decisions |
| 2026-11-01 | Harness fixes approved and done: 8 fixes, 62 new tests, 384 pytest tests passed, 24 of 24 deliberate breaks caught. Git identity, `origin`, and Q-10 decided. Q-10 not applied. No commit, API call, or spending. Waiting on the user |
| 2026-11-01 | M0 readiness: owner set M0 first (ADR-062). Scoring passed, 16 harness findings recorded, Proposed execution specification written. No harness change, model call, or spending. Waiting on the user |
| 2026-11-02 | Catalog run refused locally with no key set. Image input added to the catalog report from `data.architecture.input_modalities`, model level only. 468 pytest tests passed, 10 of 10 deliberate breaks caught. No catalog call. Committed locally on approval, not pushed. Waiting on the catalog approval for the new hash |
| 2026-11-02 | Stage D prepared: host and policy evidence, guarded command, 34 new tests, 438 pytest tests passed, 14 of 14 deliberate breaks caught. No provider call or spending. Committed locally on approval, not pushed. Waiting on the user |
| 2026-11-01 | M0 freeze commit approved and made, with 174 files reviewed and all freeze hashes matching. No push. Waiting on Stage D approval |
| 2026-11-01 | Q-10 applied: SE003 and SE004 accepted, SE010 held, gates 12/24 and 20/24. Verifier hardened (ADR-065), with the 13 adversarial cases as permanent tests. 659 tests passed, 19 of 19 deliberate breaks caught. No model call, spending, commit, or push. Then waiting on the freeze commit decision |
| 2026-11-01 | Approvals recorded: npm access (ADR-053) and session image processing (ADR-060). Git identity checked and left Pending (ADR-061). Review 1.1 re-verified the findings, added 3 sections and F-23 and F-24, and narrowed P0 to gate product inference, not M0. No source changed. Waiting on the user |
