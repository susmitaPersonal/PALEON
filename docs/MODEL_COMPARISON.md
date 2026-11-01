# Model Comparison

> **Version:** 0.8 | **Last updated:** 2026-11-02 | **Status:** Pre-experiment. Nothing here is a measured result.

**Evidence date:** 2026-11-01 catalog snapshots, model cards, and public policy pages. No model or provider API has been called. The proposed run is specified in [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md).

Related: [MODEL_EVALUATION.md](MODEL_EVALUATION.md), [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md)

## Candidates

| | Model A | Model B |
|---|---|---|
| **Model** | Qwen3-VL-30B-A3B-Instruct | Gemma 4 31B |
| **Gateway** | OpenRouter | Hugging Face Inference Providers |
| **Configured ID** | `qwen/qwen3-vl-30b-a3b-instruct` | `google/gemma-4-31B-it:deepinfra` |
| **Role in M0, Proposed** | Primary | Conditional on Stage D findings |
| **Hub revision** | `9c4b90e1e4ba969fd3b5378b57d966d725f1b86c` | `842da3794eaa0b77d5f08bae87a17459d91ff475` |
| **Licence** | `apache-2.0` tag. No `LICENSE` file in the repository | `apache-2.0` tag, and Google's pages state Apache 2.0. No `LICENSE` file in the repository |
| **List price, USD per million tokens** | $0.15 input, $0.60 output | $0.20 input, $0.40 output |
| **Structured output** | `structured_outputs` listed in the catalog. DeepInfra tags JSON and does not document strict schemas | `supports_structured_output: true` for DeepInfra in the catalog |
| **Relevant claim** | Card says "better with rare/ancient characters and jargon" | Card lists multilingual OCR and recommends higher visual budgets for it |
| **Image detail, from published configs** | About 4,096 tokens at 2,048 × 2,048, so detail should survive if the host keeps defaults | Default 280 tokens, about 800 × 800 px. Maximum 1,120, about 1,600 × 1,600 px. This is arithmetic, and the host's setting is unknown |
| **Proposed host** | DeepInfra through OpenRouter, to be confirmed by the catalog step | DeepInfra, pinned by the model ID. The Hub lists it |
| **Main concern** | The claim is the vendor's and is untested here. The host is not yet confirmed | Image detail may be too low for strokes, and the DeepInfra training exception may apply |

Model B was chosen for independence: it comes from a different family, and it runs through a different gateway on a pinned host.

## Verification status

| Requirement | Model A | Model B | Settled by |
|---|---|---|---|
| Provider availability | OpenRouter names no host publicly. DeepInfra's page and the Hub list it | DeepInfra's page and the Hub list it | Stage D catalog step |
| Licence | Tag read. No licence file exists in the repository | Tag and Google's pages read. No licence file exists in the repository | Read. Open point is limited to the missing files |
| API request format | Documented | Documented | Stage D call |
| **Actual image input** | **Not proven** | **Not proven** | Stage D canary image |
| **Structured output with an image** | **Not proven** | **Not proven** | Stage D call |
| Seed honoured | Unknown | Unknown | Stage D repeat test |
| Thinking or reasoning behaviour | Unknown | Unknown | Stage D usage check |
| Data handling | `data_collection: deny` configured. DeepInfra's terms read: zero retention for hosted models | DeepInfra and Hugging Face policies read. Evidence suggests the "Google models" exception does not cover Gemma, but this is **not confirmed** | Written answer from DeepInfra, before Stage E |
| Visual token budget | Unknown | Unknown | Stage D usage check |
| Response caching | Unknown | Unknown | Stage D repeat test |

Capabilities are checked per provider. A model card or catalog listing does not prove a particular endpoint accepts images.

## Access and limits

| | OpenRouter | Hugging Face |
|---|---|---|
| Credential | `OPENROUTER_API_KEY` | `HF_TOKEN` with Inference Providers permission |
| Free access for this run | Not used. Paid endpoint keeps structured output and data routing controls | Free accounts have no included credits; purchase or PRO needed |
| Spending control | Per-key credit limit | Spending limits are documented for Team and Enterprise only. On a personal account, the balance is the limit |
| Purchase fee | 5.5% on Standard, charged when credits are bought | No markup stated |
| Minimum credit purchase | Not found | Not found |

## Estimated experiment cost

**Estimate only.** It assumes 5,000 input and 800 output tokens per call.

| Model | Per call | 102 calls (34 images × 3) |
|---|---|---|
| Model A | $0.0012 | $0.13 |
| Model B | $0.0013 | $0.13 |

The planned total is about $0.26 for the 34 accepted images, plus retries and the Stage D checks. The earlier $0.11 and $0.12 came from multiplying rounded per-call figures. With retries, the calculated ceiling is $1.39 and the Proposed stop limit is $2.00, as worked out in [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md#maximum-cost-including-retries). Stages C and C.1 made no provider calls, so the facts above remain the 2026-11-01 snapshot.

## Other models considered

| Model | Reason not selected |
|---|---|
| Qwen3.8-27B | Thinking is on by default, which adds time and cost; a possible later candidate |
| Gemma 4 26B A4B | Budget baseline; a possible later candidate |
| Qwen3.8-Flash-Next | Hub lists a custom `qwen-community-1.0` licence |
| Kimi K3 | Custom licence and high output price |
| Llama 4 Scout | Licence not checked against the primary text |
| Gemma 3 | Superseded by Gemma 4 |
| GLM-4.5V | OpenRouter lists no `structured_outputs` support |

## Benchmark results

None. No model has been called. Stage E adds measured metrics here, with links to each run directory.
