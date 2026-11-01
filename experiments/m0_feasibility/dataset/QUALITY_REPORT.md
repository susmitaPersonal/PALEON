# Dataset Quality Report

> **Version:** 0.4 | **Date:** 2026-11-01 | **Stage:** C.2 | **Basis:** manifest metadata, plus visual inspection of all downloaded images and crops

Stage C viewed every image. Its outcomes are in [STAGE_C_REPORT.md](STAGE_C_REPORT.md) and [visual_review.csv](visual_review.csv), and they replace the metadata estimates below where the two differ.

This dataset is **not representative** of worldwide historical writing systems, or of any defined population. It is a small convenience sample for an engineering decision.

## Summary

| Measure | Value |
|---|---|
| Development rows | 40 |
| Rows counted in metrics | 34 (24 in-scope, 10 rejection) |
| Held pending a decision | 3 (SE002, SE010, and SE008 on licence) |
| Excluded after viewing | 2 (SE009, SE028) |
| Not acquired | 1 development row (SE019) and 3 reserves |
| Share of counted rows from the Met | **26 of 34 (76%)** |
| Counted in-scope rows that are printed plates | 3 of 24 (SE003, SE004, SE005) |
| Counted in-scope rows flagged as famous | 6 of 24 |
| Rows with a viewed image | 39 of 40 |

## Severity

| Finding | Severity | Why |
|---|---|---|
| Printed captions name the site | **Resolved for counted rows** | All 6 plates are cropped, cleared, or uncounted |
| Brahmi and Kharosthi are thin | **High** | Brahmi has 4 counted images and Kharosthi 2, so the hardest contrast rests on 6 images |
| Plates cannot be excerpted cleanly | **Resolved for SE003 and SE004 by Q-10** | SE010 has numbers printed on its impression, so it stays held |
| Source concentration | **High** | 76% of counted rows come from one museum |
| Framing differs after cropping | **Medium** | Close crops may act as a cue |
| Source follows class | **High** | Phoenician and runic each come from a single source |
| Modern marks and paint | **Medium** | Catalogue marks and conservators' paint are not part of the original writing |
| Art style can reveal the class | **Medium** | Sculpture and Egyptian figures offer a shortcut |
| Possible training exposure | **High** | Cannot be measured or excluded |
| Easy negatives | **High** | Neither resembles writing, and no harder example has qualified |
| Evidence for SE001 rests on one institution | **Medium** | A published parallel exists, on a different object |
| Small class sizes | **Medium** | Per-script results are descriptive only |
| Accession conflict on two caskets | **Medium** | Metadata needs correcting; script is unaffected |
| Greek has 4 rows | **Low** | Slight imbalance |

## Museum and institutional collection bias

| Source | Counted rows | Classes |
|---|---|---|
| The Metropolitan Museum of Art | 26 | Phoenician, Greek, Latin, Kharosthi, cuneiform, hieroglyphs, no writing |
| Hultzsch 1925 plates | 6 | Brahmi, Kharosthi |
| Swedish History Museum | 5 | Runic |
| Cleveland Museum of Art | 1 | Brahmi |
| British Library, via International Dunhuang Project | 1 | Kharosthi |

Effects to expect:

- **Collecting history.** Western museum holdings reflect what was collected and photographed, not what survives. Greek and Latin objects tend to be finer and better preserved than field finds.
- **Single-source classes.** All 5 Phoenician rows are from the Cesnola Collection, and all 5 runic rows are from one Swedish museum series. A model could pick up lighting or backdrop, with no need to read.
- **Open licensing as a filter.** Choosing CC0 and public-domain sources excludes much South Asian material held in regional museums, which is why that class leans on a 1925 publication.
- **Label availability as a filter.** Rows were kept because a record names the script, so well-catalogued objects are over-represented.

## Printed plates versus photographs

Viewing added a worse problem than the medium itself: all six plates print the site name. Crops removed the captions, and Stage C.1 outcomes are in the [Stage C report](STAGE_C_REPORT.md). The analysis below was written before cropping.

| Class | Plates | Other |
|---|---|---|
| Brahmi | 4 | 1 |
| Kharosthi | 2 | 3 |
| All other in-scope classes | 0 | 19 |

All 6 plates are in the two South Asian classes. A model could separate "printed plate" from "museum photograph," and that would inflate those classes' scores or their confusion with each other. Plates are also a transcription medium: they show an impression of the inscription, not the object.

**Consequence:** Brahmi versus Kharosthi is the hardest planned contrast, and it is the one this dataset tests least cleanly.

Reports now show plate and photograph results separately. Replace plates with photographs in any held-out set.

## Famous objects and memorization

| Class | Flagged | Examples |
|---|---|---|
| Brahmi | 4 of 5 | Ashokan pillars and rock edicts |
| Kharosthi | 2 of 5 | Shahbazgarhi, Mansehra |
| Runic | 2 of 5 | Istaby, Noleby |
| Latin | 1 of 5 | Altar of Cominia Tyche |

A model that recognizes the Delhi-Topra pillar or an Ashokan edict could answer correctly without reading it. Ashokan edict texts also recur across sites, so the rows share content.

The flags are my judgment, not a measured quantity, and they may miss objects that are well known to specialists.

Reports now give results for famous and printed-plate subgroups separately (Implemented, Verified offline on synthetic data).

## Image quality and inscription visibility

