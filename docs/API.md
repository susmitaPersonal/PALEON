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
| `GET` | `/ready` | Readiness, including reference collection, inference mode, and model status. Returns 503 if a local model is not ready |
| `GET` | `/api/v1/runtime` | Provider, model, `inferenceMode`, `modelStatus`, model details, versions, and limits. Contains no secrets |
| `POST` | `/api/v1/analyses` | Analyse one image. Streams progress when asked |
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

**Streaming.** Send `Accept: application/x-ndjson` to get one JSON object per line. Headers arrive at once, which matters because a local model can take many minutes.

| Event | Meaning |
|---|---|
| `{"type":"progress","progress":{"stage":"received"}}` | Upload read. Then `analysing`, then `generating` with `tokens` |
| `{"type":"heartbeat"}` | Sent every 15 s while the model is silent |
| `{"type":"result","body":{...}}` | The final event. `body` is the normal success or failure envelope |

A stream with no `result` event failed, and it must never be read as a result. Closing the connection cancels the analysis.

Main fields of `data`:

| Field | Meaning |
|---|---|
| `status` | `candidates`, `insufficient_evidence`, `out_of_scope`, or `no_writing`. All are successful responses |
| `candidates` | Up to 3, ranked, with evidence for and against, a computed `evidenceStrength`, and a `directionCheck` of `consistent`, `conflict`, or `not_checkable` against the sourced record |
| `observations` | AI observations of the image. Not verified |
| `unsupportedScriptIds` | Scripts the model named that have no record |
| `removedStatements` | Number of statements removed because they looked like dates, links, citations, or percentages, were repeats, named the candidate, or were not visual observations |
| `recommendExpertReview` | True unless one strong candidate clearly leads. No result can be strong today, so it is currently always true, including for `no_writing` |
| `capabilities` | Script identification is `available`, or `simulated` in demo mode. Everything else is unavailable |
| `provenance` | `simulated`, `inferenceMode` (`simulated`, `local`, or `external`), provider, model, prompt version and hash, reference version, timing, tokens, and estimated cost |

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
| 403 | `forbidden` | Host, Origin, or a cross-site request is not allowed | No |
| 404 | `not_found` | Unknown route or script | No |
| 413 | `file_too_large` | Over the upload limit | No |
| 415 | `unsupported_media_type` | Content is not an accepted image, or is animated | No |
| 422 | `undecodable_image` | Corrupt or truncated | No |
| 422 | `image_too_large` | Over the pixel limit | No |
| 429 | `rate_limited` | Client limit or concurrency cap, with `retry-after` | Yes |
| 502 | `model_output_invalid` | Invalid after one repair retry, or cut off, which is not retried | Varies |
| 503 | `provider_unavailable` | Provider failure. A missing or unloadable local model is not retryable | Varies |
| 504 | `analysis_timeout` | Attempt timeout or overall deadline | Yes |
| 499 | `analysis_cancelled` | The client left or cancelled | Yes |
| 500 | `internal_error` | Unexpected. Details are logged, never returned | No |

## Research cases

Cases persist on this machine (ADR-073), unlike `POST /analyses`. Every write that changes a case takes `expectedRevision`, and a stale value returns `409 conflict`. Readings are made by people. No endpoint turns model output into a reading.

| Method and path | Purpose |
|---|---|
| `GET /system` | Memory, free disk, and core count. Starts nothing |
| `GET /scripts/:id/signs` | Sign inventory |
| `GET /languages` | Language packs |
| `GET /cases`, `POST /cases` | List cases, or create one from multipart `image`, `title`, `sourceDescription`, and `rights` |
| `GET`, `PATCH`, `DELETE /cases/:id` | Read, set title, script, or language, or delete with its image and examples |
| `GET /cases/:id/image` | The stored, re-encoded image |
| `POST /cases/:id/analysis` | Script identification on the stored image. Accepts the NDJSON stream form |
| `POST /cases/:id/segment` | Propose boxes by rule. Refused once readings exist |
| `PUT /cases/:id/tokens` | Save corrections. The server sets each token's origin |
| `GET /cases/:id/suggestions` | Compare unread signs with approved examples |
| `POST /cases/:id/exemplars` | Approve one certain, person-confirmed sign as an example |
| `GET /cases/:id/transliteration?scheme=` | Rule-based transliteration, or `null` with no script |
| `GET /cases/:id/translation` | Glosses and untranslated words, or `null` with no script |
| `POST /cases/:id/notes`, `/citations`, `/review` | Add a note or citation, or record a review |
| `GET /cases/:id/report?format=markdown\|json` | Download the research report |
