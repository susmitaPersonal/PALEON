# M0 Feasibility Experiment

Tests whether hosted open-weight vision models can identify historical scripts. ScriptEcho's application now exists as a local MVP on a mock provider, but this experiment has not run, so no model capability is known.

**Current state:** Stages A to C.2 are complete. The whole harness runs offline from one command against synthetic fixtures. Real images are downloaded, cropped, and inspected, and 32 are accepted. No model has been called, so **nothing here says anything about model capability yet**. What remains is in [IMPLEMENTATION_ROADMAP.md](../../docs/IMPLEMENTATION_ROADMAP.md).

| Path | Purpose |
|---|---|
| [METHODOLOGY.md](METHODOLOGY.md) | Protocol, scoring rules, gates, and limits |
| [dataset/manifest.csv](dataset/manifest.csv) | Image metadata and labels |
| [dataset/SOURCING.md](dataset/SOURCING.md) | Sources, licences, attribution, evidence, and gaps |
| [dataset/QUALITY_REPORT.md](dataset/QUALITY_REPORT.md) | Bias and quality assessment |
| [dataset/STAGE_C_REPORT.md](dataset/STAGE_C_REPORT.md) | Image acquisition and validation results |
| [dataset/visual_review.csv](dataset/visual_review.csv), [image_inventory.csv](dataset/image_inventory.csv), [sha256sums.txt](dataset/sha256sums.txt) | Per-image records |
| [dataset/proposed_crops.csv](dataset/proposed_crops.csv), [crop_metadata.csv](dataset/crop_metadata.csv), [crop_review.csv](dataset/crop_review.csv) | Crop boxes, applied results, and inspection |
| [dataset/replacement_images.csv](dataset/replacement_images.csv) | Verified SE001 replacement record |
| [dataset/hard_negative_candidates.csv](dataset/hard_negative_candidates.csv), [hard_negative_images.csv](dataset/hard_negative_images.csv), [hard_negative_review.csv](dataset/hard_negative_review.csv) | Candidates, hashes, and inspection. None counts |
| [dataset/manifest_changes.csv](dataset/manifest_changes.csv) | Every field changed from the committed baseline |
| [prompts/eval_v1.md](prompts/eval_v1.md) | Frozen evaluation prompt |
| [config/](config/) | Model and run settings |
| [src/](src/) | Harness source, described below |
| [fixtures/synthetic/](fixtures/synthetic/) | Recorded synthetic dataset and responses |
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

## Run the experiment with one command

From this directory:

```bash
../../.venv/bin/python -m src.run --synthetic
```

This replays recorded fixtures through the full pipeline. It needs no API key, network access, downloaded image, or paid service. Each run writes to a new `results/synthetic/sNN/` folder, which is gitignored, and finished runs are never overwritten.

| Command | Purpose |
|---|---|
| `python -m src.run --synthetic` | Full synthetic experiment |
| `python -m src.run --check` | Validate the real configuration, manifest, inventory, and any images present, and print required gate counts |
| `python -m tools.fetch_images` | Stage C downloader. Fetches only accepted rows, from allowlisted hosts, and never overwrites |
| `python -m tools.fetch_hard_negatives` | Fetches candidate images to `data/hard_negatives/`, which no evaluation path reads |
| `python -m tools.process_images` | Applies recorded crops to `data/processed/`, and builds previews. No network |
| `python -m src.run --live` | Refused, because Stage D is not approved |
| `python -m src.synthetic` | Regenerate the fixtures from their scenarios |

**Synthetic numbers are invented.** They prove the harness works, and they are not evidence about any model.

## Run output

Each model gets one folder, named by its run ID.

| File | Contents |
|---|---|
| `raw/` | One JSON file per attempt, exactly as received. Kept apart from all calculations |
| `attempts.jsonl` | Every attempt |
| `failures.jsonl`, `retries.jsonl` | Failed attempts and retry attempts |
| `repetition_results.csv`, `.jsonl` | One row per image and repetition |
| `image_results.csv`, `.jsonl` | One row per image, with the consensus prediction |
| `metrics.json` | Calculated metrics |
| `report.md` | Readable report with intervals, failure analysis, and limitations |
| `confusion_matrix.csv`, `.png` | After-retry confusion matrix |
| `run_manifest.json` | Hashes, data origin, and Git state |

`comparison.md` sits one level up and compares gates across models.

## Source modules

| Module | Responsibility |
|---|---|
| `run.py` | Single entry point |
| `config.py` | Validates configuration, and refuses changed gates or a changed prompt |
| `manifest.py` | Loads the manifest, validates it, and builds gold labels |
| `images.py` | Synthetic and local image sources |
| `preprocess.py` | Fixed image normalization |
| `adapter.py` | Provider interface, request building, and fixture replay |
| `schema.py`, `validation.py` | Response contract and strict validation |
| `runner.py` | Experiment loop, retries, and failure records |
| `metrics.py` | Metrics, gates, failure analysis, and subgroups |
| `results.py`, `report.py` | Per-image tables and the report |
| `synthetic.py` | Generates the fixtures |
| `dataset_check.py` | Ties manifest, inventory, replacements, crops, licences, and files together |
| `crops.py` | Lossless crops and image comparison |

`tools/fetch_images.py` sits outside `src/`, so the harness itself still has no network client.
