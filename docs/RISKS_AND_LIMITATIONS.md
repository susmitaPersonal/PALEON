# Risks and Limitations

> **Version:** 0.2 | **Last updated:** 2026-11-01 | **Status:** Active register.

Related: [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), [DATASET_STRATEGY.md](DATASET_STRATEGY.md), [MODEL_EVALUATION.md](MODEL_EVALUATION.md)

Likelihood and impact are judgments, not measurements.

## Technical risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hosted models cannot distinguish historical scripts | Medium to high | Critical | M0 gates before building; narrower scope; guided fallback product |
| Downscaling destroys diagnostic strokes | Medium | High | Provider limits, resolution test, crop tool |
| Structured output is unreliable with images | Medium | Medium | Repair retry, simpler schema, endpoint routing |
| Endpoint changes or disappears | Medium | Medium | Pinned IDs, second gateway, dated catalog checks |
| Latency exceeds the deadline | Medium | Medium | Disable thinking, cap output, choose a faster host |
| A provider ignores `seed` or a parameter | Medium | Low | Measure at Stage D; repetitions show the effect |
| Harness pieces fail when joined | Medium | Medium | Add an end-to-end offline run before Stage D |
| Demo abuse, or budget runs out | Medium | Medium | Key limit, daily budget, demo mode |
| Free-tier cold start | High | Low | Warm in advance; recorded walkthrough |

## Historical accuracy risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reference records contain subtle errors | Medium | High | Source every claim; expert review; corrections route |
| Sources disagree, for example on dating | Medium | Medium | Show the disagreement. Met sources give 15–16 CE and 5–6 CE for one reliquary |
| Visual similarity read as descent | Medium | High | Fixed caveat on comparisons |
| Script confused with language | Medium | Medium | Keep the operations separate |
| Users overtrust results | Medium | Medium | Evidence labels, no percentages, expert-review prompts |

## Model limitations

- No capability is established. **Nothing has been measured.**
- Vendor claims about ancient characters are unverified.
- Model confidence is not calibrated probability, so none is displayed.
- Models may recognize famous objects instead of reading them.
- A model given six labels tends to choose one.
- Hosted output can vary even at temperature 0.

## Dataset limitations

The full assessment is in [QUALITY_REPORT.md](../experiments/m0_feasibility/dataset/QUALITY_REPORT.md).

- The dataset is a convenience sample, and it is not representative of worldwide writing systems.
- 29 of 30 in-scope labels count. Greek has 4 rows, because Met 26.60.6 stays uncounted.
- 4 of 5 Brahmi rows are both printed plates and famous objects, so Brahmi results are confounded.
- Baums 2012 and the Met number two caskets in opposite ways. Script labels are unaffected.
- Training exposure cannot be measured or excluded for any image.
- No image has been viewed, so inscriptions may not be visible in some of them.
- Labels were checked by a non-specialist, not by an epigrapher.
- Phoenician is all from one Met collection, and runic is from one museum series.
- 6 of 10 Brahmi and Kharosthi rows are printed plates, not photographs.
- 9 of 40 rows are famous objects.
- Both no-writing rows are easy negatives. Recommendations exist, and none is adopted.
- Some evidence came from search excerpts, because Met pages returned HTTP 429 and UNESCO pages returned HTTP 403. Those rows are marked.
- The set is a convenience sample, so it cannot establish general accuracy.

## Licensing risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Commons licence status is wrong | Low to medium | High | Recheck each file at Stage C |
| CC BY attribution omitted | Medium | Medium | Manifest stores exact text |
| Unicode charts redistributed | Low | High | Link only; render glyphs from an open font |
| Encyclopaedia text copied | Low | High | Paraphrase, cite, and link |
| Model licence differs from its badge | Low | Medium | Read the licence file at Stage D |

## Process risks

| Risk | Mitigation |
|---|---|
| Prompt tuned on development data, then reported as independent | Rule in [CLAUDE.md](../CLAUDE.md); held-out set |
| Thresholds shift after results | Gates fixed as fractions, and a test ties code to `config/run.yaml` |
| Context lost between sessions | [SESSION_HANDOVER.md](SESSION_HANDOVER.md) |
| Scope grows and the release slips | Cut order in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |

The two highest risks are not engineering risks: whether the model can do the task at all, and whether trustworthy labelled data can be obtained.
