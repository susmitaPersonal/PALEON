# M0 Feasibility Experiment

Tests whether hosted open-weight vision models can identify historical scripts before ScriptEcho's application is built.

**Current state:** Stages A, B, and B.1 are complete. No images have been downloaded, and no model has been called. The modules are tested individually but are not yet joined into a runnable experiment. See [IMPLEMENTATION_ROADMAP.md](../../docs/IMPLEMENTATION_ROADMAP.md).

| Path | Purpose |
|---|---|
| [METHODOLOGY.md](METHODOLOGY.md) | Protocol, scoring rules, gates, and limits |
| [dataset/manifest.csv](dataset/manifest.csv) | Image metadata and labels |
| [dataset/SOURCING.md](dataset/SOURCING.md) | Sources, licences, attribution, evidence, and gaps |
| [dataset/QUALITY_REPORT.md](dataset/QUALITY_REPORT.md) | Bias and quality assessment |
| [prompts/eval_v1.md](prompts/eval_v1.md) | Frozen evaluation prompt |
| [config/](config/) | Model and run settings |
| [src/](src/) | Adapter, schema, validation, metrics, runner, and report |
| [tests/](tests/) | Offline tests using synthetic data |

## Setup

The local environment inherits packages from the Anaconda install on this machine, so creating it needed no download:

```bash
/opt/anaconda3/bin/python -m venv --system-site-packages .venv
```

On another machine, install the pinned versions in `requirements.txt` into a Python 3.12 environment.

Run the tests from this directory:

```bash
../../.venv/bin/python -m pytest -q
```
