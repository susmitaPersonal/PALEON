# API Reference

> **Version:** 0.1 | **Last updated:** 2026-11-01 | **Status:** Implemented; Verified by automated tests

Base path: `/api/v1`. Schemas live in [packages/contracts](../packages/contracts/src), which is the source of truth.

## Envelope

Every API response uses one shape, and carries the same `x-request-id` header.

```json
{ "ok": true, "data": {}, "meta": { "requestId": "..." } }
```

```json
{ "ok": false, "error": { "code": "file_too_large", "message": "...", "retryable": false }, "meta": { "requestId": "..." } }
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness. Calls no provider |
| `GET` | `/ready` | Readiness, including reference collection and provider mode |
| `GET` | `/api/v1/runtime` | Provider, model, versions, and limits. Contains no secrets |
| `POST` | `/api/v1/analyses` | Analyse one image |
| `GET` | `/api/v1/scripts` | List scripts, with incomplete fields |
| `GET` | `/api/v1/scripts/:id` | One record, with its sources |
| `GET` | `/api/v1/comparisons?a=&b=` | Compare two stored records |

## `POST /api/v1/analyses`

Send `multipart/form-data`.

| Field | Required | Notes |
|---|---|---|
| `image` | Yes | One JPEG, PNG, or WebP file, 8 MB by default. Content decides the type, not the name |
| `demoScenario` | No | Demo mode only: `auto`, `clear_candidate`, `ambiguous_candidates`, `out_of_scope`, `no_writing`, `insufficient_evidence`, `provider_failure` |

```bash
curl -F image=@photo.jpg http://127.0.0.1:8787/api/v1/analyses
```

Main fields of `data`:

| Field | Meaning |
|---|---|
| `status` | `candidates`, `insufficient_evidence`, `out_of_scope`, or `no_writing`. All are successful responses |
| `candidates` | Up to 3, ranked, with evidence for and against, a computed `evidenceStrength`, and a `directionCheck` of `consistent`, `conflict`, or `not_checkable` against the sourced record |
| `observations` | AI observations of the image. Not verified |
| `unsupportedScriptIds` | Scripts the model named that have no record |
| `removedStatements` | Number of statements removed because they looked like dates, links, citations, or percentages, were repeats, named the candidate, or were not visual observations |
| `recommendExpertReview` | True unless one strong candidate clearly leads. No result can be strong today, so it is currently always true, including for `no_writing` |
| `capabilities` | Only script identification is available |
| `provenance` | `simulated`, provider, model, prompt version and hash, reference version, timing, tokens, and estimated cost |

Tokens and cost are `null` when unknown. They are never estimated from nothing.

`evidenceStrength` is a fixed rule, not a probability:

| Value | Rule |
|---|---|
| `strong` | At least 2 stored traits confirmed by structured fields, at least 3 supporting items, none contradicting, and good image quality. Only direction can be confirmed today, so **no result can reach this** |
| `weak` | Poor quality, a direction conflict, fewer than 2 supporting items, or contradicting items at least equal supporting items |
| `moderate` | Anything else |

## Errors

| Status | Code | Cause | Retryable |
|---|---|---|---|
| 400 | `invalid_request` | Missing, repeated, or empty `image`, or a bad parameter | No |
| 404 | `not_found` | Unknown route or script | No |
| 413 | `file_too_large` | Over the upload limit | No |
| 415 | `unsupported_media_type` | Content is not an accepted image, or is animated | No |
| 422 | `undecodable_image` | Corrupt or truncated | No |
| 422 | `image_too_large` | Over the pixel limit | No |
| 429 | `rate_limited` | Client limit or concurrency cap, with `retry-after` | Yes |
| 502 | `model_output_invalid` | Invalid after one repair retry | Yes |
| 503 | `provider_unavailable` | Provider failure | Yes |
| 504 | `analysis_timeout` | Attempt timeout or overall deadline | Yes |
| 500 | `internal_error` | Unexpected. Details are logged, never returned | No |
