# Security and Privacy

> **Version:** 0.1 | **Last updated:** 2026-11-01 | **Status:** Experiment controls Implemented where stated. Product controls Proposed.

Related: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [RISKS_AND_LIMITATIONS.md](RISKS_AND_LIMITATIONS.md)

## Current experiment controls

| Control | Status | Evidence |
|---|---|---|
| `.env` is gitignored, and `.env.example` holds empty values | Verified | `git check-ignore` run 2026-11-01 |
| Keys are read from environment variables only | Verified offline | `test_adapter.py` |
| Keys are absent from reprs, errors, and request bodies | Verified offline | `test_adapter.py` |
| No key-like values in tracked config | Verified offline | `test_runner.py` |
| Harness imports no network client | Verified offline | `test_runner.py` |
| Downloaded images are gitignored | Verified | `git check-ignore` run 2026-11-01 |

**No keys exist in this repository or environment as of the last update.** Keep them in a local `.env`, and never paste them into a conversation.

## API key management

- Server-side only. The key must never reach the frontend.
- Use a per-key spending limit as the hard stop.
- Rotate any key that appears in a log, a commit, or a conversation.
- Use the narrowest permission available. A Hugging Face token needs only Inference Providers permission.

## Image validation and upload security (Proposed)

Rules for the product:

1. Check the declared size before reading the body, and raise Hono's 100 KB `bodyLimit` default explicitly.
2. Identify the type from magic bytes. Ignore filenames and the client `Content-Type`.
3. Reject SVG, because it is executable markup rather than an image.
4. Decode fully with a pixel limit, to block decompression bombs.
5. Re-encode to a clean file, which removes EXIF and defeats polyglot files.
6. Offer no URL-fetch feature, which removes server-side request forgery.

`preprocess.py` already applies a pixel limit, orientation, re-encoding, and metadata removal for the experiment.

## Product security controls (Proposed)

- **Secrets:** server-side environment variables only, with a `.env.example` and secret scanning in CI. The frontend bundle is checked for the key prefix in CI.
- **Spending:** a per-key OpenRouter limit is the hard stop, backed by an application daily request budget. Rate limits alone do not protect the wallet.
- **Abuse:** per-IP limits, in memory, which is adequate for a single instance. Concurrency is capped, because each request holds an image in memory.
- **Upload attack surface:** covered by [image handling](AI_ARCHITECTURE.md#image-handling). There is no URL-fetch feature, which removes server-side request forgery entirely.
- **Output handling:** React escaping, no raw HTML rendering, and links only from the reference collection.
- **Headers:** a strict Content-Security-Policy, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.
- **Dependencies:** lockfile committed, with automated update checks.

## Data retention

| Data | Experiment | Product (Proposed) |
|---|---|---|
| Images | Gitignored local folder | Memory only, for one request |
| Raw model responses | Stored in run directories | Not stored |
| Logs | Local run files | Request ID, stage, timing, and error class only |

## Third-party inference risks

Images are necessarily sent to a third-party model host.

| Risk | Mitigation | Status |
|---|---|---|
| Provider retains or trains on images | `data_collection: "deny"` configured for OpenRouter | Configured, not tested |
| Hugging Face and DeepInfra data handling | Read policies before Stage D | **Not yet read** |
| Free endpoints may have different terms | Use paid endpoints for this run | Decided |
| Traffic screening by the gateway | OpenRouter's ZDR page announces CSAM screening from 2026-10-27. Confirm and disclose | Open |
| Model output carries instructions | Treat output as untrusted data, with no tools or URL fields | Proposed |

The product must tell users about this before upload, and warn against uploading private or sensitive material.

## Privacy considerations

- Removing EXIF also removes GPS data, which can reveal an excavation or find location.
- Museum images in this dataset do not depict identifiable private individuals, as far as metadata shows. Stage C should confirm this.

## Responsible use

The README should state that ScriptEcho is not an authentication, dating, or valuation tool. It should also acknowledge that some inscriptions are culturally sensitive and that a model's reading of them may be unwelcome or wrong.

## Reference material licensing

| Material | Rule |
|---|---|
| Unicode data files | Usable under Unicode License v3 |
| **Unicode code charts** | Do **not** redistribute. Unicode's terms limit them to personal or internal use, and bar extracting fonts from them. Link to them instead. |
| Comparison glyphs | Render from an openly licensed font after checking its licence, such as a Noto font (licence unverified here) |
| Encyclopaedias and scholarly text | Paraphrase, cite, and link. Never copy passages. |
| Wikimedia Commons images | Follow each file's licence and credit its author |

## Deployment

**Decision:** a single Node service on Render serves both the API and the built SPA.

This avoids CORS, requires one deployment, and lets the key sit in one place. Hono serves static files through `@hono/node-server/serve-static`, and it should serve only the built output directory.

The free tier's documented limits are:

- Spin-down after 15 minutes idle.
- About one minute to wake.
- 750 instance hours a month.
- No persistent disk, which does not matter for a stateless service.

**Handling cold starts:** wake the service before any live demo, and show a clear waiting state. The recorded walkthrough protects against this entirely. Upgrade to a paid instance only if a live event requires it.

Basic operations: `/healthz`, structured logs, and a rollback by redeploying the previous commit.
