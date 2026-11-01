# Testing Guide

> **Version:** 0.1 | **Last updated:** 2026-11-01

## Run everything

```bash
npm test
```

This runs typechecking, reference validation, unit and integration tests, browser tests, and the feasibility experiment tests, then prints a summary. It uses no API key, paid service, or external inference. Without Chrome, run `npm test -- --skip-e2e`.

| Command | Scope |
|---|---|
| `npm run test:unit` | Contracts, API, and web tests |
| `npm test -w @scriptecho/api` | One workspace |
| `npm run test:e2e` | Browser tests, desktop and mobile |
| `npm run validate:knowledge` | Reference collection |
| `cd experiments/m0_feasibility && ../../.venv/bin/python -m pytest -q` | Feasibility experiment |

## Where tests live

| Area | Location |
|---|---|
| Contracts and schemas | `packages/contracts/src/contracts.test.ts` |
| Upload security, invalid images | `apps/api/test/intake.test.ts` |
| Malformed output, retries, timeouts, provider failures, verification | `apps/api/test/analysis.test.ts` |
| The 13 adversarial cases, verifier rules, and known limits | `apps/api/test/adversarial.test.ts` |
| Stage D command, with fake catalogs and transports | `experiments/m0_feasibility/tests/test_stage_d.py` |
| Q-10 margin clearing, including a pixel comparison with the originals | `experiments/m0_feasibility/tests/test_margin_clearing.py` |
| Provider adapter, configuration, logging | `apps/api/test/providers.test.ts` |
| Historical source and citation integrity | `apps/api/test/references.test.ts` |
| API routes, limits, headers, envelopes | `apps/api/test/api.test.ts` |
| Components, states, accessibility | `apps/web/src/test/app.test.tsx` |
| Full flows, CSP, colour contrast, mobile layout | `e2e/app.spec.ts` |

## Rules

- Tests never contact a provider. The real adapter is tested with a fake `fetch`.
- Synthetic and fixture results stay apart from real evaluation results, and must never be quoted as model performance.
- A green exit code is not proof. Confirm the number of tests that ran, because a runner can exit cleanly having found none.
- When adding a check, break the code once to confirm that the test fails.

Browser tests write screenshots to `docs/screenshots/`. They use a generated synthetic image, and no dataset image.
