# PALEON Master Progress

> **Last updated:** 2026-11-02. A new session resumes from this file, after [SESSION_HANDOVER.md](SESSION_HANDOVER.md).

## Summary

PALEON now has a complete **person-confirmed** path from image to report. It does not read inscriptions by itself. No method has been validated on held-out data, and **automatic sign finding failed on all six real images tried**.

| Measure | Position |
|---|---|
| A. Software implementation | Judgment: about 60 to 65% of the mandate. Automatic sign recognition, language identification, grammar, and most language data are missing |
| B. Functional verification | 915 offline tests passed. Generated images only for the new path |
| C. Research validation | 0%. No held-out sign data, and no expert review |
| D. Historical and linguistic accuracy | Unknown. Not measured |

## Test evidence

`npm test` on 2026-11-02 exited 0: contracts 4, API 352, web 53, browser 38, experiment 468, total **915 passed, 0 failed**. `--check` exited 0, `--live` exited 2, `npm audit` found 0 vulnerabilities, a key-pattern scan found nothing, and `experiments/m0_feasibility` and `docs/ARCHITECTURE.md` show no changes. Of 17 deliberate breaks of the research safeguards, 15 were caught at first, and the 2 test gaps were then closed. A further 3 breaks of the later vision changes were all caught.

Offline tests verify code behaviour only. They never verify a model capability.

## Observed on real inscriptions

**Sign finder, counts only, images not viewed.** All six were flagged as surface texture, and four reached the 400-box limit:

| Row | Boxes | Lines found |
|---|---|---|
| SE005 | 400 | 191 |
| SE006 | 16 | 9 |
| SE011 | 400 | 210 |
| SE016 | 400 | 105 |
| SE022 | 150 | 95 |
| SE026 | 400 | 261 |

The sign finder is therefore usable only on clean, high-contrast marks. On real objects, a person draws the boxes.

**Local vision model, `qwen2.5vl:3b`, development images.** These are anecdotes from a second session's runs, not independent evaluation:

- In scope: 1 of 6 correct at rank 1 (SE016), and 2 of 6 in the top three (adding SE006). SE022 and SE026 abstained.
- The same three scripts, Greek, Kharosthi, and Latin, recur in the candidates, which suggests a prompt or model bias.
- A blank generated image received candidates in both runs, so abstention is not reliable.
- Repeating an input changed its result: SE039 and the noise image failed once and then succeeded.
- Runs took about 200 to 540 s each on an 8 GB M1.

## Requirements traceability

Status words are the mandate's own. "Tested" means offline. Nothing is "Independently validated".

| ID | Requirement | Implementation | Test | Status | Remaining limitation |
|---|---|---|---|---|---|
| R-01 | Foundation: API, typing, errors, conflicts | `apps/api`, `packages/contracts` | API suite | Tested | No deployment path |
| R-02 | Preserve providers and M0 | Unchanged | `--check`, provider tests | Tested | None known |
| R-03 | Image quality measures | `research/vision.ts` | `research.test.ts` | Tested | Fixed thresholds, uncalibrated |
| R-04 | Orientation | Line orientation only | `research.test.ts` | In progress | Rotation is not detected or corrected |
| R-05 | Region and sign detection | `segmentSigns` | Generated shapes | In progress | Failed on 6 of 6 real images |
| R-06 | Script classification beyond one LLM | Not built | None | Not started | Needs labelled data |
| R-07 | Candidates with evidence | Existing analysis, stored in cases | API suite | Tested | Accuracy unknown |
| R-08 | Script registry and add-script workflow | `knowledge/`, `docs/ADDING_A_SCRIPT.md` | `research.test.ts` | Tested | Allographs, related scripts, and expert examples are mostly empty |
| R-09 | Sign inventories, six scripts | `knowledge/sign_inventories/` | `research.test.ts` | Tested | Unreviewed, core signs only |
| R-10 | Manual sign correction | `CasePage`, `research/tokens.ts` | Web and browser | Tested | Boxes are rectangles |
| R-11 | Automatic character recognition | Approved-example comparison | Generated shapes | In progress | Unmeasured on real signs. No trained model |
| R-12 | Ligatures, alternatives, damage, gaps | `SignTokenSchema` | `research.test.ts` | Tested | Context-dependent readings need a person |
| R-13 | Transliteration | `research/transliteration.ts` | `research.test.ts` | Tested | Two schemes per script |
| R-14 | Language identification | A person sets it | `research.test.ts` | Not started | No automatic method, by design for now |
| R-15 | Translation hypotheses | `research/translation.ts` | `research.test.ts` | In progress | Latin seed of 12 entries. No grammar or morphology |
| R-16 | Dataset format and leakage checks | `ResearchDatasetRecordSchema`, `checkDataset` | `research.test.ts` | Tested | No research dataset exists yet |
| R-17 | Dataset import and annotation tools | Validation command, and cases as annotation | `research.test.ts` | In progress | No bulk import or export to the dataset format |
| R-18 | Evaluation framework | `research/evaluation.ts`, `eval:research` | `research.test.ts` | Tested | Never run on held-out data |
| R-19 | Model comparison | Prediction files through `eval:research` | `research.test.ts` | In progress | No memory or hardware capture |
| R-20 | Human review | `ReviewPanel`, review route | API, web, browser | Tested | Qualification is self-declared. No sign-in |
| R-21 | Reports and export | `research/report.ts` | API, browser | Tested | Markdown and JSON only. The image is referenced, not embedded |
| R-22 | Researcher interface | `CasesPage`, `CasePage` | Web, browser, axe | Tested | No zoom. Box drawing needs a pointer |
| R-23 | Local AI health and resources | Ollama checks, `GET /system` | API suite | In progress | No per-task model selection |
| R-24 | Security | Existing controls, UUID checks, origin rules | API suite | Tested | No audit log export. Stored data is unencrypted |
| R-25 | Open-source files and CI | `CONTRIBUTING.md`, `.github/` | Not run on GitHub | Implemented | The CI workflow has not run |

## Blockers and external dependencies

| Dependency | Needed for | Who |
|---|---|---|
| Expert review of sign values and labels | Any "expert-reviewed" claim | A qualified epigrapher |
| Licensed or expert-prepared lexicons and grammars | Real translation | A licensed source |
| Sign-level annotated data, with held-out splits | Measuring recognition | Annotators, with rights checked |
| Stronger hardware or an approved paid route | Better models or training | The owner |

## Decisions

ADR-072 to ADR-075 in [DECISIONS.md](DECISIONS.md).

## Next actions

1. Annotate a small Latin set by hand in cases, using one published edition as the reference.
2. Measure example-based suggestions on it, with a held-out object group.
3. Replace or combine the sign finder, using what that set shows.
4. Add a real Latin lexicon from a source whose terms allow it.
5. Investigate the repeated Greek, Kharosthi, and Latin candidates.