**Assessed at Stage C.** Accepted images are 21 good, 9 fair, and 1 poor. Risks first identified from metadata, kept for reference, are below:

| Risk | Rows |
|---|---|
| Inscription may be small within a sculpture | Cleveland 1982.44.a; Met 08.258.41; Met 38.27 |
| Inscription may be on a surface the main image does not show | Met 1987.142.70, 1987.142.71; amphorae 74.51.2300 and 74.51.2298 |
| Fragmentary text | Met 26.60.5; bowl fragment 74.51.2276 |
| Low resolution | Girnar plate, about 821 px wide |
| Very wide crop | British Library wooden tablet, 1968 × 617 |
| Little connected text | Met 27.122.5, a lettered polyhedron |
| Another script on the same object | Rummindei pillar also carries a later Devanagari inscription |

Stage C applied this rule: SE028 showed no recognisable writing and was excluded, with no image substituted. Stage C.1 excluded SE009, whose signs cannot be separated from speckle.

## Script representation imbalance

| Class | Counted |
|---|---|
| Brahmi, Kharosthi, Phoenician, Latin, Runic | 5 each |
| Greek | 4 |
| Cuneiform, Egyptian hieroglyphs | 4 each |
| No writing | 2 |

The one-row Greek gap is small, but 4 or 5 images per class can only give descriptive results. One image changes a class's recall by 20 to 25 points. Macro averages hide nothing here, but they also cannot rescue the sample size.

The set is also narrow in other ways. It covers no script from Africa beyond Egypt, East or Southeast Asia, or the Americas, and no manuscript tradition apart from one wooden tablet. These are out of MVP scope, and they are not claimed to be covered.

## Similar-looking characters across scripts

These are hypotheses for the confusion matrix to test. They are general expectations, not sourced paleographic claims, and they must not go into the reference collection without sources.

| Pair | Why confusion is plausible |
|---|---|
| Phoenician and early Greek | Related letter shapes. Met 26.60.5 uses pre-Ionic Attic spelling |
| Greek and Latin | Shared capital forms, especially in short texts |
| Brahmi and Kharosthi | Same region and period. Plate medium adds noise |
| Runic and Greek or Latin | Angular carved strokes on stone |
| Short Phoenician texts and undeciphered marks | Few signs to compare |

Hard cases already in the set:

- Met 26.60.69 is Roman by culture and Greek by script.
- Met 27.122.5 shows isolated Greek letters.
- Cesnola objects are Cypriot, a context where other scripts occur.

## Overlap between training data and evaluation examples

**This cannot be measured.** Neither model's training images are published in a form that could be checked against this list.

| Factor | Assessment |
|---|---|
| Public availability | Every row comes from an openly published source, which is what makes it usable and also what makes exposure likely |
| Gemma 4 | Its card states a January 2025 training data cutoff. Long-standing museum images could predate that |
| Qwen3-VL | Training data was not reviewed in this project |
| Commons copies | Well-known plates and photographs are mirrored widely online |
| Upload dates | Not collected for these rows |

Any correct answer may partly reflect memorization. No image here should be described as unseen by a model. A held-out set should favour lesser-known objects, recent uploads, and images not on Wikimedia Commons, while accepting that none of these proves a model has not seen them.

## Label confidence

| Evidence strength | Rows |
|---|---|
| Record or edition names the script | Most counted rows |
| Language tag with a letter-for-letter edition | Met 08.258.41, 26.60.5, X.248.2, X.248.3 |
| Script linked across one passage | Delhi-Topra (Hultzsch pp. xvi-xvii) |
| Corpus assignment | Ramaka casket, by its number in the Corpus of Kharoṣṭhī inscriptions |
| Search excerpt, original page blocked | Rummindei; several Met pages |

No epigrapher has reviewed these labels, and every label was checked by a non-specialist against written sources.

## Recommendations for harder negatives

**Inspected at Stage C.2, and none is accepted.** Three are held and two are excluded. Results are in [STAGE_C_REPORT.md](STAGE_C_REPORT.md). The table below shows the original reasoning.

| Type | Why it is harder | Possible source | Label risk |
|---|---|---|---|
| Incised geometric pattern on pottery | Repeated marks resemble signs | Met Paracas bowl 62.266.45 (reserve row) | Absence of writing is implied |
| Incised decoration on stone | Same material as many inscriptions | Met limestone chest 74.51.5164 (reserve row) | Absence of writing is implied |
| Geometric stamp seals | Small, sign-like motifs | Met Halaf seal 1986.311.1 | Seals often do carry writing elsewhere |
| Grid-incised scaraboid | Small regular marks | Met 74.51.4398 | Check the record |
| Worn stone with cracks or tool marks | Ambiguous, like a damaged inscription | Geological or conservation records | Few records state "no writing" |
| Non-script symbols, such as mason's marks or property marks | Systematic but not writing | Scholarly catalogues | Often debated |

**A caution on gold labels.** Marks whose status is debated, such as undeciphered or disputed sign systems, should **not** be labelled `no_writing`. They belong in a separate class, or out of the dataset. Forcing an answer there would test the label, not the model.

**Suggested rule:** any abstention scores as rejection, so a model that says `insufficient_evidence` on an ambiguous surface is behaving correctly. Keep reporting strict rejection beside it.

**Suggested mix for a future dataset:** one decorative pattern, one damaged surface, and one symbol system, alongside the two easy cases, so that easy and hard results are reported separately.
