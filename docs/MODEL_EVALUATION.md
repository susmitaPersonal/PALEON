# Model Evaluation

> **Version:** 0.9 | **Last updated:** 2026-11-01 | **Status:** Methodology Approved for M0. Harness Verified offline on synthetic fixtures. Real dataset validated at Stages C to C.2. Execution specification Proposed. **No model results exist.**

Local inference is a separate experiment in [experiments/local_vlm](../experiments/local_vlm/README.md). Its results are not M0 results, and these gates do not apply to it.

The product prompts in `apps/api/prompts/` are separate from the frozen `prompts/eval_v1.md`. Passing M0 with the frozen prompt says nothing about the product prompt, which would need its own evaluation.

Related: [METHODOLOGY.md](../experiments/m0_feasibility/METHODOLOGY.md), [DATASET_STRATEGY.md](DATASET_STRATEGY.md), [MODEL_COMPARISON.md](MODEL_COMPARISON.md)

[METHODOLOGY.md](../experiments/m0_feasibility/METHODOLOGY.md) holds the fixed M0 protocol. This document covers the wider evaluation approach.

## M0 readiness

The owner decided that M0 runs before product-level real-model work (ADR-062). **The harness is not yet cleared for a live run.** The 2026-11-01 offline review found the scoring sound, and 8 run-loop gaps to fix before Stage D. Those fixes are Implemented and Verified offline, and have never met a real provider. Q-10 is applied (ADR-064), so the row list changed to 24 in-scope and 10 rejection images. The exact rows, limits, costs, and counting rules are in [M0_READINESS_AND_EXECUTION_SPEC.md](M0_READINESS_AND_EXECUTION_SPEC.md), which is Proposed. Stage D and Stage E remain unauthorized.

## Evaluation methodology

1. Freeze the prompt, configuration, and manifest, and record their hashes.
2. Run every eligible image 3 times per model, at temperature 0.
3. Store every attempt, raw response, failure, and retry.
4. Compute metrics twice, for first attempts and after retries.
5. Compare results with gates fixed in advance.

## Metrics and formulas

Let *n* be the number of in-scope images with counted labels.

| Metric | Formula |
|---|---|
| Top-1 accuracy | correct image predictions / *n* |
| Top-3 recall | images whose gold script appears in a majority of repetitions / *n* |
| Coverage | in-scope images given a supported script / *n* |
| Precision for script *s* | images correctly predicted *s* / all images predicted *s*, including out-of-scope images |
| Recall for script *s* | images correctly predicted *s* / images with gold label *s* |
| Rejection rate | rejection images given any abstention / rejection images |
| Strict rejection rate | rejection images given the exact expected abstention / rejection images |
| Valid output rate | repetitions with valid output / repetitions where the model answered, shown for first pass and after retry |
| API failure rate | attempts with a provider failure / all attempts |
| Reproducibility, in-scope | in-scope images with 3 identical valid labels / in-scope images |
| Reproducibility, rejection | rejection images with 3 identical valid labels / rejection images |
| Rejection consistency | rejection images where all 3 repetitions abstain / rejection images |
| Estimated cost | (input tokens × input price + output tokens × output price) / 10^6 |
| Character error rate | Levenshtein edits / reference characters (future) |

An image prediction is the strict majority across repetitions. Otherwise it is `no_consensus`, which counts as wrong.

**Wilson 95% interval** for *k* of *n*, with z = 1.96 and p = k/n:

```text
centre    = (p + z²/2n) / (1 + z²/n)
half-width = z × sqrt(p(1−p)/n + z²/4n²) / (1 + z²/n)
```

Each metric also reports a one-sided binomial comparison with chance where one exists: 1/6 for top-1, and 1/2 for top-3 from three random picks.

## Acceptance thresholds

Approved as preliminary engineering gates. They may not change after results exist without a new, documented experiment.

| Gate | Threshold | Status |
|---|---|---|
| Top-1 accuracy | At least 1/2. Currently **12/24** | Approved; Verified offline |
| Top-3 recall | At least 4/5. Currently **20/24** | Approved; Verified offline |
| Rejection | At least **7/10** | Approved; Verified offline |
| Valid output after retry | At least 90% | Approved; Verified offline |
| Reproducibility, in-scope | At least 4/5. Currently **20/24** | Approved; Verified offline |

**Required count:** the fraction of the actual denominator, rounded up. The approved values for 22 images were 11/22 and 18/22. Stage B.1 moved these to 15/29 and 24/29. Stage C review reduced the accepted in-scope count to 21, and Stage C.1 raised it to 22, so the current values are 11/22 and 18/22. Stage C.2 left this unchanged, because all three excerpts failed the clipping check. Q-10 accepted SE003 and SE004 as complete samples, so the current values are 12/24 and 20/24. SE010 stays held. Recalculate whenever counts change, and `--check` prints the current values.

