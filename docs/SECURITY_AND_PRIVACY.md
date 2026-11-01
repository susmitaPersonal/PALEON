# Security and Privacy

> **Version:** 0.4 | **Last updated:** 2026-11-01 | **Status:** Local MVP controls Implemented and Verified by the named offline tests. Public deployment is Pending, and the gaps below must be closed first.

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

## Product controls

| Control | Status | Evidence |
|---|---|---|
| Server binds to `127.0.0.1` only | Verified | Live run of `npm start` and `npm run dev`, 2026-11-01 |
| Real inference needs two settings, and is off by default | Verified offline | `providers.test.ts` |
| Type is identified from file content, never the name or declared type | Verified offline | `intake.test.ts` |
| SVG, GIF, and animated files are rejected | Verified offline | `intake.test.ts` |
| Upload size is capped before parsing | Verified offline | `api.test.ts` |
| Every pixel is decoded, with a pixel limit against decompression bombs | Verified offline | `intake.test.ts` |
| Re-encoding removes EXIF, including GPS, and appended data | Verified offline | `intake.test.ts` |
| No URL-fetch feature, so no server-side request forgery through uploads | Implemented | No such route exists |
| Rate limit, and a concurrency cap on analyses | Verified offline | `api.test.ts` |
| `x-forwarded-for` is ignored unless `TRUST_PROXY=true`, so clients cannot forge their way past the limit | Verified offline | `api.test.ts` |
| Content-Security-Policy with no `unsafe-inline`, plus `nosniff` and `no-referrer` | Verified | `api.test.ts`, and a console check in real Chrome in `e2e/app.spec.ts` |
| Logs drop keys, tokens, image data, and model text | Verified offline | `providers.test.ts` |
| Provider error bodies are not repeated | Verified offline | `providers.test.ts` |
| Internal error details never reach clients | Verified offline | `api.test.ts` |
| Model output is rendered as text, and the web app uses no raw HTML | Implemented | No `dangerouslySetInnerHTML` in `apps/web/src` |
| Links shown come only from stored records, and must be `https` | Verified offline | `references.test.ts` |
| Key is absent from the web bundle | Verified | Search of `apps/web/dist`, 2026-11-01. Not automated |
| No known vulnerable dependencies | Verified on 2026-11-01 | `npm audit`: 0 vulnerabilities. This goes out of date, so rerun it |

## Gaps before any public deployment

Local use is the only supported mode. These are not done, and deployment is not authorized.

| Gap | Why it matters |
|---|---|
| No authentication | Anyone who can reach the server can use it |
| No cross-site request protection on uploads | With a real provider running locally, another website could trigger paid calls from the user's browser. It could not read the response |
| No daily spending budget in the application | Rate limits do not protect the wallet. Use a provider key limit |
| The rate limiter lives in memory, and all direct clients share one bucket | Adequate for one local user only. Behind a proxy, set `TRUST_PROXY=true` and use one instance |
| No CI, secret scanning, or automated dependency checks | These checks were run by hand |
| Provider data questions are open | Model A's host is unknown, and DeepInfra's exception is unresolved. See the table below |
| Web server static paths and TLS were not reviewed for internet exposure | The server is meant for loopback |

## Data retention

| Data | Experiment | Product MVP (Implemented) |
|---|---|---|
| Uploaded images | Gitignored local folder | Memory only, for one request. No temporary file or database |
| Raw model responses | Stored in run directories | Not stored |
| Results | Run directories | Held in the browser tab's memory, and lost on reload |
| Logs | Local run files | JSON lines to standard output: request ID, event, status, timing. They are not persisted by the app |

Nothing is shared between users, because there are no accounts or server-side history.

## Third-party inference risks

In demo mode nothing leaves the machine. If a real provider is enabled, images are sent to a third-party model host, and the upload page warns the user first. **This has never been enabled.**

| Risk | Mitigation | Status |
|---|---|---|
| Provider retains or trains on images | `data_collection: "deny"` configured for OpenRouter | Configured, not tested |
| Hugging Face and DeepInfra data handling | Policies read on 2026-11-01. See [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md#does-image-data-leave-this-machine) | Vendor statements only. **DeepInfra's "Google models" training exception is unresolved for Gemma** |
| Model A's host data handling | Read its policy once Stage D identifies and pins the host | **Host unknown** |
| Free endpoints may have different terms | Use paid endpoints for this run | Decided |
| Traffic screening by the gateway | OpenRouter's ZDR page announces CSAM screening from 2026-10-27. Confirm and disclose | Open |
| Model output carries instructions | Treat output as untrusted data, with no tools or URL fields | Proposed |

**Development sessions are a separate case.** Opening a historical image in a Claude Code session sends it to Anthropic's model. The user approved this for the session on 2026-11-01 (ADR-060). It does not cover the app, a provider, user uploads, or any other service, and no provider has received an image.


## Privacy considerations

- Removing EXIF also removes GPS data, which can reveal an excavation or find location.
- Museum images in this dataset do not depict identifiable private individuals, as far as metadata shows. Stage C should confirm this.

## Responsible use

ScriptEcho is not an authentication, dating, or valuation tool, and the interface and README say so. Some inscriptions are culturally sensitive, and a model's reading of them may be unwelcome or wrong.

## Reference material licensing

| Material | Rule |
|---|---|
| Unicode data files | Usable under Unicode License v3 |
| **Unicode code charts** | Do **not** redistribute. Unicode's terms limit them to personal or internal use, and bar extracting fonts from them. Link to them instead. |
| Comparison glyphs | Render from an openly licensed font after checking its licence, such as a Noto font (licence unverified here) |
| Encyclopaedias and scholarly text | Paraphrase, cite, and link. Never copy passages. |
| Wikimedia Commons images | Follow each file's licence and credit its author |

## Deployment (Proposed, not authorized)

**Proposed:** a single Node service on Render serves both the API and the built SPA. `npm start` already runs this shape locally.

This avoids CORS, requires one deployment, and lets the key sit in one place. Hono serves static files through `@hono/node-server/serve-static`, and serves only the built output directory.

The free tier's documented limits are:

- Spin-down after 15 minutes idle.
- About one minute to wake.
- 750 instance hours a month.
- No persistent disk, which does not matter for a stateless service.

**Handling cold starts:** wake the service before any live demo, and show a clear waiting state. The recorded walkthrough protects against this entirely. Upgrade to a paid instance only if a live event requires it.

Basic operations: `/health`, `/ready`, structured logs, and a rollback by redeploying the previous commit.
