# M0 Feasibility Methodology

**Status:** Fixed before any model results exist. Any change after results exist is a new experiment.

## Implementation status

The protocol below is Implemented and Verified offline against synthetic fixtures. Stages C to C.2 downloaded, cropped, and inspected the real images, and all 32 accepted images pass the preprocessing path. The protocol has never run on a model. Stages D and E are not authorized. A transport and preflight checks exist in `live/`, and no command can reach them. See [IMPLEMENTATION_ROADMAP.md](../../docs/IMPLEMENTATION_ROADMAP.md).

## Question

Can a hosted open-weight vision model tell six historical scripts apart from inscription images, and abstain on inputs outside that set, without any reference material?

The prompt deliberately gives no script descriptions. This measures unaided model capability, and the product's reference cards are not tested here.

This is a **development** dataset. Results can guide the next phase, but they are not independent evaluation. Any later prompt tuning on these images makes them unusable as evidence of final performance, so a separate held-out set is required.

## Protocol

1. Every model receives the same frozen prompt, `prompts/eval_v1.md`, whose SHA-256 is stored in `config/run.yaml`. A test fails if the two differ.
2. Every image passes through one preprocessing path: decode, apply orientation, drop metadata, resize to a 2048-pixel longest edge, and re-encode as JPEG. A cropped row uses its recorded lossless crop as input, and it can never fall back to its original.
3. Each image runs 3 times at temperature 0, with a fixed seed where the provider honours one.
4. Output is validated strictly. Markdown fences and surrounding prose count as invalid.
5. Each repetition allows at most one provider retry and one repair retry.
6. Only rows with `split=dev`, a verified `label_status`, and `stage_c_status=accepted` enter the metrics.
7. Finished run directories are never overwritten.

## Scoring rules

| Term | Definition |
|---|---|
| Image prediction | The strict majority label across 3 repetitions, otherwise `no_consensus` |
| Failed repetition | Still occupies a vote, and it is never dropped |
| Top-1 | The image prediction equals the gold script. Abstentions and failures count as wrong |
| Top-3 | The gold script is listed in a majority of repetitions |
| Coverage | In-scope images given a supported script. Always reported beside accuracy |
| Complete sample | No visible inscription in the source image was cropped away. This says nothing about the whole object |
| Excerpt | A crop that drops part of the visible inscription. It supports script identification only, and it needs no clipped characters and no answer clues |
| Rejection | An out-of-scope or no-writing image receives any abstaining disposition |
| Strict rejection | The disposition is the exact expected one. Reported, not gated |
| Precision and recall | Calculated per script, and precision includes false positives on out-of-scope images |
| Reproducibility, in-scope | In-scope images whose 3 repetitions give the same valid label. A failed repetition cannot agree. This is the gate |
| Reproducibility, rejection | The same measure for rejection images. Reported separately, not gated |
| Rejection consistency | Rejection images where all 3 repetitions abstain. Reported separately, not gated |
| Model error | A response that fails validation, or a wrong answer |
| Provider failure | Timeout, rate limit, outage, credit, or authorization failure. Never counted as invalid output |
| History flag | A heuristic hit for dates, centuries, URLs, or citations in free text. Reported, then hand-reviewed |

Complete samples and excerpts are reported separately, along with each script and each rejection class. Results are computed twice, for first attempts and after retries. Gates use the after-retry view.

Cost is an **estimate**: reported tokens multiplied by configured list prices. Everything else listed above is measured. Where a provider reports no usage, tokens and cost stay unknown. They are never filled in or treated as zero, and the report states the share of attempts with usage.

Provider failures, malformed responses, and successful retries are counted separately.

**Live limits.** `config/run.yaml` holds the token, timeout, attempt, time, and spending limits. A live run must use a `RunGuard`, which stops on those limits, on `auth`, `credit_exhausted`, or `bad_request`, and after 5 provider failures in a row. An attempt with no reported usage counts at the full ceiling. Synthetic replays use no guard, so their recorded failures play out in full.

## Engineering gates

| Gate | Threshold | 95% interval at the threshold | Chance comparison |
|---|---|---|---|
| Top-1 accuracy | 1/2, currently 12/24 | 31% to 69% | Chance is 16.7% |
| Top-3 recall | 4/5, currently 20/24 | 64% to 93% | Random three of six is 50% |
| Rejection | 7/10 | 40% to 89% | No useful baseline |
| Valid output after retry | 90% | Depends on calls | Not applicable |
| Reproducibility, in-scope | 4/5, currently 20/24 | 64% to 93% | Not applicable |

These are preliminary engineering gates. Passing them does not show 88% accuracy or any accuracy beyond this set. The rejection interval is too wide to be more than a rough signal.

`config.py` refuses to run if the gates in `config/run.yaml` differ from the approved values.

The gates are stored as exact fractions. The required count is the fraction of the actual denominator, rounded up. For 22 images that was 11 and 18, for 29 it was 15 and 24, and for the current 22 it is 11 and 18. Reproducibility uses in-scope images only, so the combined count is never its denominator. Recalculate whenever verified counts change, for example after Stage C review.

Every result must report the raw numerator, denominator, percentage, confidence interval, and dataset limitations.

## Confidence intervals

Reports give 95% Wilson intervals on image counts. They describe sampling uncertainty only, and they assume independent images from a stable population, which this convenience sample is not. They do not cover label errors, source bias, or memorization, so true uncertainty is wider.

## Statistical limits

- With 30 images, a single measured rate carries a margin of roughly 15 to 20 points.
- With 5 images per script, per-script figures are descriptive only.
- Images were chosen by availability of licensed, labelled records, not sampled from any population.
- Temperature 0 does not guarantee identical hosted output, so repetitions measure stability rather than confirm it.
- Repetitions of one image are not independent evidence, so the sample size stays the number of images.

## Known threats to validity

| Threat | Control | Remaining risk |
|---|---|---|
| A model recognizes a famous object instead of reading it | `famous_object` flag, with results reported for each subgroup, and the same for printed plates | Models may have seen any public image |
| Class linked to source or photography style | Recorded in `leakage_risks` | Phoenician is all Cesnola, and runic is one museum series |
| Class linked to medium | Recorded in `notes` | Many Brahmi and Kharosthi images are printed plates |
| Label quality | Evidence required, and `implied_record` excluded | No epigrapher has reviewed the labels |
| Filenames or metadata reveal labels | Only re-encoded pixels are sent | Text visible inside an image cannot be removed |

## Running

Nothing here reaches a network. `src/` never imports `live/`, and `--live` is refused.

```bash
cd experiments/m0_feasibility
../../.venv/bin/python -m pytest -q
../../.venv/bin/python -m src.run --synthetic
```