**Always report:** raw numerator, denominator, percentage, confidence interval, and dataset limitations. The report generator prints all of these.

Also required, with no threshold: complete samples and excerpts reported separately, rejection for each rejection class, reproducibility on rejection images, rejection consistency, per-script metrics, the confusion matrix, confidence intervals, provider failures, malformed responses, and successful retries counted separately, and results before and after retries.

These gates are not scientific proof of general accuracy. **Do not claim 88% accuracy from these development experiments.** That figure is a separate research target, for a defined task on held-out data, stated with its interval.

## Confidence intervals and their limits

Intervals are 95% Wilson intervals on image counts. They describe sampling uncertainty only, and they assume independent images from a stable population, which this convenience sample is not. Label errors, source bias, and memorization are not covered, so true uncertainty is wider.

## Statistical limitations

| Result | 95% Wilson interval |
|---|---|
| 12 of 24 | 31% to 69% |
| 20 of 24 | 64% to 93% |
| 11 of 22 | 31% to 69% |
| 18 of 22 | 61% to 93% |
| 13 of 25 | 33% to 70% |
| 20 of 25 | 61% to 91% |
| 15 of 29 | 34% to 69% |
| 24 of 29 | 65% to 92% |
| 7 of 10 | 40% to 89% |
| 53 of 60 | 78% to 94% |
| 9 of 10, one script | 60% to 98% |

To have the lower bound clear 88% requires about 78 of 82 correct, or 213 of 231. M0 cannot show this and is not designed to.

Other limits: images are a convenience sample, repetitions are not independent evidence, per-script numbers are descriptive only, and accuracy must never appear without coverage, because abstaining raises it.

## Development versus held-out evaluation

| | Development (M0) | Held-out (future) |
|---|---|---|
| Purpose | Decide whether to continue, and learn failure modes | Report performance |
| Prompt tuning | Allowed in a new, documented experiment | Forbidden |
| Status | 34 of 40 rows counted, inspected, with no model results | Not collected |
| Planned size | 40 images | 60 in-scope, 10 out-of-scope, 10 no-writing, 10 damaged |
| Claims allowed | Engineering gates only | Measured results with intervals |

**Do not tune on the development set and present the outcome as independent evaluation.**

## Reproducibility requirements

| Requirement | Status |
|---|---|
| Frozen prompt, with hash checked by a test | Verified offline |
| Version-controlled configuration | Implemented, and committed in the freeze commit |
| Deterministic run IDs from prompt, manifest, config, and model | Verified offline |
| Finished runs cannot be overwritten | Verified offline |
| Raw responses stored | Verified offline |
| Separate failure and retry records | Verified offline |
| SHA-256 hashes for downloaded images | Verified at Stage C: 39 of 39 |
| Manifest, inventory, licence, and exclusion consistency | Verified offline; `--check` includes it |
| Traceable manifest changes | Implemented in `manifest_changes.csv` |
| Crops recorded with hashes, boxes, and review, and originals preserved | Verified at Stage C.1: 7 crops and 40 originals |
| Configuration validated and loaded, with changed gates or prompt refused | Verified offline |
| Results by famous-object and printed-plate subgroup | Verified offline on synthetic data |
| Failure analysis output | Verified offline on synthetic data |
| Unknown usage stays unknown | Verified offline |
| Identical synthetic results on re-run, apart from measured latency | Verified offline |
| Spending guard, and stop on fatal errors | Verified offline with fake transports |
| Token and timeout limits inside the hashed configuration | Verified offline |
| Exact bytes sent recorded with each attempt | Verified offline |
| Host pinned for every repetition | Rule Verified offline. Model A's host is set at Stage D, and `--check` reports it until then |
| Metrics rebuilt from a partial run | **Not implemented** (H-11) |

## Synthetic verification

The fixtures keep the Stage B.2 shape of 29 and 10 images on purpose, to test denominators different from the real ones. `python -m src.run --synthetic` replays two invented fixtures through the whole pipeline. Expected values were worked out by hand from the scenarios, and the tests compare them with the output.

| Gate | `synthetic_strong` | `synthetic_weak` |
|---|---|---|
| Top-1 | 22/29, pass | 8/29, fail |
| Top-3 | 25/29, pass | 13/29, fail |
| Rejection | 9/10, pass | 4/10, fail |
| Valid after retry | 114/115, pass | 108/114, pass |
| Reproducibility, in-scope | 24/29, pass | 23/29, fail |

**These are invented numbers.** They show the gates can pass and fail correctly, including at the 24/29 boundary. They say nothing about any model.
