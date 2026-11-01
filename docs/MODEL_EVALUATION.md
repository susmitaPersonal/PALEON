# Model Evaluation

> **Version:** 0.2 | **Last updated:** 2026-11-01 | **Status:** Methodology Approved for M0. Metrics code Verified offline on synthetic data. **No model results exist.**

Related: [METHODOLOGY.md](../experiments/m0_feasibility/METHODOLOGY.md), [DATASET_STRATEGY.md](DATASET_STRATEGY.md), [MODEL_COMPARISON.md](MODEL_COMPARISON.md)

[METHODOLOGY.md](../experiments/m0_feasibility/METHODOLOGY.md) holds the fixed M0 protocol. This document covers the wider evaluation approach.

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
| Valid output rate | repetitions with valid output / repetitions where the model answered |
| API failure rate | attempts with a provider failure / all attempts |
| Reproducibility | images with 3 identical valid labels / all images |
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
| Top-1 accuracy | At least 1/2. Currently **15/29** | Approved; Verified offline |
| Top-3 recall | At least 4/5. Currently **24/29** | Approved; Verified offline |
| Rejection | At least **7/10** | Approved; Verified offline |
| Valid output after retry | At least 90% | Approved; Verified offline |
| Reproducibility | At least 80%. Currently **32/39** | Approved; Verified offline |

**Required count:** the fraction of the actual denominator, rounded up. The approved values for 22 images were 11/22 and 18/22. Stage B.1 verified 7 more images, so the current values are 15/29 and 24/29. Recalculate whenever verified counts change, including after Stage C review.

**Always report:** raw numerator, denominator, percentage, confidence interval, and dataset limitations. The report generator prints all of these.

Also required, with no threshold: per-script metrics, the confusion matrix, confidence intervals, model errors kept apart from provider failures, and results before and after retries.

These gates are not scientific proof of general accuracy. **Do not claim 88% accuracy from these development experiments.** That figure is a separate research target, for a defined task on held-out data, stated with its interval.

## Statistical limitations

| Result | 95% Wilson interval |
|---|---|
| 15 of 29 | 34% to 69% |
| 24 of 29 | 65% to 92% |
| 11 of 22 | 31% to 69% |
| 18 of 22 | 61% to 93% |
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
| Status | Metadata only | Not collected |
| Planned size | 40 images | 60 in-scope, 10 out-of-scope, 10 no-writing, 10 damaged |
| Claims allowed | Engineering gates only | Measured results with intervals |

**Do not tune on the development set and present the outcome as independent evaluation.**

## Reproducibility requirements

| Requirement | Status |
|---|---|
| Frozen prompt, with hash checked by a test | Verified offline |
| Version-controlled configuration | Implemented, not yet committed |
| Deterministic run IDs from prompt, manifest, config, and model | Verified offline |
| Finished runs cannot be overwritten | Verified offline |
| Raw responses stored | Verified offline |
| Separate failure and retry records | Verified offline |
| SHA-256 hashes for downloaded images | Planned for Stage C |
| Configuration loaded by the runner | **Not implemented** |
| Results by famous-object subgroup | **Not implemented** |
| Failure analysis output | **Not implemented** |
