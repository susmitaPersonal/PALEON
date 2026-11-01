# Risks and Limitations

> **Version:** 0.8 | **Last updated:** 2026-11-01 | **Status:** Active register.

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
| Harness behaves differently on real data | Medium | Medium | All 34 accepted images pass preprocessing; Stage D canary comes before any full run |
| A captioned original reaches a model | Low | High | Cropped rows refuse to load anything but their crop; verified by test |
| A source changes or removes a file | Low | Medium | SHA-256 check fails loudly on re-fetch |
| Bulk fetching is rate-limited | Medium | Low | Honour `retry-after`, as done at Stage C |
| Demo abuse, or budget runs out | Medium | Medium | Key limit, daily budget, demo mode |
| Free-tier cold start | High | Low | Warm in advance; recorded walkthrough |

## Product MVP limitations

| Limitation | Effect |
|---|---|
| Demo results are fixtures chosen by image hash or scenario | They say nothing about the image, and the interface says so |
| The product prompts have never been run | They may need changes, and prompt tuning must stay apart from independent evaluation |
| Local inference has not run | Memory, speed, and JSON quality on 8 GB are unknown. A 1,024 px image edge may lose strokes, and a small model may do poorly on these scripts |
| A local result is not an M0 result | It uses a different model, prompt, and code path |
| The real adapter has only met a fake `fetch` | Real providers may differ in image, schema, or usage behaviour |
| Evidence strength has no check on truth | False statements in visual words still pass and can rate moderate. Strong cannot be reached today (ADR-065) |
| The vocabulary rule checks words, not truth | A false statement in reviewed words can pass, so model text stays labelled unverified |
| The vocabulary may reject correct evidence | Unlisted words and other languages are dropped, which can force an abstention. The rate is unmeasured |
| Records are source-checked by a non-specialist | No epigrapher has reviewed them. Brahmi direction and Greek and Latin period and region are empty |
| Reference characters are modern Unicode forms | They are not attested letter shapes |
| Script fonts come from the viewer's system | Characters may show as boxes |
| No crop tool, or transcription | Users must crop before uploading |
| Results are lost on reload | This is deliberate, as nothing is stored |
| Local use only | See the [deployment gaps](SECURITY_AND_PRIVACY.md#gaps-before-any-public-deployment) |
| Accessibility is tested with axe and a keyboard flow | No screen reader user has tested it |

## Historical accuracy risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reference records contain subtle errors | Medium | High | Source every claim; expert review; corrections route |
| Sources disagree, for example on dating | Medium | Medium | Show the disagreement. Met sources give 15–16 CE and 5–6 CE for one reliquary |
| Visual similarity read as descent | Medium | High | Fixed caveat on comparisons |
| Script confused with language | Medium | Medium | Keep the operations separate |
| Users overtrust results | Medium | Medium | Evidence labels, no percentages, expert-review prompts |

## Model limitations

Synthetic results are invented, and they must never be quoted as model performance.

- No capability is established. **Nothing has been measured.**
- Vendor claims about ancient characters are unverified.
- Model confidence is not calibrated probability, so none is displayed.
- Models may recognize famous objects instead of reading them.
- A model given six labels tends to choose one.
- Hosted output can vary even at temperature 0.

## Dataset limitations

The full assessment is in [QUALITY_REPORT.md](../experiments/m0_feasibility/dataset/QUALITY_REPORT.md).

- The dataset is a convenience sample, and it is not representative of worldwide writing systems.
- 24 of 30 in-scope images count: Brahmi 4, Kharosthi 2, Phoenician 5, Greek 4, Latin 5, Runic 4.
- **The Brahmi and Kharosthi contrast rests on 6 images**, so it is the weakest part of the dataset. Kharosthi has only 2.
- 3 of 4 Brahmi images are printed plates, so "plate" may act as a cue for Brahmi. SE003's signs are small at model size, and its upper half is worn.
- Six plates printed the site name. All are now cropped, cleared, or uncounted.
- SE010 has numbers printed on its impression, and SE002 keeps about 45%, so both stay held.
- Close crops may act as a framing cue, because most other images show whole objects.
- 26 of 34 counted rows come from the Met.
- Modern catalogue marks, conservators' paint, and art style may act as cues.
- Baums 2012 and the Met number two caskets in opposite ways. Met records and images agree, but this is not independently resolved.
- Training exposure cannot be measured or excluded for any image.
- Visual review was a non-specialist check of visibility, not of readings.
- Labels were checked by a non-specialist, not by an epigrapher.
- Phoenician is all from one Met collection, and runic is from one museum series.
- 6 of 10 Brahmi and Kharosthi rows are printed plates, not photographs.
- 9 of 40 rows are famous objects.
- Both no-writing rows are easy negatives. All five harder candidates were inspected, and none qualifies, so rejection may be overstated.
- SE001's label rests on one institution. A published parallel exists on a different object.
- Whether a mark is decoration or symbol cannot be settled by appearance.
- Some evidence came from search excerpts, because Met pages returned HTTP 429 and UNESCO pages returned HTTP 403. Those rows are marked.
- The set is a convenience sample, so it cannot establish general accuracy.

## Licensing risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Commons licence status is wrong | Low to medium | High | All 12 rechecked at Stage C. SE008 is held until independently verified |
| An uncounted image is redistributed | Low | High | Images are gitignored, and tools act only on accepted rows |
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
