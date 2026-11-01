# Competition Readiness Audit

> **Version:** 1.2 | **Date:** 2026-11-01 | **Status:** Findings are observed. Every recommendation is **Proposed**, and nothing here is approved or started.

Related: [SESSION_HANDOVER.md](SESSION_HANDOVER.md), [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), [DECISIONS.md](DECISIONS.md), [MODEL_EVALUATION.md](MODEL_EVALUATION.md)

## Later updates

The audit below is kept as written, apart from these roadmap rows. On 2026-11-01, Q-10 was applied (ADR-064) and the verifier was hardened (ADR-065). All 13 cases in [Safeguard tests](#safeguard-tests) now have permanent tests, and they behave as expected. The table there records the behaviour before that fix. Counts of 22 and 32 images are now 24 and 34, and 8 of 34 accepted images exceed the upload limit. `origin` now exists, and its `main` holds a commit that this clone does not have.

## Verdict

**ScriptEcho is a well-built, honest shell around a capability nobody has tested.** The application, safeguards, dataset, and evaluation protocol are real. The core claim, that an open-weight vision model can tell these scripts apart, has never been tried. Every result on screen today comes from a fixture.

| Status | Count | Criteria |
|---|---|---|
| Complete | 0 | None |
| Partial | 7 | 1 Problem and user, 3 End-to-end experience, 4 Evidence, 5 Safeguards, 7 Limitations, 8 Privacy, 11 Documentation |
| Blocked | 2 | 2 Open-weight core, 6 Evaluation |
| Missing | 3 | 9 Feedback, 10 Demo, 12 Why open AI |

The four findings that matter most:

1. **No model has analysed any image.** Everything else depends on this, and the check is estimated at cents.
2. **Evidence is unverifiable text.** Nothing ties a claim to a part of the image, and the winners' main strength is checking model output against something outside the model.
3. **The safeguards can be bypassed.** In this audit, a model that wrote three bare assertions, or that said no writing was present, still earned **Strong evidence** with no expert-review prompt.
4. **The evaluation does not test the product.** It uses a different prompt, schema, and code path. All four counted runic images also exceed the product's upload limit.

The recommended order is to **test the capability first and build evidence anchors second**. If the model fails, most of that work would be wasted.

An independent [post-MVP review](POST_MVP_ARCHITECTURE_REVIEW.md) reached the same core findings. The owner has since settled the order: M0 runs first (ADR-062). The [M0 readiness review](M0_READINESS_AND_EXECUTION_SPEC.md) found that the harness needs fixes before it can run live.

## Scope and method

### Eligibility

**This audit is a quality benchmark, not an entry plan.** The project is not eligible for Week 4, because it started after entries closed ([PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), ADR-030). All five challenge windows on the [challenge hub](https://dev.to/challenges/hf26) show as closed, and the last ended on October 31.

### State audited

A second session finished the local MVP while this audit ran, so early observations were discarded. This audit reflects the tree after its last project write at 19:05 IST. Its test claims were re-run independently.

The only intended edits are this document, the handover, the changelog, and the overview's document map. Running the checks also regenerated the six images in `docs/screenshots/`, which the browser suite writes, along with gitignored build, test, and synthetic output. No application code, label, frozen prompt, or evaluation record was touched.

### Checks run

All were offline, except for the source and challenge lookups noted below. No model was called, and no image left this machine.

| Check | Result |
|---|---|
| `node scripts/test-all.mjs --skip-e2e`, Node 24.3.0 | Pass: contracts 4, API 143, web 32, experiment 322 |
| `playwright test` | 36 passed |
| Total | **537 passed, 0 failed**, matching the handover |
| `validate:knowledge` | 6 scripts, 8 sources |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `src.run --check` | Exit 0 |
| Verifier with hand-written hostile output | 13 cases, see [Safeguard tests](#safeguard-tests) |
| Mock API with real dataset images | 8 uploads, see [Demo mode on real images](#demo-mode-on-real-images) |
| Source URLs | 8 of 8 returned HTTP 200 today |
| Claims compared with live source text | 5 of 32 |

### Benchmark

The DEV pages give no reason for any win, so the strengths below are this audit's reading of the winners' own posts. Those numbers are self-reported, and no winner's repository was inspected. Only the three overall winners were read in depth.

| Project | Week | Strengths worth learning from |
|---|---|---|
| [Paper Trail](https://dev.to/mikek/paper-trail-gemma-writes-your-walk-a-field-card-then-the-screen-goes-away-3mf4) | 1 | Gemma in the browser. `checkTip()` passes a line only if its content words appear in the source text, otherwise the card quotes the source. 72 species tested, with a hand review that reports 5 wrong tips of 39 |
| [Deis](https://dev.to/muhammadmurtuzahussain/job-hunting-became-my-side-hustle-so-i-built-deis-gemma-4-tinder-for-jobs-swipe-right-gemma-3jcm) | 2 | "Gemma judges, code guarantees." Each CV line must cite confirmed facts, and a Checks tab lists what was removed. Local mode with an egress guard, real user feedback, CI, and published results |
| [Second Look](https://dev.to/hotragn/the-laziest-way-to-pick-a-2027-health-plan-beat-my-model-82-vs-79-so-i-built-second-look-to-a29) | 3 | The model may only point to text, and code confirms the quote exists. Answer key committed before any model ran, test sets scored once, and the title admits a simple baseline beat the model |

**What they share:** one specific problem, a real model running, output checked by code against something outside the model, a published failure or baseline, and a clear reason why open models were necessary.

**Two cautions:**

- DEV's listed criteria put **Writing Quality first** and Technical Execution fourth. ScriptEcho has no public write-up.
- Your 12 principles are not universal among these three. Second Look reports no substantive user feedback, Paper Trail describes no formal user testing, and Paper Trail is not fully offline.

## Relation to the post-MVP review

A separate session wrote [POST_MVP_ARCHITECTURE_REVIEW.md](POST_MVP_ARCHITECTURE_REVIEW.md) while this audit was being finished. The two were done independently, and each used its own probes. That review goes deeper on code defects, and this audit goes deeper on evidence grounding, the demo, feedback, and the case for open models.

| Topic | This audit | Post-MVP review |
|---|---|---|
| History filter | 6 of 6 realistic strings kept, plus the control removed | F-08: 13 of 16 strings survived |
| Evidence strength | Bare claims, non-writing, and a direction conflict all rate Strong | F-09, F-10: same weakness, plus duplicates |
| Evaluation misses the product | Criterion 6 | F-19 |
| Upload limit | 6 of 32, including all four counted runic images | F-21: 6 of 32, and 21 exceed 2,048 px |
| Overclaim on the Transparency page | Criterion 7 | F-08 |

Both sets of strings were chosen to break the filter, so neither is a rate.

**Defects found only by that review** include the concurrency cap failing over real sockets (F-01), retry waits escaping the deadline (F-02), warnings failing open (F-03), and citations landing in the wrong panel (F-14). They are not repeated here, and they count against criteria 3, 5, and 8.

**Ratings differ** because the scales differ. It rates the demo Partial for interface behaviour, where this audit requires real analysis. It rates documentation Strong, where this audit also requires a licence, CI, and a fresh-clone check.

**Order, now decided.** The review first said to fix its P0 list before any real inference, and later withdrew that. The owner decided that M0 comes first (ADR-062), which is the separation this audit recommended:

- **M0 runs through the Python harness and `eval_v1`.** The product's API, adapter, and verifier are not on that path, so most P0 defects cannot affect it. M0 does not need to wait for them.
- **Real inference through the product does need P0 first.** That means F-01 to F-06 at a minimum, and GC-11 below is gated on them.

The verifier work in GC-2 is cheap and worth doing early, but it is not a prerequisite for M0 either. The 13 safeguard cases stay in P0, and must be fixed and tested before real inference through the application.

## Gap questions

| | Question | Answer | Key evidence |
|---|---|---|---|
| A | Does a real open-weight model analyse images? | **No. Mock only.** A real adapter exists, but it has only met a fake `fetch` | [mock.ts](../apps/api/src/providers/mock.ts), [openaiCompatible.ts](../apps/api/src/providers/openaiCompatible.ts). Harness `--live` is refused |
| B | Can each identification be traced to visible evidence? | **No.** Evidence is free text, with no region, feature ID, or reference link | [analysis.ts](../packages/contracts/src/analysis.ts) |
| C | Are facts separated from model observations? | **Yes by structure, not fully in content.** They travel and display separately, but history can slip into the observation text | [Results.tsx](../apps/web/src/components/Results.tsx), [Safeguard tests](#safeguard-tests) |
| D | Are citations linked to genuine reviewed sources? | **Genuine, but reviewed only by a non-specialist.** All 8 URLs resolve, and 5 of 5 sampled claims matched. No expert has reviewed them, and 28 of 32 citations go to Unicode (review F-20), which is not an epigraphic authority | `verificationStatus` is `source_checked_not_expert_reviewed` in every record |
| E | Can it refuse an uncertain identification? | **Only when the model refuses, or when no evidence text survives.** Code does not overrule a model that claims a match against its own observations | [verify.ts](../apps/api/src/services/verify.ts) |
| F | Is evaluation reproducible on verified labels? | **The protocol is. No results exist.** 22 in-scope and 10 rejection images, with labels checked by a non-specialist | [METHODOLOGY.md](../experiments/m0_feasibility/METHODOLOGY.md), [manifest.csv](../experiments/m0_feasibility/dataset/manifest.csv) |
| G | Are complete inscriptions and excerpts separate? | **Yes in code, but no excerpt qualifies.** All 22 counted samples are complete, so excerpt results will be empty | [metrics.py:272](../experiments/m0_feasibility/src/metrics.py#L272), ADR-048 |
| H | Can another developer reproduce the results? | **Not yet.** The work is uncommitted, with no remote, CI, licence, or fresh-clone check, and there are no real results to reproduce | `git status`: 76 entries |
| I | Can a researcher avoid trusting the model blindly? | **Partly.** Labels, provenance, and limits are clear, but a reader cannot check a claim against the image or a reference form | See criteria 4 and 7 |
| J | Does the demo show the value in two minutes? | **No demo exists.** There are six screenshots of simulated results | [docs/screenshots/](screenshots/) |
| K | Is anything distracting from the core problem? | **Yes, mostly in planning and documents.** The running code is reasonably lean | [Scope review](#scope-review) |

## Criteria

Estimates are judgments, not measurements. A "day" of effort means 6 focused hours. The status words here are the four requested for this audit, and they sit alongside the project's status vocabulary.

### 1. Narrow problem and clear user

**Status: partial**

- **Evidence:** scope is six confusable scripts, each with a stated reason ([PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)). [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) names four user groups, from archaeologists to enthusiasts.
- **Missing:** one primary user, one situation, and evidence that this person has the problem.
- **Why it matters:** each winner opens with a person and a moment. "People who meet an unfamiliar inscription" is a category.
- **Recommended:** choose a primary user. The best fit is a **museum or archive cataloguer triaging an uncatalogued inscribed object**, because the output is a lead for a specialist and abstention is useful to them. Keep the others as secondary.
- **Effort:** 2 hours, then rewrite the overview and README opening.
- **Dependencies and risks:** user decision. Six scripts may not match what a real cataloguer sees, and only feedback can test that.

### 2. Genuine open-weight AI as a core capability

**Status: blocked** on Stages D and E, which are not authorized.

- **Evidence:** Qwen3-VL-30B and Gemma 4 31B are selected (ADR-014). The product defaults to `scriptecho-mock`, and the real adapter has never run. Licences were read from model cards only, and image input and structured output remain unproven for both ([MODEL_COMPARISON.md](MODEL_COMPARISON.md)).
- **Missing:** any model call. The harness also has no live transport or preflight script.
- **Why it matters:** this is the entry requirement and the largest risk. Today the AI in the project is a design.
- **Recommended:** run the existing Stage D preflight, then Stage E, before any new feature work.
- **Effort:** about 1 day for transport and preflight, and 1 day for the run and report. [MODEL_COMPARISON.md](MODEL_COMPARISON.md) estimates about $0.24 plus retries, which is unmeasured.
- **Dependencies and risks:** approval, funded `OPENROUTER_API_KEY` and `HF_TOKEN`, and DeepInfra and Hugging Face data policies, which have not been read. Dataset images would go to third parties. The models may simply fail, and that result would still be worth publishing.

### 3. Working end-to-end experience

**Status: partial**

- **Evidence:** upload, results, scripts, comparison, and transparency pages all work, and 36 browser tests pass at desktop and mobile sizes in Chrome.
- **Missing:** a real analysis. The crop tool is not built, although [the upload page tells users to crop](../apps/web/src/pages/InvestigatePage.tsx). Uploads over 8 MB fail, which excludes 6 of the 32 accepted images: SE021, SE024, and **all four counted runic images**. The server also binds only to `127.0.0.1` ([server.ts:40](../apps/api/src/server.ts#L40)), so deployment would need a change.
- **Why it matters:** the experience is proven only for the shape of the data, and a user would see a full result that is unrelated to their image.
- **Recommended:** resize large uploads in the browser, or raise the limit with its memory cost documented. Connect a real provider only after the go decision.
- **Effort:** 3 hours for the upload limit, 1 day for a crop tool.
- **Dependencies and risks:** depends on criterion 2. Downscaling can erase strokes, so any resize needs testing on real inscriptions.

### 4. Evidence-grounded AI outputs

**Status: partial.** The reference side is strong, and the image side is not grounded.

- **Evidence:** the schema has no field for history, sources, or URLs, and all 32 citations resolve. Reference pages show sources and leave unknown fields empty. Candidate evidence, however, is plain strings.
- **Missing:** the design in [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) that gives real grounding: `evidenceId`, controlled features, and an ownership check. Only 2 `letter_form` traits exist across the six records, so there is little to check evidence against. Brahmi has no direction claim, and Greek and Latin have no period or region claim.
- **Why it matters:** this is the widest gap against the winners. Paper Trail checks words against a source, Deis checks claims against facts, and Second Look checks quotes against a PDF. ScriptEcho has no equivalent yet.
- **Recommended:** add **evidence anchors**:
  1. A sourced vocabulary of diagnostic features for each script, with IDs.
  2. A model response that names a feature ID and an image region for each claim.
  3. Code that confirms the feature exists, belongs to that script, and has a valid region containing visible marks.
  4. A results view that highlights the region beside the sourced feature text.
- **Effort:** about 2 days, after go. Add research time for sourced features.
- **Dependencies and risks:** needs a passing Stage E, a product prompt v2, and a contract change. **Region output is unproven on either model.** A check can show that a region contains marks, but not that the model read them correctly. Feature descriptions need specialist review, and modern Unicode forms are not attested letter shapes.

### 5. Deterministic safeguards around model output

**Status: partial**

- **Evidence:** strict Zod validation, one repair retry, removal of matched statements, unsupported scripts moved aside, computed evidence strength, and no numeric confidence. Failure paths are well tested.
- **Missing:** cross-field refusal, a history filter that works beyond its patterns, and a strength rule that measures more than the number of lines. See [Safeguard tests](#safeguard-tests).
- **Why it matters:** a guard that a model can pass by accident gives false assurance, and the Transparency page describes it as stronger than it is.
- **Recommended:**
  1. Force `insufficient_evidence` when `writingPresent` is false on a `candidates` response, and when image quality is poor, as [AI_ARCHITECTURE.md:190](AI_ARCHITECTURE.md) already specifies.
  2. Extend the patterns, then accept that a blocklist is only a backstop. The real fix is structured features.
  3. Stop counting lines toward `strong`. Cap it at `moderate` until evidence anchors exist.
  4. Compare the observed direction with stored direction traits, and **downgrade only**. Early Greek and Latin were not always left to right, so this must never remove a candidate.
  5. Add these 13 cases as permanent tests.
- **Effort:** 4 to 6 hours. This is the best value item available offline.
- **Dependencies and risks:** ADR-057's rule is Proposed, so a change needs a decision. Tighter rules may withhold correct answers, which is the same trade-off Deis reports.

### 6. Reproducible model evaluation

**Status: blocked** for results. The protocol is strong.

- **Evidence:** frozen prompt, gates fixed in advance, 3 repetitions, Wilson intervals, stored raw responses, non-overwriting runs, and separate reporting by sample type and rejection class. The synthetic run works.
- **Missing:**
  - Real results.
  - **Product coverage.** The harness uses `eval_v1` and Python. The product uses `script_analysis_v1`, a different schema, and TypeScript. The verifier is therefore never evaluated. [SYSTEM_ARCHITECTURE.md:126](SYSTEM_ARCHITECTURE.md) says the harness must not use a separate code path, and it does.
  - **A baseline beyond chance.** Second Look's strongest move was reporting that a simple rule beat its model.
  - A held-out set.
  - A committed freeze. ADR-027 already says one is needed before Stage E.
- **Readiness, 2026-11-01:** scoring passed review, and the run loop did not. See [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md).
- **Why it matters:** 11/22 and 18/22 can guide a decision and nothing more. Without a baseline, a pass could reflect museum photography rather than reading.
- **Recommended:**
  1. Commit the manifest, prompt, and gates before any model runs.
  2. Add a leakage baseline: a simple pixel-statistics classifier with leave-one-out on the 22 images. If it beats chance clearly, then source, medium, or framing is a cue.
  3. Run Stage E unchanged, and publish whatever it shows.
  4. On a go, add a separate product-path experiment.
- **Effort:** baseline 3 to 4 hours, Stage E as in criterion 2, product path 1 to 1.5 days, held-out set at least 1 week.
- **Dependencies and risks:** approval, plus [known dataset limits](RISKS_AND_LIMITATIONS.md): Brahmi and Kharosthi have 2 images each, 26 of 32 rows come from the Met, and rejection rests on 2 easy negatives. The baseline must be reported as a test of the dataset, never of a model.

### 7. Transparent limitations and uncertainty

**Status: partial.** This is the project's strongest area, with two overclaims to fix.

- **Evidence:** the banner, the "no accuracy claim" statement, evidence labels, provenance, an unavailable-capabilities list, and a detailed [risk register](RISKS_AND_LIMITATIONS.md). Held and excluded rows keep their reasons.
- **Missing:**
  - The Transparency page says statements containing dates, links, or citations are removed. Six realistic examples passed through.
  - Every result reports `scriptIdentification: "available"`, including in demo mode ([analysis.ts:112](../apps/api/src/services/analysis.ts#L112)). It is built, but it is not shown to work.
  - All stated limits are predicted. None is measured.
- **Why it matters:** the winners earn trust with measured failures, such as Paper Trail's 5 wrong tips of 39. ScriptEcho's honesty is real, but it has no results behind it yet.
- **Recommended:** fix both statements now. After Stage E, publish a failure gallery with the confusion matrix.
- **Effort:** 1 hour now, 3 hours after Stage E.
- **Dependencies and risks:** none for the wording. Check rights for each image in the gallery, and exclude SE008.

### 8. Privacy and offline operation

**Status: partial**

- **Evidence:** uploads stay in memory, metadata is stripped, nothing is stored, sensitive log fields are dropped, and real inference needs two settings. Demo mode sends nothing out, but it also runs no model.
- **Missing:** a local inference path. No Ollama, llama.cpp, or LM Studio is installed. Any real use today sends images to a third party. `ALLOW_EXTERNAL_INFERENCE` is also required for a local endpoint, which misdescribes it. Provider data policies are unread.
- **Why it matters:** Deis and Second Look both make privacy a reason to use open models. For unpublished finds, location and imagery can be sensitive, so a cataloguer has a real need.
- **Recommended:** document a local route through the existing OpenAI-compatible adapter. Separate "local endpoint" from "external endpoint" in configuration, and add an egress check like the one in Deis.
- **Effort:** 1 to 2 days, including testing.
- **Dependencies and risks:** model download needs approval, and this machine is an **Apple M1 with 8 GB of memory**, so neither selected 30B-class model is a realistic local candidate. A smaller model would need its own evaluation, and vision support and quality are unknown.

### 9. Real user feedback or domain-expert review

**Status: missing**

- **Evidence:** the repository records none. The docs state that no epigrapher has reviewed labels or records, and that review is not arranged.
- **Missing:** any outside reaction to the labels, records, wording, or usefulness.
- **Why it matters:** Deis changed direction because its first real user was not its assumed user. Here, an expert review is also the only way to raise `verificationStatus`. Self-review by a non-specialist has limited value in this field.
- **Recommended:** two small requests. Ask one epigrapher or graduate student to review the six records and the Brahmi and Kharosthi labels. Ask one or two museum or archive staff to try a recorded demo and describe what they would do next. Publish the responses, including criticism.
- **Effort:** about 4 hours of work, over 2 to 3 weeks elapsed.
- **Dependencies and risks:** you would need to make contact, because this cannot be done from the repository. Credit reviewers only with their permission. The Met could also settle the casket accession conflict.

### 10. Compelling and reproducible demo

**Status: missing**

- **Evidence:** six screenshots of simulated output. No recording, script, or hosted page exists.
- **Missing:** a demo that shows real analysis. In the current mode, the result is chosen by the image's bytes, so showing it as a product demonstration would mislead. See [Demo mode on real images](#demo-mode-on-real-images).
- **Why it matters:** the distinctive value is restraint: a tool that says "I can't tell" and shows why. That can only be demonstrated with real model output.
- **Recommended:** add a **replay mode**, labelled as recorded real responses, and a 90-second video:
  1. A cataloguer holds an uncatalogued inscribed object, 10 seconds.
  2. The problem in one line: a chatbot gives a confident answer that cannot be checked, 10 seconds.
  3. A clear case, with evidence for and against, 20 seconds.
  4. The Brahmi or Kharosthi confusion, with a comparison, 25 seconds.
  5. A refusal on a cuneiform or no-writing image, 15 seconds.
  6. The measured result, including a failure, 10 seconds.
- **Effort:** 1 to 1.5 days after Stage E. Static hosting of replay data could follow.
- **Dependencies and risks:** needs Stage E and approval to publish. Use only redistributable images, and credit each one. **If the model fails, the honest demo is the failure and the guided fallback.** Never record demo mode as if it were analysis.

### 11. Strong technical documentation

**Status: partial**

- **Evidence:** 19 documents, 59 ADRs, API, setup, testing, and provider guides, a README, status vocabulary, and a changelog. The handover reports 160 relative links with none broken.
- **Missing:** `LICENSE`, CI, a fresh-clone check, a results report, and a narrative write-up. Some designs in [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) and [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) are unbuilt, so a reader must separate them from what exists. `.nvmrc` says 22, while nvm on this machine has no version 22. The earlier setting of 20 selected an x86_64 Node under Rosetta, which failed against the arm64 install.
- **Why it matters:** the docs are thorough but written for maintainers. Writing quality is DEV's top criterion, and a licence is a basic requirement for open source.
- **Recommended:** add a licence and CI, run a fresh-clone test, and add a one-page "Start here". Write the public post after Stage E.
- **Effort:** 4 hours for licence, CI, and clone test. 1 day for the post.
- **Dependencies and risks:** the licence is your decision. CI needs a remote and publishing approval. A fresh install needs registry approval. Decide whether the 5.9 MB of screenshots belong in Git.

### 12. Why open-source AI matters here

**Status: missing**

- **Evidence:** the docs name the open-weight models, and their model cards list Apache 2.0. No document explains why that matters for this application.
- **Missing:** the argument. Hosted calls to open models also lose part of it, because the privacy and control benefits are not automatic.
- **Why it matters:** the contest prompts ask for this directly, and it is how each winner justifies its design.
- **Recommended:** a short section on four points, each stated only as far as it is true:
  - **Inspection and repeatability:** pinned weights allow a result to be rerun, which matters for scholarship.
  - **Sensitive finds:** local inference can keep unpublished material private. This holds only once a local path exists.
  - **Access:** small institutions cannot rely on per-image paid APIs. Measure the real cost first.
  - **Longevity:** an open model cannot be withdrawn from a research tool, as Deis found when a host failed.
- **Effort:** 2 hours for a draft, 1 hour to update it with measured facts.
- **Dependencies and risks:** none for the draft. Do not claim that open models are better at this task. That is unmeasured, and Paper Trail's author openly concedes the trade-off.

## Test records

### Safeguard tests

Hand-written model output run through the real schema and `verifyAnalysis`. No model was involved. These are checks on code behaviour, and the script was not added to the repository.

| Input | Result | Expected | Correct? |
|---|---|---|---|
| "Mauryan-era letters from the reign of Ashoka" | Kept | Removed | **No** |
| "Carved around 250 B.C. in Magadha" | Kept | Removed | **No** |
| "c. 3rd cent. BCE lettering" | Kept | Removed | **No** |
| "As Lüders 1963 shows, this is Bharhut" | Kept | Removed | **No** |
| "Typical of the Ptolemaic dynasty" | Kept | Removed | **No** |
| "Dated to the Han period, see Hultzsch p. 12" | Kept | Removed | **No** |
| Control: "Cut in 250 BCE" | Removed, became `insufficient_evidence` | Removed | Yes |
| Three bare claims, such as "it looks like Brahmi" | **Strong**, no expert prompt | Not strong | **No** |
| `candidates` with `writingPresent: false`, 3 lines | **Strong**, no expert prompt | Refused | **No** |
| `candidates` on a poor image | Weak, expert prompt, still `candidates` | `insufficient_evidence` by [the design](AI_ARCHITECTURE.md) | **No** |
| Direction `unclear`, 3 lines | **Strong**, no expert prompt | Not strong | **No** |
| Latin with observed direction right to left | **Strong**, no expert prompt | Downgraded | **No** |
| Spanish text naming Ashoka and a century, 3 lines | **Strong**, no expert prompt | Removed or not strong | **No** |

**12 of 13 behaved wrongly.** Where the UI shows no expert prompt, it also shows no "treat this as a lead" warning.

### Demo mode on real images

Real dataset images uploaded to the running mock API, with `demoScenario` left on automatic.

| Image | True class | Mock result |
|---|---|---|
| SE001 | Brahmi | `no_writing` |
| SE006 | Kharosthi | `insufficient_evidence` |
| SE016 | Greek | `out_of_scope` |
| SE031 | Cuneiform | Brahmi, Kharosthi, Phoenician candidates |
| SE035 | Egyptian hieroglyphs | **Greek, strong, no expert prompt** |
| SE039 | No writing | Brahmi, Kharosthi, Phoenician candidates |
| SE040 | No writing | Brahmi, Kharosthi, Phoenician candidates |
| SE021 | Latin | `file_too_large` |

This behaviour is documented, and every result carried `simulated: true`. **It is not an accuracy result.** It shows only why a screenshot of demo mode must never stand in for a product demonstration.

### Citation sample

Five Kharosthi claims citing Unicode 16 Chapter 14 were compared with the live text: period, region, direction, structure, and origin. All 5 matched. Section 14.2 exists, while the finer locator "14.2.1" was not confirmed. The other 27 claims were not re-read, and URLs resolving does not show that a claim is correct.

## Scope review

No removal is recommended now. The main need is to stop adding things.

| Item | Assessment | Recommendation |
|---|---|---|
| Rate limit, concurrency cap, request IDs, typed errors | Small and working, and needed before any deployment | Keep |
| Comparison service | Central to the hard pairs, but has little to compare with so few traits | Keep, and enrich through evidence anchors |
| Token and cost accounting | Small, and useful for the "access" argument | Keep |
| Two model gateways | Fine for the experiment. In the product, a second gateway adds nothing until one works | Keep for M0, defer for the product |
| Two-stage Observe and Hypothesize (ADR-002) | Doubles calls, with no evidence yet | Defer, as ADR-054 does |
| Python harness and TypeScript product schemas | Two definitions of the same output | Keep the frozen harness. Join them only through the product-path experiment |
| Render deployment, BM25, embeddings, transcription, Bengali track | Planning material that dilutes the story | Mark as out of scope until after a go decision |
| 19 documents and 59 ADRs | Valuable as a record, heavy for a first reader | Keep, and add one "Start here" page |
| Empty `apps/web/public/`, `apps/api/src/routes/` | Harmless leftovers | Remove when convenient |

## Gap-closure roadmap

All items are **Proposed**. "Needs" states what must be approved. Effort totals are estimates.

### Phase 0: Protect the work and decide direction

| ID | Action | Closes | Effort | Needs |
|---|---|---|---|---|
| GC-0 | Review and commit the accumulated work, as the freeze baseline | H, 6 | Done | Committed locally. Nothing is backed up by a push |
| GC-1 | Choose the primary user | 1 | 2 hours | Your decision |

### Phase 1: Test the riskiest assumption first

| ID | Action | Closes | Effort | Needs |
|---|---|---|---|---|
| GC-2 | Harden the verifier, fix the two overclaims, and add the 13 cases as tests. Covers review P0 items 6, 9, and 12 | E, 5, 7 | Mostly done | **Implemented and Verified offline** (ADR-065), never on real output. The `scriptIdentification` overclaim (F-23) remains |
| GC-3 | Add the leakage baseline, and record it before any model runs | 6 | 3 to 4 hours | Approval. Local only |
| GC-4 | Apply Q-10 | F | Done | **Implemented and Verified offline** (ADR-064). SE003 and SE004 accepted, SE010 held |
| GC-4a | Harness fixes H-01 to H-06, H-08, and H-10, with tests. Added by the M0 readiness review | A, 6 | Done | **Implemented and Verified offline**, 2026-11-01. Never run against a provider |
| GC-5 | Freeze commit, then Stage D preflight on generated canary images only, per the M0 specification | A, 2 | 1 day | **Blocked:** commit and Stage D approval, keys, spending limit, and the DeepInfra question |
| GC-6 | Stage E: the full run and report, published as measured | A, F, 2, 6 | 1 day | **Blocked:** separate approval, including sending 32 images to third parties |
| GC-7 | Go or no-go against the [approved gates](MODEL_EVALUATION.md) | All | 2 hours | Your decision |

Do not change the gates or `prompts/eval_v1.md` once results exist.

### Phase 2 on a go: Make the output checkable

| ID | Action | Closes | Effort | Needs |
|---|---|---|---|---|
| GC-8 | Test whether the model can return usable image regions | B | 3 hours, plus cents | Separate approval. A new experiment |
| GC-9 | Evidence anchors: sourced features, contract v2, code checks, highlighted regions | B, I, 4 | About 2 days, plus sourcing | Approval. Depends on GC-8 for regions, and features can ship without them |
| GC-10 | Product-path experiment, with a fix for the 8 MB limit | F, 3, 6 | 1.5 days | Separate approval. New documented experiment |
| GC-11 | Complete the review's remaining P0 list, then connect a real provider to the app and record responses for replay | A, 3 | About 2 days for P0, plus 3 hours | Approval. Must follow P0 |

### Phase 3: Prove and present it

| ID | Action | Closes | Effort | Needs |
|---|---|---|---|---|
| GC-12 | Replay mode and 90-second demo | J, 10 | 1 to 1.5 days | Approval to publish. Redistributable images only |
| GC-13 | Expert and user review | D, 9 | 4 hours over 2 to 3 weeks | Your outreach |
| GC-14 | Local inference route and egress check | 8, 12 | 1 to 2 days | Download approval. 8 GB memory limit |
| GC-15 | Licence, CI, fresh-clone test, "Start here" page | H, 11 | 4 hours | Licence choice, remote, registry approval |
| GC-16 | "Why open AI" section and public write-up | 12, 11 | 1 day | Approval to publish |
| GC-17 | Held-out set, for any accuracy claim | F, 6 | At least 1 week | Image approval. Needed before any general claim |

### On a no-go

Do not adjust the dataset or criteria. Publish the result, then either try the options in the [roadmap](IMPLEMENTATION_ROADMAP.md) as new documented experiments or move to the guided fallback, where the user answers visual questions and the collection does the matching. The reference collection, interface, and safeguards all carry over. An honest negative result would still be a strong portfolio piece.

### Timing

At the roadmap's 3 focused hours a day, Phases 0 and 1 take about 11 days if decisions come quickly. Phases 2 and 3 take about 3 to 4 further weeks, excluding the held-out set. **The unapproved November 15 target (Q-5) is therefore realistic for an M0 result, not for all of this.** These are estimates.

## Decisions needed

These combine with the five decisions in the [post-MVP review](POST_MVP_ARCHITECTURE_REVIEW.md#decisions-required). Items 1, 4, and 6 overlap with its Decisions 3, 5, and 4.

1. Closed: M0 runs before the product P0 list (ADR-062).
2. Say whether to commit the accumulated work (GC-0).
3. Choose the primary user (GC-1).
4. Approve GC-2 and GC-3, which are offline and spend nothing.
5. Closed: Q-10 applied (ADR-064).
6. Separately decide Stage D, with keys and a spending limit. Stage E needs its own approval. Both are specified in [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md).
