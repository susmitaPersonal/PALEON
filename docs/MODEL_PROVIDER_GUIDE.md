# Model Provider Integration Guide

> **Version:** 0.1 | **Last updated:** 2026-11-01 | **Status:** Adapter Implemented and tested against a fake `fetch` only. **It has never contacted a real provider. Enabling it needs approval, because it sends images to a third party and costs money.**

## The interface

Everything model-specific sits behind `ModelProvider` in [apps/api/src/providers/types.ts](../apps/api/src/providers/types.ts). It returns raw text, so every provider faces the same validation. It holds no retries or pipeline logic.

| Provider | File | Use |
|---|---|---|
| `MockProvider` | `providers/mock.ts` | Default. Replays fixtures, and never reads image content |
| `OpenAICompatibleProvider` | `providers/openaiCompatible.ts` | Disabled by default. For gateways with an OpenAI-style chat API |

## Enabling a real model

Two separate settings are required, so that this cannot happen by accident.

```bash
MODEL_PROVIDER=openai-compatible
ALLOW_EXTERNAL_INFERENCE=true
MODEL_BASE_URL=https://example-gateway/v1
MODEL_ID=vendor/model-name
MODEL_API_KEY=your-key
```

If `MODEL_PROVIDER` names a real provider without the switch, or a value is missing, the server refuses to start. Setting only the switch leaves the mock in place. Before doing this:

1. Get approval for the spend and for sending images to that provider.
2. Read the provider's data policy, and update [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md).
3. Follow the checks in [MODEL_COMPARISON.md](MODEL_COMPARISON.md). A catalog listing does not prove image input works.
4. Set a spending limit on the key.

When real inference is on, the demo banner disappears, and the upload page warns that images go to a third party.

## Adding another provider

1. Implement `ModelProvider`, mapping failures to `ProviderError` kinds.
2. Register it in `providers/index.ts`, and add it to `MODEL_PROVIDER` in `config.ts`.
3. Test it with a fake transport. See `apps/api/test/providers.test.ts`.

Never put error bodies from a provider in messages or logs, because they can echo request data.

## Reliability behaviour

| Situation | Behaviour |
|---|---|
| Attempt takes too long | Aborted after `MODEL_TIMEOUT_MS`, and retried if allowed |
| Whole request takes too long | Stopped at `ANALYSIS_DEADLINE_MS`, returning 504 |
| Timeout, rate limit, or outage | Retried up to `MODEL_MAX_RETRIES`, honouring `retry-after` |
| Credit, authorization, or request error | Not retried, returning 503 |
| Malformed output | One repair retry, then 502 |

## What is tracked

Each result records provider, model, model version, prompt version and hash, reference version, optional `EXPERIMENT_ID`, request ID, attempts, latency, tokens, and estimated cost. Tokens stay `null` when a provider reports none. Cost is an estimate from configured list prices, not a billed amount.

## Prompts

| Prompt | Purpose | Rule |
|---|---|---|
| `apps/api/prompts/script_analysis_v1.md` | Product | Change it by adding a new version |
| `experiments/m0_feasibility/prompts/eval_v1.md` | Feasibility experiment | Frozen. Never edit it |

The product prompt must never ask for history. A model returns observations and candidates, and `verify.ts` removes any dates, links, citations, or percentages that appear anyway.
