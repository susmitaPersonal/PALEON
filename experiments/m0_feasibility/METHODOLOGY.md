# M0 Feasibility Methodology

**Status:** Fixed before any model results exist. Any change after results exist is a new experiment.

## Implementation status

This document states the protocol, not the current code. The modules exist and pass offline tests, but they are not joined up. There is no entry point, the YAML configuration is not loaded, gold labels are not built from the manifest, preprocessing is not connected to the runner, and subgroup results for famous objects are not implemented. The full list is in [IMPLEMENTATION_ROADMAP.md](../../docs/IMPLEMENTATION_ROADMAP.md).

## Question

Can a hosted open-weight vision model tell six historical scripts apart from inscription images, and abstain on inputs outside that set, without any reference material?

The prompt deliberately gives no script descriptions. This measures unaided model capability, and the product's reference cards are not tested here.

This is a **development** dataset. Results can guide the next phase, but they are not independent evaluation. Any later prompt tuning on these images makes them unusable as evidence of final performance, so a separate held-out set is required.

## Protocol

1. Every model receives the same frozen prompt, `prompts/eval_v1.md`, whose SHA-256 is stored in `config/run.yaml`. A test fails if the two differ.
2. Every image passes through one preprocessing path: decode, apply orientation, drop metadata, resize to a 2048-pixel longest edge, and re-encode as JPEG.
3. Each image runs 3 times at temperature 0, with a fixed seed where the provider honours one.
4. Output is validated strictly. Markdown fences and surrounding prose count as invalid.
5. Each repetition allows at most one provider retry and one repair retry.
6. Only rows with `split=dev` and a verified `label_status` enter the metrics.
7. Finished run directories are never overwritten.

## Scoring rules

| Term | Definition |
|---|---|
| Image prediction | The strict majority label across 3 repetitions, otherwise `no_consensus` |
| Failed repetition | Still occupies a vote, and it is never dropped |
| Top-1 | The image prediction equals the gold script. Abstentions and failures count as wrong |
| Top-3 | The gold script is listed in a majority of repetitions |
| Coverage | In-scope images given a supported script. Always reported beside accuracy |
| Rejection | An out-of-scope or no-writing image receives any abstaining disposition |
| Strict rejection | The disposition is the exact expected one. Reported, not gated |
| Precision and recall | Calculated per script, and precision includes false positives on out-of-scope images |
| Reproducibility | All 3 repetitions give the same valid label. A repetition that failed cannot agree |
| Model error | A response that fails validation, or a wrong answer |
| Provider failure | Timeout, rate limit, outage, credit, or authorization failure. Never counted as invalid output |
| History flag | A heuristic hit for dates, centuries, URLs, or citations in free text. Reported, then hand-reviewed |

Results are computed twice, for first attempts and after retries. Gates use the after-retry view.

Cost is an **estimate**: reported tokens multiplied by configured list prices. Everything else listed above is measured.

## Engineering gates

| Gate | Threshold | 95% interval at the threshold | Chance comparison |
|---|---|---|---|
| Top-1 accuracy | 1/2, currently 15/29 | 34% to 69% | Chance is 16.7% |
| Top-3 recall | 4/5, currently 24/29 | 65% to 92% | Random three of six is 50% |
| Rejection | 7/10 | 40% to 89% | No useful baseline |
| Valid output after retry | 90% | Depends on calls | Not applicable |
| Reproducibility | 80%, currently 32/39 | 67% to 91% | Not applicable |

These are preliminary engineering gates. Passing them does not show 88% accuracy or any accuracy beyond this set. The rejection interval is too wide to be more than a rough signal.

The gates are stored as exact fractions. The required count is the fraction of the actual denominator, rounded up. For 22 images that was 11 and 18, and for the current 29 it is 15 and 24. Recalculate whenever verified counts change, for example after Stage C review.

Every result must report the raw numerator, denominator, percentage, confidence interval, and dataset limitations.

## Statistical limits

- With 30 images, a single measured rate carries a margin of roughly 15 to 20 points.
- With 5 images per script, per-script figures are descriptive only.
- Images were chosen by availability of licensed, labelled records, not sampled from any population.
- Temperature 0 does not guarantee identical hosted output, so repetitions measure stability rather than confirm it.
- Repetitions of one image are not independent evidence, so the sample size stays the number of images.

## Known threats to validity

| Threat | Control | Remaining risk |
|---|---|---|
| A model recognizes a famous object instead of reading it | `famous_object` flag, with results reported for each subgroup | Models may have seen any public image |
| Class linked to source or photography style | Recorded in `leakage_risks` | Phoenician is all Cesnola, and runic is one museum series |
| Class linked to medium | Recorded in `notes` | Many Brahmi and Kharosthi images are printed plates |
| Label quality | Evidence required, and `implied_record` excluded | No epigrapher has reviewed the labels |
| Filenames or metadata reveal labels | Only re-encoded pixels are sent | Text visible inside an image cannot be removed |

## Running

Nothing here reaches a network. No live transport exists until Stage D.

```bash
cd experiments/m0_feasibility
../../.venv/bin/python -m pytest -q
```
