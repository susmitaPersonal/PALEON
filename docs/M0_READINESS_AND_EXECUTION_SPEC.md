# M0 Readiness Review and Execution Specification

> **Version:** 1.4 | **Date:** 2026-11-02 | **Status:** The review is observed. The 8 harness fixes required before Stage D are Implemented and Verified offline, and Q-10 is applied (ADR-064). The rest of the specification is **Proposed**. Stage D and Stage E are **not authorized**, and nothing here starts them.

Related: [METHODOLOGY.md](../experiments/m0_feasibility/METHODOLOGY.md), [MODEL_EVALUATION.md](MODEL_EVALUATION.md), [MODEL_COMPARISON.md](MODEL_COMPARISON.md), [DECISIONS.md](DECISIONS.md), [SESSION_HANDOVER.md](SESSION_HANDOVER.md)

## Summary

**The scoring is sound, and the run loop is not ready to spend money.** Prompt, labels, row selection, preprocessing, and metric calculations all passed. The gaps are in everything around a live call: no live path exists, nothing limits spending, a fatal error does not stop the run, and some malformed replies crash it.

| Question | Answer |
|---|---|
| Can M0 run today? | **No.** `--live` is refused, and the steps under [Required before Stage D](#required-before-stage-d) remain |
| Are results from the offline path trustworthy? | Yes for metric logic. 404 tests pass, and hand-built cases on the real denominators gave the expected counts |
| What blocks Stage D? | Stage D approval, keys, and a budget. See [Phase 4](#phase-4-stage-d-preparation) |
| Largest model risk | Model B may see each image at roughly 800 × 800 px, not 2,048 px (H-12) |
| Planned usage cost | About $0.26 for 204 calls, by estimate |
| Maximum usage cost | **$2.00 stop limit.** The calculated ceiling is $1.39 at today's list prices |
| Do images leave the machine? | **Stage D: no historical image. Stage E: yes, all 34** |
| Is a product verifier change needed? | **No.** The harness and product share no code |

## Evidence labels

| Label | Meaning |
|---|---|
| **Observed** | Run or measured on this machine on 2026-11-01, with no network call to a provider |
| **Read** | Established by reading the code |
| **Published** | Read on a public page on 2026-11-01. It shows what a vendor states, not what an endpoint does |
| **Unverified** | Only a real call can settle it |

**What was not done.** No model call, no provider API call, and no key was used. OpenRouter's `/models` catalog endpoint was deliberately not called, because this project defines a catalog check as part of preflight. No image was opened in this session or sent anywhere. All image figures come from local byte and metadata measurements. Probes lived in the session scratchpad, and no harness, prompt, dataset, or result file changed: a hash over `config/`, `prompts/`, `dataset/`, `data/images/`, `data/processed/`, and `results/` matched before and after.

# Phase 1: Offline integrity review

## Checks run

| Check | Result |
|---|---|
| `pytest -q` | **322 passed** |
| `--check` | Exit 0, `dataset_problems: []`, `images_verified_on_disk: true` |
| `--synthetic`, written to the scratchpad | Exit 0. Metrics match existing run `s03`, apart from latency |
| `--live` | Exit 2, refused |
| Original image hashes against `sha256sums.txt` | 0 mismatches |
| All 32 counted images through `LocalImageSource`, twice | 32 loaded, 32 byte-identical across both passes |
| `script_label` against commit `5e5941d` | 0 changes in any row |
| Harness imports from `apps/`, `packages/`, or `knowledge/` | None |

## The 15 required items

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Frozen prompt and SHA-256 | **Pass** | File `67085eb828b94a407b0693c20ccdc5f47919fc7e5e817dae157a5d232c6db111` is unchanged from the commit. Harness hash `7240f44be2fd870fd2e596d5d317b10ca8ba18e4f8a408f2cac4da760775b902` covers the parsed parts and matches `run.yaml`. The output schema and repair note sit outside it (H-08) |
| 2 | Manifest and verified labels | **Pass** | 43 rows. All 32 counted rows have a verified label status and evidence URL. 248 changes are recorded in `manifest_changes.csv`, none to a label. No epigrapher has reviewed them |
| 3 | Image preprocessing | **Pass** | One path, hash-checked input, deterministic output. 21 of 32 are downscaled, by up to 4.3 times for runic. Output has no EXIF. See [Preprocessing](#image-preprocessing) |
| 4 | Accepted, held, excluded | **Pass** | `eligible_for_metrics` needs `split=dev`, a verified label, and `accepted`. The 11 other rows cannot reach the metrics, and `gold_items` and the run loop use the same filter |
| 5 | Complete versus excerpt | **Pass** | 22 of 22 in-scope rows are complete. 0 excerpts count. SE002, SE003, SE004, and SE010 are held excerpts. The excerpt subgroup will be empty, and it reports n/a |
| 6 | Script and rejection labels | **Pass** | Six supported scripts. Rejection: 4 cuneiform, 4 Egyptian hieroglyphs, 2 no writing. Any abstention counts as rejection (ADR-024), and the exact reason is reported separately |
| 7 | Top-1 and top-3 | **Pass** | A perfect model scored 22/22, and always answering Latin scored 5/22. Constant strategies fail the gates. The chance figures are understated (H-14) |
| 8 | Reproducibility | **Pass** | Needs 3 identical valid labels, and a failure cannot agree. Identical requests may make this easier to pass (H-13) |
| 9 | Invalid output | **Partial** | Fences and prose are invalid, and repair is limited. Some malformed replies crash the run (H-06) |
| 10 | Retry accounting | **Pass** | An exhaustive test of 4,096 response sequences never exceeded 3 attempts per repetition. Each attempt has a kind and a record. Repair remains a re-roll (F-07) |
| 11 | Timeout handling | **Gap** | A 90-second attempt limit exists only as a default passed to a transport that does not exist. `httpx` timeouts would crash the run. There is no overall limit (H-03, H-08) |
| 12 | Failure accounting | **Partial** | Model errors and provider failures are kept apart. Fatal failures do not stop the run (H-02), and one sequence hides model failures from a gate (H-09) |
| 13 | Tokens and cost | **Partial** | Unknown usage stays unknown, and cost is labelled as an estimate. Nothing limits spending, and failed attempts report no usage (H-01) |
| 14 | Raw response preservation | **Partial** | Every attempt is stored, and finished runs cannot be overwritten. One crash loses a body (H-06). Exact bytes sent are not recorded (H-08) |
| 15 | Synthetic and real separation | **Pass on the synthetic side** | Fixtures, a banner, `data_origin`, a separate output folder, and refused live mode. The real side does not exist yet (H-03, H-11) |

## Findings

"Fix by" names the last point at which the fix is needed. All are offline work, need approval, and change no label, prompt, gate, or historical result.

| ID | Finding | Evidence | Severity | Fix by |
|---|---|---|---|---|
| H-01 | **No spending or request guard.** Nothing counts money or limits attempts across a run. An outage produced 192 calls, and all-invalid output would also produce 192 | Observed | High | Stage D |
| H-02 | **Fatal errors do not stop the run.** With 402, 401, or 400 on every call, the loop made all 96 calls. A rejected schema or empty balance would fill the whole run with failures | Observed | High | Stage D |
| H-03 | **The live path does not exist.** There is no transport, preflight script, or live mode, and `run_model` is hard-wired to fixtures. `httpx` 0.27.0 exceptions are not `TimeoutError` or `ConnectionError`, so the adapter does not catch them: a read timeout crashed the probe run | Observed | High | Stage D |
| H-04 | **The OpenRouter route is not pinned.** `models.yaml` sets no `order` or `allow_fallbacks: false`, so repetitions of one image could land on different hosts. Model B is pinned to DeepInfra | Read | High | Stage D |
| H-05 | **`Retry-After` is uncapped.** A value of 86,400 requested a 24-hour sleep. `inf` and `-5` crashed the run. This is the harness's version of product finding F-02 | Observed | Medium | Stage D |
| H-06 | **Malformed replies can crash the run.** `choices: [null]`, a string `message`, and a list `usage` raised `AttributeError`. A lone Unicode surrogate crashed the raw write, which loses that body. There is no resume | Observed | Medium | Stage D |
| H-07 | **Images load during the run.** A bad image stopped a probe run after 3 calls had been made | Observed | Medium | Stage E |
| H-08 | **Frozen inputs are incomplete.** `max_output_tokens` (1,500) and `timeout_s` (90) are code defaults, and `models.yaml` cannot set them, so they are outside the config hash. The schema and repair note are outside the prompt hash. Exact bytes sent and library versions are not recorded. A clean freeze commit would cover the code, but all work is uncommitted | Read | Medium | Stage D |
| H-09 | **One sequence hides model failures.** If invalid output is followed by a provider failure on repair, the repetition counts as lost to the provider and leaves the valid-output denominator. With this everywhere, the probe had 96 malformed attempts, `n = 0`, and 0 lost to the model. Also, 1 valid reply out of 96 repetitions passes that gate at 1/1. The overall result still failed, because the other gates require real answers | Observed | Medium | Stage E |
| H-10 | **Records omit fields the run needs.** `finish_reason`, the responding model, the host, and cached tokens stay only in raw bodies. They are needed to spot truncation, routing changes, and caching | Observed | Medium | Stage D |
| H-11 | **Partial runs have no report path.** Metrics are computed only at the end, and no code rebuilds them from `attempts.jsonl`. `results/live/` is not gitignored, so writing there would mark the tree dirty partway through a session | Observed | Medium | Stage E |
| H-12 | **Model B's image detail may be very low.** The published default is 280 visual tokens. With 16 px patches and pooling of 3, each token covers 48 × 48 px, so 280 tokens is about 645,000 pixels, or roughly 800 × 800 px. The maximum, 1,120, is roughly 1,600 × 1,600 px. No request parameter for this is documented for this route. Runic images already shrink 4 times locally, so the total could be about 11 times | Arithmetic on Published values. Host behaviour Unverified | Medium | Stage D decision |
| H-13 | **Identical requests may inflate reproducibility.** All 3 repetitions send the same body and seed at temperature 0. A provider cache could return the same answer, which would say nothing about stability | Read. Effect Unverified | Medium | Stage D check |
| H-14 | **Chance figures are understated.** The harness uses 1/6 and 1/2, but classes are unequal. Always answering Latin gets 5/22, or 22.7%. A fixed list of Latin, Greek, and Phoenician gets 14/22 top-3, or 63.6%, not 50% | Observed | Low | Report |
| H-15 | **Report text is out of date.** `report.py` says per-script figures rest on "about five images each". Counted rows have 2 to 5. It also describes excerpts, and none count | Read | Low | Stage E |
| H-16 | **Two limits may not suit real output.** The schema has `$defs`, `$ref`, `minLength`, and `maxItems`, which a strict mode may refuse. A reply at the schema's maximum is 25,557 characters, which may exceed the 1,500-token limit, so a long reply would be truncated and counted invalid | Sizes Observed. Provider response Unverified | Medium | Stage D check |

## Fix status

The Findings table above records the state at review. The owner approved the 8 fixes required before Stage D on 2026-11-01. **None has met a real provider.** All are checked with fake and mock transports only.

| ID | Status | What changed |
|---|---|---|
| H-01 | Verified offline | `src/guard.py` stops before an attempt on the attempt, time, or spending limit, with limits holding across runs. Attempts with no usage count at the ceiling |
| H-02 | Verified offline | `auth`, `credit_exhausted`, or `bad_request` makes 1 call, then stops. 5 provider failures in a row also stop the run. Records are kept, and `stopped.json` gives the reason |
| H-03 | Verified offline | `live/transport.py` and `live/preflight.py` sit outside `src/`, so the test banning network clients from `src/` still holds. `run_model` accepts an injected adapter and image source. **`--live` stays refused.** Only `live/stage_d.py` starts preflight (ADR-067) |
| H-04 | Verified offline for the rule | `allow_fallbacks: false` is set. `order` stays empty until Stage D names a host, so `--check` prints `live_blockers: ["qwen3_vl_30b: no pinned host"]` |
| H-05 | Verified offline | A wait above 30 s counts as a failure with no retry. Unusable values use the 2 s default |
| H-06 | Verified offline | Malformed envelopes become recorded failures, malformed usage stays unknown, and any reply can be stored unchanged |
| H-08 | Verified offline | Limits moved into `run.yaml`. Each attempt records the SHA-256 of the bytes sent. Each run records library versions and a hash of the schema and repair note |
| H-10 | Verified offline | Each attempt records `finish_reason`, responding model, host, cached tokens, and reasoning tokens |

**Verification.** 384 pytest tests pass: the original 322, unchanged, plus 62 new ones. Deliberately breaking each of 24 safety behaviours in a scratch copy made the tests fail. One break was missed at first, because a test was too weak, and it was strengthened. Synthetic metrics match run `s03`, apart from latency, and all 32 sent-image hashes are unchanged.

**Not fixed, and not approved:** H-07, H-09, H-11, and H-15, which are due before Stage E. H-12, H-13, and H-16 can only be settled at Stage D. H-14 is a reporting matter. Until H-11 is done, a stopped run keeps its records but produces no metrics, and `results/live/` is not gitignored.

**What held up well:** the strict-majority logic, gate rounding, Wilson intervals, hash checks, the rule that a crop never falls back to its original, and the refusal to overwrite a run.

# Phase 2: Execution specification

**All of this is Proposed.** Values marked "set at Stage D" cannot be fixed offline, and approving Stage D approves finding them, nothing more.

## Models

ADR-014 stands: two models through two gateways. **Model A is the primary model. Model B is conditional**, because two of its open questions could make its result uninformative.

| | Model A (primary) | Model B (conditional) |
|---|---|---|
| Model | Qwen3-VL-30B-A3B-Instruct | Gemma 4 31B |
| Hub repository | `Qwen/Qwen3-VL-30B-A3B-Instruct` | `google/gemma-4-31B-it` |
| Hub revision | `9c4b90e1e4ba969fd3b5378b57d966d725f1b86c`, modified 2025-11-26 | `842da3794eaa0b77d5f08bae87a17459d91ff475`, modified 2026-07-20 |
| Request model ID | `qwen/qwen3-vl-30b-a3b-instruct` | `google/gemma-4-31B-it:deepinfra` |
| Gateway | OpenRouter | Hugging Face Inference Providers |
| Endpoint | `https://openrouter.ai/api/v1/chat/completions` | `https://router.huggingface.co/v1/chat/completions` |
| Inference host | **Set at Stage D** from the live catalog, then pinned | DeepInfra |
| Credential | `OPENROUTER_API_KEY`, not provided | `HF_TOKEN`, not provided |
| List price per million tokens | $0.15 input, $0.60 output | $0.20 input, $0.40 output |
| Context | 262,144 tokens | 262,144 tokens |

**A hosted version cannot be proven exact.** The revision identifies the published repository, not the weights a host has loaded. DeepInfra lists `fp8` quantization for Model B, and Model A's host and quantization are unknown. Each run will record the responding model and host from every reply.

## Licence and availability evidence

| Evidence | Model A | Model B | Label |
|---|---|---|---|
| Licence | `apache-2.0` tag on the card and Hub record. **No `LICENSE` file is in the repository** | `apache-2.0` tag, and Google's Gemma 4 model card and announcement state Apache 2.0. No `LICENSE` file is in the repository; the card links to Google's page | Published |
| Weights open | Public, not gated | Public, not gated | Published |
| Listed on the route | OpenRouter model page exists. Its public pages name **no host** | DeepInfra page exists, with vision and "JSON" listed | Published |
| Price | $0.15 and $0.60 on OpenRouter's comparison page. Third-party trackers disagree, at $0.13 and $0.52 | $0.20 and $0.40 on DeepInfra's page. A tracker dated August lists $0.27 and $0.76 | Published |
| Image input works on this endpoint | **Not proven** | **Not proven** | Unverified |
| Structured output with an image | **Not proven** | **Not proven** | Unverified |
| Seed honoured | Listed, not proven | Unknown | Unverified |
| Affordable | Planned at about $0.12, under the stop limit | Planned at about $0.13. **The minimum credit purchase was not found** | Estimate |

Sources: [Qwen card](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct), [Gemma card](https://huggingface.co/google/gemma-4-31B-it), [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4), [Gemma Apache terms](https://ai.google.dev/gemma/apache_2), [OpenRouter model page](https://openrouter.ai/qwen/qwen3-vl-30b-a3b-instruct), [OpenRouter comparison](https://openrouter.ai/compare/qwen/qwen3-vl-30b-a3b-instruct), [DeepInfra model page](https://deepinfra.com/google/gemma-4-31B-it).

## Why these models, and how far that goes

**No evidence shows that either model can read these scripts.** Nothing found tests them on Brahmi, Kharosthi, Phoenician, or runic inscriptions. M0 exists to find out. The reasons below justify running the test, not expecting a pass.

**Model A is the stronger candidate for inscriptions:**

- **Detail survives.** With 16 px patches merged by 2, each token covers 32 × 32 px, and the published limit is about 16.8 million pixels. A 2,048 × 2,048 image fits at about 4,096 visual tokens, if the host keeps these defaults.
- **The vendor claims relevant skills.** The card says OCR is "robust in low light, blur, and tilt" and "better with rare/ancient characters and jargon". This is a vendor claim. It names no script, shows no number, and may mean something different from carved stone.
- **It is the model the brief named,** with open weights and a low price.

**Model B is an independent check:** a different family, gateway, and host. Its card says to "use higher budgets for tasks like OCR, document parsing, or reading small text", but the default is 280 tokens (H-12). It may therefore be a poor fit for stroke-level detail through this route. If it fails only because of image detail, that says little about its ability, so the report must state the budget used.

**Both share the main limits:** weak stroke visibility on worn stone, possible recognition of famous public objects, and cues from photography style.

## Does image data leave this machine?

| Stage | What leaves | Destination |
|---|---|---|
| Stage D | **No historical image.** Only 3 generated canaries, the prompt, and the schema | OpenRouter and its pinned host; Hugging Face and DeepInfra |
| Stage E | **Yes.** All 34 counted images, as base64 JPEG, with EXIF removed and no filename | The same |
| Offline work | Nothing | None |

**ADR-060 does not cover this.** It covers this model session only. Stage E needs its own approval to send images to third parties. All 34 are public museum or public-domain images, 30 with free redistribution and 4 CC BY 4.0. SE008 is held, and it is never sent.

| Party | What it publishes | Open issue |
|---|---|---|
| OpenRouter | `data_collection: "deny"` uses "only providers which do not collect user data". It also says its data tags are not a definitive source, and some providers may log prompts. `zdr: true` restricts routing to zero-retention endpoints | **Model A's host is unknown, so its policy cannot be read yet** |
| Hugging Face | "We do not store the request body or response when routing requests". Logs are kept up to 30 days, with no user data or tokens | None found |
| DeepInfra | Inputs are not stored on disk, and outputs are deleted after return. Only metadata is logged. "We do not use data you submit to our APIs for training models, except when using Google or Anthropic models, where the receiving company's training policy applies" | **Gemma is a Google model hosted by DeepInfra, and the page does not say whether the exception applies. Ask DeepInfra before sending images** |

Sources: [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection), [OpenRouter on zero retention](https://openrouter.ai/blog/insights/zero-data-retention/), [Hugging Face security](https://huggingface.co/docs/inference-providers/security), [DeepInfra data privacy](https://docs.deepinfra.com/account/data-privacy), [DeepInfra privacy policy](https://deepinfra.com/privacy).

These are vendor statements. Nothing here independently verifies them.

## Exact dataset rows

**34 rows: 24 in-scope and 10 rejection, all `sample_type=complete`.** Rows are sent in manifest order. `Sent hash` is the first 16 hex characters of the SHA-256 of the exact JPEG bytes, measured with Pillow 10.4.0. Any difference at run time stops the run before the first call.

| Row | Gold label | Class | Label basis | Crop | Sent size | KB | Sent hash |
|---|---|---|---|---|---|---|---|
| SE001 | brahmi | in scope | institution | yes | 620 × 230 | 33 | `c660326d071be567` |
| SE003 | brahmi | in scope | publication | yes, cleared | 2048 × 1332 | 1576 | `8c912ff631f4e567` |
| SE004 | brahmi | in scope | publication | yes, cleared | 2048 × 1184 | 903 | `ef9ec03c407da2e6` |
| SE005 | brahmi | in scope | publication | yes | 835 × 570 | 288 | `ae5022f4e21d63d9` |
| SE006 | kharosthi | in scope | institution | no | 1893 × 1892 | 381 | `0bcb629724af0951` |
| SE007 | kharosthi | in scope | publication | no | 2047 × 2048 | 461 | `c7c289ec7f8d377d` |
| SE011 | phoenician | in scope | institution | no | 1535 × 2048 | 663 | `fce6063e2ac70c8b` |
| SE012 | phoenician | in scope | institution | no | 2048 × 2031 | 986 | `8863e66c131ffa41` |
| SE013 | phoenician | in scope | institution | no | 2048 × 2048 | 544 | `3982d2395299ab20` |
| SE014 | phoenician | in scope | institution | no | 2048 × 1399 | 501 | `6b6e933a8b2d653e` |
| SE015 | phoenician | in scope | institution | no | 2047 × 2048 | 622 | `bdf2401833ca82dc` |
| SE016 | greek | in scope | institution | no | 680 × 549 | 189 | `14a5f36d5987072c` |
| SE017 | greek | in scope | institution | no | 2048 × 2048 | 466 | `277b5be0f22e5185` |
| SE018 | greek | in scope | publication | no | 650 × 604 | 87 | `148183bf2fe148a9` |
| SE020 | greek | in scope | publication | no | 1458 × 1861 | 419 | `043d361cc5f62ffe` |
| SE021 | latin | in scope | institution | no | 2048 × 1366 | 748 | `e3a1262249f1fe2f` |
| SE022 | latin | in scope | institution | no | 2048 × 1600 | 791 | `6a290eb31d92da70` |
| SE023 | latin | in scope | publication | no | 1536 × 2048 | 430 | `6380f5e27659c379` |
| SE024 | latin | in scope | publication | no | 2048 × 1366 | 765 | `60430bd1a9d3ea43` |
| SE025 | latin | in scope | publication | no | 2048 × 1628 | 750 | `33f4a9276d26da0a` |
| SE026 | runic | in scope | institution | no | 1638 × 2048 | 565 | `038cc357164e9333` |
| SE027 | runic | in scope | institution | no | 2048 × 1639 | 1110 | `2dfcf722433a4175` |
| SE029 | runic | in scope | institution | no | 1638 × 2048 | 807 | `a8f7469a9cba236b` |
| SE030 | runic | in scope | institution | no | 1638 × 2048 | 939 | `45d368df44e114b5` |
| SE031 | cuneiform | out of scope | institution | no | 484 × 800 | 99 | `b972788ba3ae8e2b` |
| SE032 | cuneiform | out of scope | institution | no | 2048 × 2048 | 853 | `4ad28e84e93d9850` |
| SE033 | cuneiform | out of scope | institution | no | 800 × 890 | 120 | `3b09a78523ac1d05` |
| SE034 | cuneiform | out of scope | institution | no | 601 × 800 | 92 | `834383c0dedbac5d` |
| SE035 | egyptian_hieroglyphs | out of scope | institution | no | 1072 × 2048 | 974 | `51a4ffc60204ede0` |
| SE036 | egyptian_hieroglyphs | out of scope | institution | no | 1444 × 1836 | 357 | `ba85173d64010e43` |
| SE037 | egyptian_hieroglyphs | out of scope | institution | no | 1366 × 2048 | 511 | `8e217816c5d1c5fe` |
| SE038 | egyptian_hieroglyphs | out of scope | institution | no | 1366 × 2048 | 663 | `c2faf048118cea6f` |
| SE039 | no_writing | no writing | institution | no | 1274 × 1724 | 131 | `a6a58910ca07c51d` |
| SE040 | no_writing | no writing | institution | no | 1536 × 2048 | 316 | `2a80b765d82cf658` |

**Never sent:** SE002, SE008, SE009, SE010, SE019, SE028, RS001, RS002, RS003, and all hard negatives.

**This list includes Q-10 (ADR-064).** Brahmi has 4 images and Kharosthi 2, so their results are descriptive only. 3 of the 4 Brahmi images are printed plates, so report any Brahmi and Kharosthi result with that cue in mind.

**Frozen file hashes, as recorded in the freeze commit:**

| File | SHA-256 |
|---|---|
| `dataset/manifest.csv` | `ead8622726499c08d3cdbbfb75302f16caa374b0a99f6ff009948ea9be9a793d` |
| `config/run.yaml` | `9fc7125c7b891e0ce85159091eb75fdaeb0dcbb27d4f935f8f3545a23be4b2af` |
| `config/models.yaml` | `25222ee3a33f0405dc40852bb31eace0207d12e51225d9bfc23e4cdb7292fdc3` |
| `prompts/eval_v1.md` | `67085eb828b94a407b0693c20ccdc5f47919fc7e5e817dae157a5d232c6db111` |

The configuration hashes include the Implemented limits. `max_attempts_per_model` rose from 288 to 306, because 34 images need 102 repetitions at up to 3 attempts. After Stage D, writing Model A's host to `config/models.yaml` will change that one hash, and that needs approval.

## Repetitions and prompt

| Setting | Value |
|---|---|
| Repetitions | 3 per image, per model |
| Prompt | `eval_v1`, file `67085eb8...c6db111`, harness hash `7240f44b...75b902` |
| Temperature | 0.0 |
| Seed | `20261102`, the same for all repetitions |
| Order and concurrency | Manifest order, one request at a time |
| Reference material | None. The prompt gives no script descriptions (ADR-021) |
| Structured output | `json_schema`, strict |

**Pre-agreed fallback:** if Stage D shows that a provider refuses the strict schema, the only allowed change is `response_format: json_object`, for that model. It changes no prompt, and the harness still validates strictly. It must be set before Stage E and stated in the report.

## Image preprocessing

| Setting | Value |
|---|---|
| Version | `v1` |
| Steps | Hash check, decode, apply orientation, convert to RGB, downscale only, encode JPEG |
| Longest edge | 2,048 px, LANCZOS |
| JPEG quality | 92, with Pillow's default 4:2:0 chroma subsampling |
| Metadata | Removed. Output has no EXIF or ICC profile |
| Cropped rows | SE001, SE003, SE004, and SE005 use their recorded processed image, and never fall back |
| Pixel ceiling | 120 million |
| Largest image sent | 1,576 KB, or about 2,102 KB as base64 (SE003) |
| All 34 images | 19.6 MB per pass |

17 source files carry an ICC profile that is dropped without colour conversion, so colour may shift slightly. A provider may resize further, which only a Stage D check can reveal.

## Limits

| Limit | Stage D | Stage E | Status |
|---|---|---|---|
| Planned requests | 6 per model | 102 per model | 204 in Stage E |
| **Maximum requests including retries** | 18 per model | **306 per model, across all runs** | **648 in total, across both stages** |
| Attempts per repetition | 3 | 3 | Observed maximum |
| Provider retries | 1 | 1 | In `run.yaml` |
| Repair retries | 1 | 1 | In `run.yaml` |
| `max_tokens` | 1,500 | 1,500 | In `run.yaml` |
| Attempt timeout | 90 s, total | 90 s, total | In `run.yaml`, and enforced by the transport. Connection is limited to 10 s |
| Retry wait | 2 s default, 30 s cap | Same | Implemented. A longer `Retry-After` counts as a failed attempt with no retry |
| Run time | 15 minutes | 4 hours per model | Implemented stop rule |

**Stop rules.** Rules 1 to 4 are Implemented. Rule 5 is Proposed, as H-07. The run stops, keeps all records, and reports why, on any of these:

1. `auth`, `credit_exhausted`, or `bad_request`.
2. 5 provider failures in a row.
3. The attempt limit or time limit.
4. Estimated spending reaching the stop limit. An attempt with no reported usage counts at the full ceiling, because a failed call may still be billed.
5. A hash mismatch on any image, prompt, or configuration file, checked before the first call.

## Maximum cost including retries

**Estimates, not billed amounts.** Assumptions per attempt: 8,000 input tokens, which is generous against about 4,096 visual tokens plus the 2,347-character prompt and 2,579-byte schema, and the full 1,500 output tokens.

| | Model A | Model B | Total |
|---|---|---|---|
| Ceiling per attempt | $0.0021 | $0.0022 | |
| Stage D ceiling, 18 attempts | $0.04 | $0.04 | $0.08 |
| Stage E ceiling, 306 attempts | $0.64 | $0.67 | $1.32 |
| **Calculated ceiling** | $0.68 | $0.71 | **$1.39** |
| Planned, 102 calls at 5,000 input and 800 output | $0.13 | $0.13 | $0.26 |
| **Stop limit** | $1.00 | $1.00 | **$2.00** |

**Maximum approved spending: $2.00 of usage.** The gap above the ceiling allows for a modest price or token difference. If Stage D finds a higher price, or input above 8,000 tokens, the ceiling is recalculated and needs approval again.

**Money paid may be higher than usage.** OpenRouter charges a 5.5% fee when credits are bought, and its minimum purchase was not found. Hugging Face free accounts must buy credits, and that minimum was not found either. Its pricing page offers spending limits only to Team and Enterprise organizations, so **on a personal account the balance and the harness stop rule are the only limits**. Set an OpenRouter per-key limit of $1.00.

## Stage D checks

Nothing below runs until Stage D is approved. **Canaries are generated locally, so no dataset image is exposed.** Each runs twice with the frozen prompt, and results are stored apart and never counted.

| Canary | Purpose |
|---|---|
| Plain white, 2,048 × 2,048 | Expect no writing |
| Large rendered Latin text | Expect a different answer, which proves the image was received |
| Noise, at least 1,576 KB as JPEG | Proves the largest payload is accepted |

| Check | Pass condition | If it fails |
|---|---|---|
| Live catalog | Model, price, and host confirmed | Stop, and report |
| Host pin (Model A) | One host, with `allow_fallbacks: false`, `data_collection: deny`, and a data policy that has been read. `zdr: true` if an endpoint supports it | Owner decides |
| Image received | White and text canaries differ | Stop that model |
| Largest payload | Accepted | Stop that model |
| Structured output | Valid under `validate_output`, or the pre-agreed fallback | Stop that model |
| Usage | Tokens reported | Budget treats each attempt at the ceiling |
| Image detail (Model B, H-12) | Input tokens show the visual budget. Record it | **Owner decides whether Model B runs** |
| Output limit (H-16) | `finish_reason` is `stop`, with reasoning tokens recorded | Owner decides. A change is allowed only before Stage E |
| Caching (H-13) | Repeat calls show no cached response | Disclose it, and treat reproducibility as weak evidence |

Model B enters Stage E only if the DeepInfra question is answered and the owner accepts its image detail. Whether it may run canaries first is an owner decision (Phase 4). **If it does not run, the report says "not run", and the experiment stands on Model A alone.**

## Metrics and thresholds

Thresholds are the Approved gates, unchanged, and `config.py` refuses other values. Gates use the after-retry view.

| Gate | Threshold | Required |
|---|---|---|
| Top-1 accuracy | 1/2 | **12/24** |
| Top-3 recall | 4/5 | **20/24** |
| Rejection | 7/10 | **7/10** |
| Valid output after retry | 9/10 | **92/102**, if all 102 repetitions are answered |
| Reproducibility, in-scope | 4/5 | **20/24** |

Also reported, with no threshold: first-attempt results, coverage, per-script precision and recall, strict rejection, rejection by class, rejection consistency, reproducibility on rejection images, the confusion matrix, famous and printed-plate subgroups, failure analysis, history flags, Wilson intervals, latency, and usage share.

Add to the report, as context only: the constant baselines of 5/24 and 14/24 (H-14), the hosts that served the run, and any disclosure from Stage D.

**Run validity, Proposed before results.** A run is complete if every repetition has a record and at most 10 of 102 were lost to the provider. Otherwise it gets no go or no-go verdict. It may be repeated once within the attempt limit, for provider failure only and never for a poor score, and both runs are reported.

**A pass allows only this statement:** the model met preliminary engineering gates on this development set. It proves no general accuracy, and it does not validate the product path (F-19). Do not claim 88%.

## Storage and retention

| Item | Location | Retention |
|---|---|---|
| Every raw response, including failures | `results/live/<session>/<run_id>/raw/` | Keep indefinitely, unaltered |
| `attempts`, `failures`, and `retries` JSONL | Same run folder | Keep |
| Per-repetition and per-image tables, metrics, report, confusion matrix | Same run folder | Keep |
| Preflight results | `results/preflight/`, apart from Stage E | Keep, and never count |
| Hashes, versions, hosts, and the commit | `run_manifest.json` | Keep |
| Request bodies with base64 images | **Not stored** | Rebuilt from hashes and code |
| API keys | Environment only, never written | Rotate or delete after the run |
| Finished run folders | Never overwritten | A repeat run gets a new sequence |

`results/live/` and `results/preflight/` should be gitignored. Raw replies hold no images or keys, so the owner can decide after review whether to publish them. Failed runs are kept and reported, and never deleted.

## How failed and invalid requests count

| Case | Attempt record | Effect on scoring |
|---|---|---|
| Valid reply | `valid` | Counts as the repetition's label |
| Bad JSON, fences, or prose | `invalid_output`, model error | Up to 1 repair. If still invalid, the repetition is `failed` |
| Schema or rule violation | `invalid_output`, model error | Same |
| Truncated, `finish_reason=length` | `invalid_output`, with the reason recorded | Same, and reported apart |
| Timeout, 408, or 504 | `provider_error` | Up to 1 retry. Then `failed`, and its usage is unknown |
| 429 or 5xx | `provider_error` | Same |
| 401, 402, 403, or 400 | `provider_error` | No retry, and the run stops |
| HTTP 200 with an error or no choices | `provider_error` | As classified |
| Invalid, then provider failure on repair | **Proposed: counts as a model failure (H-09)** | `failed` |
| Failed repetition | Occupies a vote | Never dropped |
| No majority of 3 | `no_consensus` | Wrong, for in-scope and rejection images alike |
| Abstention on an in-scope image | Valid | Lowers coverage and counts as wrong for top-1 |
| Identified on a rejection image | Valid | Forced match, not a rejection |

## Required before Stage D

Each step needs the owner's approval. Approval of one does not extend to the next.

| Step | Work | Spending |
|---|---|---|
| 1 | **Done.** Git identity confirmed (ADR-061) | None |
| 2 | **Done.** Q-10 applied, and rows and gates reissued (ADR-064) | None |
| 3 | **Done.** Harness fixes H-01 to H-06, H-08, and H-10, with tests | None |
| 4 | **Done.** Freeze commit of the prompt, manifest, configuration, and code, the direct child of `5e5941d`. Not pushed | None |
| 5 | **Approve Stage D:** the exact HEAD hash, keys, the budget, generated canaries, and whether Model B takes part | Up to $0.08 ceiling. Proposed stop $0.10 |
| 6 | Report Stage D, fill in the values set there, and fix H-07, H-09, H-11, and H-15 | None |
| 7 | **Approve Stage E:** sending 34 images to third parties, and the final model list | Up to $1.32 ceiling |

**One value remains:** Model A's host. Stage D passes it on the command line, and it is written to `config/models.yaml` under `provider`, `order: ["<host>"]`, only before Stage E, with approval.

# Phase 3: Product verifier

**No shared dependency exists, so no verifier work belongs to M0, and none was done.** Harness code imports nothing from `apps/`, `packages/`, or `knowledge/`, and product code imports nothing from the harness. `scripts/test-all.mjs` only runs the harness's tests. Preprocessing settings match by value, in separate implementations. The two verifiers are separate too: Python's scanner reports history hits and removes nothing, so `verify.ts` cannot affect an M0 score.

**This also limits what M0 can show.** M0 will say nothing about `verify.ts`, the product prompt, or the product adapter (F-19).

| Backlog item | Status |
|---|---|
| The 13 adversarial cases in the [audit](COMPETITION_READINESS_AUDIT.md#safeguard-tests) | **Stays in P0.** They must be fixed and tested before real inference through the application |
| Review P0 items 1 to 14 | Stay in P0, and still gate product inference |

# Phase 4: Stage D preparation

**Prepared on 2026-11-02. Stage D has not run, and no provider API was called.** Everything below is read from public pages or tested offline with fakes. Published means a vendor's statement. Third-party trackers are named as such.

## Model A: recommended route (Proposed, ADR-068)

| Item | Value | Evidence |
|---|---|---|
| Gateway | OpenRouter, unchanged (ADR-014) | Published |
| Endpoint | `POST https://openrouter.ai/api/v1/chat/completions` | Published |
| Model ID | `qwen/qwen3-vl-30b-a3b-instruct` | Published |
| **Recommended host** | **DeepInfra**, subject to the catalog step | Inference, below |
| Host slug | Expected `deepinfra`. Use the exact tag the catalog prints, because OpenRouter matches every endpoint of a base slug | **Unverified** |
| Pin | `provider.order: [<tag>]`, `allow_fallbacks: false`, `require_parameters: true`, `data_collection: deny` | Published behaviour |
| Weights label | `Qwen/Qwen3-VL-30B-A3B-Instruct`, Hub revision `9c4b90e1...`. A host's loaded weights cannot be proven | Published |

**Why DeepInfra:**

- OpenRouter's public pages name no host, so its route cannot be confirmed before the catalog step.
- DeepInfra's own page lists the model at $0.15 and $0.60, which equals `config/models.yaml`, with 262,144 tokens of context, `fp8`, and tags for Multimodal, JSON, and Zero retention.
- Its terms make zero retention contractual for models it hosts, and that controls over its other documents.
- The Hub lists DeepInfra as a provider of this model.
- A third-party tracker reports 100% uptime for DeepInfra and 75% for Novita. This is weak evidence.

| Alternative | Why not first | Source |
|---|---|---|
| Novita | $0.20 and $0.70, above the configured prices, so the command refuses it unless the prices change. 128K context, 32K output, and it states structured output support. No retention statement found | Novita page |
| Alibaba | $0.13 to $0.20 reported, sources disagree | Trackers only |
| SiliconFlow, Fireworks | Higher reported prices | Tracker only |

**Capabilities, and how far each is known:**

| Capability | Status |
|---|---|
| Image input | DeepInfra tags Multimodal and documents base64 `data:` URIs in `image_url`. **Not proven on this route** |
| Image formats | OpenRouter lists PNG, JPEG, WebP, and GIF. DeepInfra's examples show PNG only, so JPEG on DeepInfra is **unverified**. The canaries and dataset are JPEG |
| Size limits | No per-image limit found on DeepInfra or on OpenRouter's image page. The canary tests 1,576 KB |
| Context and output | 262,144 tokens of context. DeepInfra states no maximum output. Its example uses 4,092 |
| Structured output | DeepInfra's tag says JSON, and its API page documents no `response_format`. **Strict `json_schema` is unknown.** The pre-agreed fallback is `json_object` |
| Seed | OpenRouter's page lists `seed`. DeepInfra's API page does not mention it |

## Model B: DeepInfra training question

**Finding: the evidence points to the exception not applying to Gemma, but DeepInfra has not confirmed that. Do not treat Model B as cleared for historical images.**

| Source | Exact language | Reading |
|---|---|---|
| Docs, Data Privacy | "We do not use data you submit to our APIs for training models, except when using Google or Anthropic models", "where the receiving company's training policy applies" | Literal reading could cover Gemma, a Google model |
| Same page | "We do not share data... except when using Google or Anthropic models", "where we are required to transfer data to those endpoints to fulfill the request" | The exception describes a transfer to another company's endpoints |
| Terms, Section 7(b), modified 2026-10-15 | "Provider will not retain, store, or log any Customer Data", "beyond the period strictly necessary", and it applies to "models hosted by Provider" | Contractual |
| Terms, Section 5 | Section 7(b) "controls over the Privacy Policy and any other Provider policy, webpage, or documentation" | The terms outrank the docs page |
| Gemma 4 31B page | Tags "Public" and "Zero retention", `fp8`, private endpoint option, listed DeepInfra prices | Looks DeepInfra-hosted |
| Gemini 2.5 Flash page | Label "Partner". No Zero retention tag, quantization, or private endpoint | Looks proxied. This is the direct contrast |

**Still unresolved:**

1. The page never says that "Google model" excludes Gemma, and it never says Gemma is self-hosted.
2. Sections 7(b) and 18 do not define "third-party model", and Section 18 includes "third-party open-source models".
3. Requests through Hugging Face are billed by Hugging Face, so whether DeepInfra's customer terms apply directly to a routed request is unclear.
4. Google's Gemma terms are not the question here, and were not assessed for this.

**Effect by stage.** Stage D sends generated canaries, the prompt, and the schema, so a training exception exposes no historical image. **It need not block Stage D, and this changes the earlier rule, so it needs the owner's decision.** Stage E should still wait for a written answer. Send this to policy@deepinfra.com:

> Does the "Google or Anthropic models" exception in your Data Privacy page apply to google/gemma-4-31B-it? Is that model hosted by DeepInfra, so that Section 7(b) of your terms applies? Does the answer change when requests are routed through Hugging Face Inference Providers with Hugging Face billing?

**New observation:** the recommended routes put both models on DeepInfra, so a host-level fault would affect both. The models and gateways still differ.

## Credentials

| Variable | Used for | Requirements |
|---|---|---|
| `OPENROUTER_API_KEY` | Model A, and the catalog step | Paid credits. Create a dedicated key with a credit limit |
| `HF_TOKEN` | Model B | Fine-grained token with "Make calls to Inference Providers" only. Free accounts must buy credits |

Loading (Verified offline): keys are read from the process environment only, and `.env` is not loaded by the harness. Set them in the shell that runs the command, without placing the value in shell history:

```bash
read -rs OPENROUTER_API_KEY && export OPENROUTER_API_KEY
read -rs HF_TOKEN && export HF_TOKEN
```

Do not paste a key into a conversation. Missing keys are reported by name only. A test confirms the key reaches no output or record. Delete or rotate each key after M0.

## Stage D budget

**Proposed for approval: $0.05 of estimated usage per model, $0.10 for both.** This is enforced by `MAX_USD_PER_MODEL` across all runs.

| | Model A | Model B |
|---|---|---|
| Attempt ceiling: 8,000 input and 1,500 output tokens | $0.0012 + $0.0009 = **$0.0021** | $0.0016 + $0.0006 = **$0.0022** |
| Worst case: 3 canaries × 2 repetitions × 3 attempts = 18 | **$0.0378** | **$0.0396** |
| Expected: 6 attempts at 5,000 and 800 tokens | $0.0074 | $0.0079 |

The two worst cases total $0.0774, which rounds to the $0.08 ceiling. The catalog step is not billed by the published endpoint descriptions, which is **unverified**.

| Control | Verified offline by |
|---|---|
| 18 attempts per model across all runs | `test_attempts_are_limited_across_runs` |
| Spending stop, using real usage or the ceiling | `test_the_spending_stop_holds_when_usage_is_far_above_the_assumption` |
| Fatal errors stop after 1 call | `test_a_fatal_error_stops_after_one_paid_call` |
| 5 provider failures in a row stop the run | `test_an_outage_stops_within_the_limit` |
| Retries capped per repetition | `tests/test_live_safety.py` |

**These are estimates.** The hard limits are outside this code: set an OpenRouter key limit of $0.10 for Stage D. Hugging Face personal accounts have no documented spending limit, so the balance is the limit.

**Money paid may be higher than usage.** OpenRouter's official FAQ states no minimum purchase, and its fee did not render. Third-party sources report a $5 minimum and a 5.5% fee with a $0.80 floor, and these are **unverified**. No Hugging Face minimum was found. OpenRouter's FAQ allows a refund request for unused credits within 24 hours, excluding fees.

## Stage D command (Implemented, ADR-067)

`live/stage_d.py` handles one named model per command. It sends only the 3 generated canaries. `src/run.py --live` stays refused.

```bash
cd experiments/m0_feasibility

# Step 1: list hosts and prices. No inference.
../../.venv/bin/python -m live.stage_d catalog --model qwen3_vl_30b --approved-commit <full hash>

# Step 2: send canaries to the host printed by step 1.
../../.venv/bin/python -m live.stage_d preflight --model qwen3_vl_30b --host <tag> --approved-commit <full hash>

# Step 3, only if the owner approves Model B for Stage D.
../../.venv/bin/python -m live.stage_d preflight --model gemma4_31b --approved-commit <full hash>
```

Each `preflight` command needs its own decision to run. Exit codes: 0 passed, 1 a check failed, 2 refused.

| Safety check | Before |
|---|---|
| `--approved-commit` equals HEAD, tree clean, four frozen hashes match, gateway URL is the expected one, key present | Any network use |
| Host named for Model A, and refused for Model B | Any network use |
| Host listed, price not above the configured price, structured output listed, enough output tokens, attempts left | Any paid call |

**It cannot reach Stage E by construction:** it imports no manifest or image loader, its images come only from `make_canaries`, a test confirms every sent hash is a canary, and results go to `results/preflight/`, which no metric reads. It takes no model list, so it cannot run both models in one command.

**Host handling:** the host is passed on the command line, so `config/models.yaml` keeps its frozen hash during Stage D. Before Stage E, the confirmed host must be written there, and `FROZEN_SHA256` updated, which is a separate approved change.

**If the strict schema is refused,** the run stops with `bad_request`. Using the `json_object` fallback changes `config/models.yaml`, so it needs approval first.
