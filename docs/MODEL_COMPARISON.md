# Model Comparison

> **Version:** 0.3 | **Last updated:** 2026-11-01 | **Status:** Pre-experiment. Nothing here is a measured result.

**Evidence date:** 2026-11-01 catalog snapshots and model cards. No model has been called.

Related: [MODEL_EVALUATION.md](MODEL_EVALUATION.md), [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md)

## Candidates

| | Model A | Model B |
|---|---|---|
| **Model** | Qwen3-VL-30B-A3B-Instruct | Gemma 4 31B |
| **Gateway** | OpenRouter | Hugging Face Inference Providers |
| **Configured ID** | `qwen/qwen3-vl-30b-a3b-instruct` | `google/gemma-4-31B-it:deepinfra` |
| **Licence** | Apache 2.0, per the model card | Apache 2.0, per the model card |
| **List price, USD per million tokens** | $0.15 input, $0.60 output | $0.20 input, $0.40 output |
| **Structured output** | `structured_outputs` listed in the catalog | `supports_structured_output: true` for DeepInfra in the catalog |
| **Relevant claim** | Card says "better with rare/ancient characters and jargon" | Card lists multilingual OCR and recommends higher visual budgets for it |
| **Main concern** | The claim is the vendor's and is untested here | The default visual budget through this host is unknown |

Model B was chosen for independence: it comes from a different family, and it runs through a different gateway on a pinned host.

## Verification status

| Requirement | Model A | Model B | Settled by |
|---|---|---|---|
| Provider availability | Listed | Listed, status `live` | Re-check at Stage D |
| Licence | Card badge read | Card badge read | Read the licence file at Stage D |
| API request format | Documented | Documented | Stage D call |
| **Actual image input** | **Not proven** | **Not proven** | Stage D canary image |
| **Structured output with an image** | **Not proven** | **Not proven** | Stage D call |
| Seed honoured | Unknown | Unknown | Stage D repeat test |
| Thinking or reasoning behaviour | Unknown | Unknown | Stage D usage check |
| Data handling | `data_collection: deny` configured | DeepInfra policy not yet read | Stage D review |

Capabilities are checked per provider. A model card or catalog listing does not prove a particular endpoint accepts images.

## Access and limits

| | OpenRouter | Hugging Face |
|---|---|---|
| Credential | `OPENROUTER_API_KEY` | `HF_TOKEN` with Inference Providers permission |
| Free access for this run | Not used. Paid endpoint keeps structured output and data routing controls | Free accounts have no included credits; purchase or PRO needed |
| Spending control | Per-key credit limit | Check the account billing page |

## Estimated experiment cost

**Estimate only.** It assumes 5,000 input and 800 output tokens per call.

| Model | Per call | 117 calls (39 images × 3) |
|---|---|---|
| Model A | $0.0012 | $0.14 |
| Model B | $0.0013 | $0.15 |

The planned total is about $0.30, plus retries and the Stage D checks. Reserve rows and the uncounted row are not run. Stage B.1 made no provider calls, so the facts above remain the 2026-11-01 snapshot.

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
