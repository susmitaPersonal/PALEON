# Local Setup and Troubleshooting

> **Version:** 0.1 | **Last updated:** 2026-11-01

## Requirements

- Node.js 22.12 or later. The repository pins 22 in `.nvmrc`.
- Google Chrome, for end-to-end tests only.
- Python 3.12 with the packages in `experiments/m0_feasibility/requirements.txt`, for experiment tests only.

## Run

```bash
npm install
npm run dev
```

| Service | Address |
|---|---|
| Web app | <http://127.0.0.1:5173> |
| API | <http://127.0.0.1:8787> |

For a production-style build on one port:

```bash
npm start
```

Then open <http://127.0.0.1:8787>. The server binds to `127.0.0.1` only.

## Configuration

Demo mode needs no configuration. To override a setting, copy `.env.example` to `.env`. All settings are described in that file, and `.env` is gitignored.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| `npm install` fails on `sharp`, or tests fail on start | Node is too old. Run `node -v`, then `nvm use` |
| Web app says it could not reach its server | The API is not running. Use `npm run dev`, which starts both |
| `EADDRINUSE` | Another process holds the port. Set `PORT` in `.env`, and change the proxy in `apps/web/vite.config.ts` to match |
| Server exits with `MODEL_PROVIDER is not mock, but ALLOW_EXTERNAL_INFERENCE is not true` | A real provider is configured without its safety switch. See [MODEL_PROVIDER_GUIDE.md](MODEL_PROVIDER_GUIDE.md) |
| Upload rejected as unsupported | Only JPEG, PNG, and WebP are accepted, and animated files are rejected. Content decides, not the extension |
| `429` while testing | Raise `RATE_LIMIT_PER_MINUTE` in `.env` |
| Reference characters show as boxes | Your system lacks a font for that script. The code point and name are still correct |
| End-to-end tests cannot find a browser | They use installed Chrome. Run `npm test -- --skip-e2e` instead |
| Experiment tests are skipped | `.venv` is missing. See [experiments/m0_feasibility/README.md](../experiments/m0_feasibility/README.md) |
| A results page is empty after reloading | Expected. Results stay in tab memory, and nothing is stored |
