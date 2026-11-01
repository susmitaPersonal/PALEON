# Stage C Report: Image Acquisition and Dataset Validation

> **Version:** 0.4 | **Date:** 2026-11-01 | **Status:** Q-10 applied. Nothing committed.

## Q-10 update: current state

**Summary:** the counted dataset is now **24 in-scope and 10 rejection images**. SE003 and SE004 passed inspection as whole-plate `complete` samples. SE010 stays held. No label changed, the prompt is unchanged, and no model was called. This supersedes the sections below wherever they differ. Scope and conditions are in ADR-064.

| Plate | Result | Regions cleared | Sent to a model | Inspection at model size |
|---|---|---|---|---|
| SE003 | **Accepted**, `complete` | 50 | 2048 × 1332, 1,576 KB | No caption or number left. Lower half clear. Upper half worn, and signs are small |
| SE004 | **Accepted**, `complete` | 19 | 2048 × 1184, 903 KB | No caption or number left. Legible on creased impressions. Two panels on one sheet |
| SE010 | **Held** | 0 | Not sent | Numbers 2, 4, 10, 12, and 14 are printed on or at the inked impression, and those pixels may not change |

- **Proved by test:** blanking the recorded regions in both the original crop and the output leaves them pixel-identical, so nothing else changed. Originals are unchanged.
- **Regions:** found by a detector, then reviewed on overlays. Six rock-edge detections failed the paper check, and one was dropped by review. Captions use one block each, after per-letter regions left traces on SE004.
- **Residual check:** a contrast-stretched view of the paper shows only speckle, with no digit or letter shapes.
- **Fill:** the local paper tone measured `ffffff` or `fefefe`, so fills are not visible as patches.
- **Earlier crops:** kept in `data/processed/superseded/`, which is gitignored.

**New cue risk:** 3 of 4 Brahmi images are now printed plates, and no counted Kharosthi image is. A model could separate the two by medium. Read any Brahmi and Kharosthi result with that in mind.

| Gate | Fraction | Required now |
|---|---|---|
| Top-1 | 1/2 | **12/24** |
| Top-3 | 4/5 | **20/24** |
| Reproducibility, in-scope | 4/5 | **20/24** |
| Rejection | 7/10 | **7/10** |
| Valid output after retry | 90% | **92/102**, if all repetitions are answered |

These are preliminary engineering gates, not results.

## Stage C.2 update: current state

**Summary:** the counted dataset stays at **22 in-scope and 10 rejection images**. SE003, SE004, and SE010 were conditionally approved as excerpts, and **all three failed the check for clipped characters**, so they stay held. No hard negative counts: 3 are held and 2 are excluded. No label changed, the prompt is unchanged, and no model was called.

This supersedes the Stage C.1 section below wherever the two differ. The expected count of 25 was not reached, and it was not forced.

| Item | Status |
|---|---|
| Excerpt rule and separated metrics | Approved; Implemented; Verified offline |
| Accepted excerpts | None |
| Margin clearing for full plates | Implemented. See the Q-10 update |

### Decisions on the excerpts

| Image | Legible | Captions and numbers gone | Characters clipped | Decision | Reason |
|---|---|---|---|---|---|
| SE003 | Partly. Lower half clear, upper half worn | Yes | **Yes**, on all four edges | **Held** | Text runs up to the plate margin, so the box cuts signs on every side |
| SE004 | Yes | Yes | **Yes**, along the bottom edge | **Held** | Lines slope, so a horizontal edge passes through a line of characters at the left while the centre needs it lower |
| SE010 | Partly. Noisy surface | Yes | **Yes**, along the edges | **Held** | The box cuts signs, and much of the surface stays noisy |
| SE002 | Yes, slightly blurred | Yes | Yes | **Held, by your decision** | About 45% kept, from a blurred photograph of a book page. Not counted |

All four are marked `sample_type=excerpt` and `evaluation_scope=script_identification_only`, so the marking survives if any is later accepted. Originals and crop provenance are unchanged.

**Why a rectangle cannot pass.** On these plates, text reaches the edge of the impression, and printed numbers sit just beyond it. A box must either cut signs or include numbers.

**Proposal, not applied.** The numbers sit on blank paper, outside the inked impression. Painting only those blank-paper regions white would remove them while keeping every inscription pixel, so a whole plate could be used with no clipping. This would change pixels, so it needs your approval. If approved and passed on inspection, SE003, SE004, and SE010 would be whole-plate samples, not excerpts. That is a projection, not a result.

### Dataset count by class and status

| Class | Target | Accepted | Held | Excluded | Not acquired |
|---|---|---|---|---|---|
| Brahmi | 5 | **2** | 3 | 0 | 0 |
| Kharosthi | 5 | **2** | 2 | 1 | 0 |
| Phoenician | 5 | 5 | 0 | 0 | 0 |
| Greek | 5 | 4 | 0 | 0 | 1 |
| Latin | 5 | 5 | 0 | 0 | 0 |
| Runic | 5 | 4 | 0 | 1 | 0 |
| **In-scope** | **30** | **22** | **5** | **2** | **1** |
| Cuneiform | 4 | 4 | 0 | 0 | 0 |
| Egyptian hieroglyphs | 4 | 4 | 0 | 0 | 0 |
| No writing | 2 | 2 | 0 | 0 | 0 |
| **Rejection** | **10** | **10** | **0** | **0** | **0** |

All 22 counted in-scope rows are `sample_type=complete`, and no excerpt counts. "Complete" means that no visible inscription in the source image was cropped away. It does not mean the whole object's text is visible.

### Reporting separation (Implemented; Verified offline)

Reports now give complete and excerpt results separately, per script results, and rejection for each rejection class: cuneiform, Egyptian hieroglyphs, and no writing. No model results exist, so these are empty structures, not findings.

### Evaluation thresholds

Unchanged from Stage C.1: top-1 **11/22**, top-3 **18/22**, reproducibility **18/22**, rejection **7/10**, and valid output 90%. These are preliminary engineering gates.

### Hard-negative inspection

All records were rechecked live before download: public domain, with matching accession. All views are in the gitignored `data/hard_negatives/`, which no evaluation path reads. Hashes are in [hard_negative_images.csv](hard_negative_images.csv), and the review is in [hard_negative_review.csv](hard_negative_review.csv). Reuse is CC0, with credit suggested.

These are visual observations by a non-specialist. Historical claims are recorded separately, and decorative appearance is not treated as proof.

| Object | Accession | Views, largest | Observed | Could be writing or symbolic? | Status | Why |
|---|---|---|---|---|---|---|
| Paracas bowl | 62.266.45 | 1, 3456×2304 | Incised chevrons and steps, punched dots | No sign-like units seen, but only one side is shown | **Held** | Best candidate. One view cannot cover the surface, and no source supports the label |
| Cypriot limestone chest | 74.51.5164 | 1, 2000×2000 | Incised zigzags and dotted triangles | No sign-like units seen. **Modern number 1665 is painted on a leg** | **Held** | Modern digits would need removing, and other faces are unseen |
| Halaf stamp seal | 1986.311.1 | 4, 4000×2666 | Grid with crossed diagonals, cast impression, animal-shaped body | Possibly. A seal exists to mark | **Held** | Whether its marks are non-symbolic needs scholarly support |
| Cypriot scaraboid | 74.51.4398 | 1, 97×120 | Curved shapes, **not the grid in its title** | Cannot be judged | **Excluded** | Too small, and the image does not match its title |
| Egyptian cowroid amulet | 27.3.367 | 3, 1682×2066 | Papyrus umbels and looped knot | **Yes.** These motifs belong to the Egyptian sign and amulet repertoire | **Excluded** | Ambiguous by nature. Labelling it no-writing would test the label, not the model |

**Accepted: 0.** Harder negatives remain recommended, because neither current negative resembles writing. The chest and the bowl are the most promising, if labels can be supported.

### Casket accession conflict: status

**Narrowed, not independently resolved.**

| Evidence | Indravarman casket | Ramaka casket |
|---|---|---|
| Met record, read live | 1987.142.70a,b, Diam. 9.2 cm | 1987.142.71a,b, H. 7.5 cm, Diam. 5.4 cm |
| Downloaded image | Spherical | Ovoid |
| Baums 2012 | 1987.142.71a,b, spherical | 1987.142.70a,b, ovoid |

The Met's title, dimensions, and image agree with each other, and the holding institution's number is the one the dataset uses. Baums agrees on the shapes and differs only in the numbers, which suggests that they were transposed there. That is an inference, not a finding.

Sources that could settle it were not reachable: Behrendt 2007 is not online, the Salomon and Schopen article is behind bot protection, gandhari.org entries do not load, and Met pages return HTTP 429. Search excerpts also suggest that the Met's own page text for the Ramaka casket names Indravarman, which needs a direct reading. Asking the Met's Asian Art department would settle this. **Script labels are unaffected.**

### Evidence for SE001's Brahmi label

| Evidence | Finding | Status |
|---|---|---|
| Cleveland record, read live | `inscription_remark`: "Brahmi script". Text "Mitasa suchi danam" | **Holding institution** |
| Lüders, Bharhut Inscriptions (CII II.2, 1963), read in full-text scan | A 101 (847) edits **the same words**, Mitasa suchi danam, "ON a rail-bar, now in the Indian Museum, Calcutta" | **A parallel, on a different object** |
| Same edition | Prepared as Lüders's work on Brahmi inscriptions, and it compares Bharhut letters with those of Asoka | Supports Bharhut as a Brahmi corpus |
| Pal 1977; Lee 1983 | Cited by Cleveland | Not accessed |
| The label check by eye | Non-specialist, not a reading | Not evidence |

**Conclusion:** SE001 stays `verified_institution`, resting on the holding institution. **No independent source was found for this object.** Lüders shows that the same formula is a recorded Bharhut inscription, but the Cleveland piece came through the Pan-Asian Collection, and the edited rail-bar is in Calcutta. It may be a second gift by the same donor, or the relationship may be something else.

### Licence and attribution

| Item | Status |
|---|---|
| 32 accepted rows | Clear: 27 CC0, 4 CC BY 4.0, and 1 public domain |
| SE008 | Held. Redistribution unknown. No workaround attempted |
| 5 hard negatives | CC0, uncounted |
| Rummindei label evidence | UNESCO pages return HTTP 403, so it still rests on search excerpts |

---

## Stage C.1 update: current state

**Summary:** 7 held images were cropped and inspected. 2 were accepted, 1 was excluded, and 4 stay held because their approved crops do not keep the complete inscription. SE008 moved to held. **22 in-scope and 10 rejection images now count.** No label changed, the prompt is unchanged, and no model was called.

**Open decision:** four crops keep only 45% to 80% of the inscription. Coordinates cannot satisfy both "use the documented box" and "preserve the complete inscription" for these plates, so they were not accepted.

### Counts

| Status | Rows |
|---|---|
| Accepted | 32 (22 in-scope, 10 rejection) |
| Held | 5 (SE002, SE003, SE004, SE008, SE010) |
| Excluded | 2 (SE009, SE028) |
| Not acquired | 4 (SE019, RS001 to RS003) |
| **Total** | **43** |

### Script distribution

| Class | Target | Accepted | Held | Excluded | Not acquired |
|---|---|---|---|---|---|
| Brahmi | 5 | **2** | 3 | 0 | 0 |
| Kharosthi | 5 | **2** | 2 | 1 | 0 |
| Phoenician | 5 | 5 | 0 | 0 | 0 |
| Greek | 5 | 4 | 0 | 0 | 1 |
| Latin | 5 | 5 | 0 | 0 | 0 |
| Runic | 5 | 4 | 0 | 1 | 0 |
| **In-scope** | **30** | **22** | **5** | **2** | **1** |
| Cuneiform | 4 | 4 | 0 | 0 | 0 |
| Egyptian hieroglyphs | 4 | 4 | 0 | 0 | 0 |
| No writing | 2 | 2 | 0 | 0 | 0 |
| **Rejection** | **10** | **10** | **0** | **0** | **0** |

### Crop results

Crops are lossless PNG, with no resampling, using the approved coordinates exactly. Details are in [crop_metadata.csv](crop_metadata.csv) and [crop_review.csv](crop_review.csv). Previews are in the gitignored `data/previews/`.

| Image | Crop size | Kept | Captions gone | Characters intact | Quality | Complete | Decision |
|---|---|---|---|---|---|---|---|
| SE001 | 620 × 230 | Whole text | Not applicable | Yes | Fair | Yes | **Accepted** |
| SE005 | 835 × 570 | 97% | Yes | Yes | Good | Yes | **Accepted** |
| SE010 | 4488 × 2795 | 80% | Yes | Partly | Fair | No | Held |
| SE004 | 5316 × 1373 | 69% | Yes | Partly | Fair | No | Held |
| SE003 | 2970 × 2555 | 64% | Yes | Partly | Fair | No | Held |
| SE002 | 455 × 255 | 45% | Yes | Yes | Fair | No | Held |
| SE009 | 2770 × 1590 | 98% | Yes | No | Poor | Yes | **Excluded** |

"Kept" is the share of dark impression pixels inside the box. It is a proxy for inscribed surface, not a count of characters.

**SE009:** at model size, signs have the same brightness and thickness as the surrounding speckle, and few can be separated. Its caption is gone, but too little genuine evidence is readable. SE010, in the same style, shows clearly separable signs.

**Clues that remain:** SE005 still looks like a printed plate of a famous text. SE001's crop removes the sculpture entirely, which also removes the art-style cue.

### SE001 replacement

| Check | Result |
|---|---|
| Same record | Accession 1982.44.a, title and record URL match, read live |
| Licence | CC0, read live |
| Dimensions | 3400 × 2666, matching the record |
| Pixel correlation with the original web file | 0.99996 |
| Replacement SHA-256 | `975d5ff892397d4c8a57c52ca8fd76468205b136958426161adf80a784dea9e4` |
| Original acquisition | Retained: `SE001.jpg`, its inventory entry, and `image_file_url` are unchanged |
| Label | Unchanged, Brahmi |

Full details are in [replacement_images.csv](replacement_images.csv).

### SE008

Research metadata is retained. It is now **held**, with `redistribution=unknown`. It is not counted, not redistributed, and it cannot be fetched into any dataset by the tools, which act only on accepted rows. Its gitignored local file remains on this machine.

### Updated bias analysis

- **Source:** 26 of 32 counted rows (81%) come from the Met.
- **Brahmi and Kharosthi are the weakest classes**, with 2 each, so their contrast, the hardest planned one, rests on 4 images. One image moves a class's recall by 50 points.
- **Brahmi media are mixed:** SE001 is a photograph, and SE005 is a printed plate of a famous text.
- **Plates:** 1 of 22 counted in-scope rows. Famous objects: 4 of 22.
- **Label strength:** 25 institutional and 7 publication labels.
- **Quality of counted images:** 22 good, 9 fair, and 1 poor.
- **Crops change the task:** SE001 and SE005 show close views, while most others show whole objects. A model could treat a tight frame as a cue.

### Updated evaluation thresholds

| Gate | Fraction | Now (n=22) | 95% CI at gate | With 4 partial crops (n=26) | Also with SE008 (n=27) |
|---|---|---|---|---|---|
| Top-1 | 1/2 | **11/22** | 31% to 69% | 13/26 | 14/27 |
| Top-3 | 4/5 | **18/22** | 61% to 93% | 21/26 | 22/27 |
| Reproducibility, in-scope | 4/5 | **18/22** | 61% to 93% | 21/26 | 22/27 |
| Rejection | 7/10 | **7/10** | 40% to 89% | 7/10 | 7/10 |
| Valid output after retry | 90% | Calls answered | | Calls answered | Calls answered |

These are preliminary engineering gates, and they do not show general accuracy. Do not claim 88% accuracy from this dataset.

### Licence and attribution

Credits are in [ATTRIBUTION.md](ATTRIBUTION.md). All 32 accepted rows have clear licences: 27 CC0, 4 CC BY 4.0, and 1 public domain. SE008 is the only unresolved licence.

### Hash inventories

[sha256sums.txt](sha256sums.txt) covers 40 original files, and [sha256sums_processed.txt](sha256sums_processed.txt) covers 7 crops. Both verified: 40 OK and 7 OK. Originals are in `data/images/`, set read-only. Crops are in `data/processed/`.

### Hard negative research

[hard_negative_candidates.csv](hard_negative_candidates.csv) records all five. **None was downloaded or viewed, and none counts.**

| Object | Accession | Decorative symbols | Can absence of writing be verified? |
|---|---|---|---|
| Paracas incised bowl | 62.266.45 | Yes, geometric | No. No record says so |
| Cypriot limestone chest | 74.51.5164 | Yes, geometric ornament | Partly. Described as ornament only |
| Halaf stamp seal | 1986.311.1 | Yes. May also depict a hedgehog | Partly. Very early date, but needs its own source |
| Cypriot scaraboid | 74.51.4398 | Yes, grid | No. No object page found |
| Egyptian cowroid amulet | 27.3.367 | Yes. Papyrus umbels can be hieroglyphs | No. Weakest candidate |

No source states that any of these has no writing. They all stay unusable until the images are viewed and the label has independent support.

### Remaining gaps

- Whether partial crops may count, or whether masking should be used instead.
- SE008's licence.
- Too few Brahmi and Kharosthi images for a meaningful contrast.
- Hard negatives need an approved image review.
- Met and UNESCO pages stay unreadable directly, so some facts rest on search excerpts.

---

*Everything below records Stage C as reported, and is superseded by the update above wherever the two differ.*

**Summary:** 39 images were downloaded and all were inspected. 21 in-scope and 10 rejection images are accepted. 7 are held pending a decision, and 1 is excluded. No script label changed. No model or provider was called, and no money was spent.

**Blocking finding:** with held images out, **Brahmi has no counted images**. The experiment should not run until the crop proposal is decided.

This dataset is a small convenience sample. It is **not representative** of worldwide historical writing systems.

## 1. Final image inventory

| Group | Rows | Images on disk |
|---|---|---|
| Accepted | 31 | 31 |
| Held, pending approval | 7 | 7 |
| Excluded after review | 1 | 1 |
| Not acquired: SE019, unverified label | 1 | 0 |
| Not acquired: reserve rows | 3 | 0 |
| **Total** | **43** | **39** |

The inventory is [image_inventory.csv](image_inventory.csv), with source record, URL, format, colour mode, dimensions, bytes, hash, and retrieval time. Files total 166 MB, in the gitignored `data/images/` folder, named by image ID.

For all 12 Commons files, API-reported dimensions and byte size match the downloaded files, because originals were fetched. The manifest kept Cleveland's web file for SE001, which is smaller than the record's 3400 × 2666 and 7297 × 5722 versions.

## 2. Verified-label inventory

| Label evidence | Rows counted |
|---|---|
| `verified_institution` | 25 |
| `verified_publication` | 6 |
| **Accepted rows** | **31** |

All 39 downloaded images have verified labels. Held and excluded rows keep their labels, and they simply do not count. **Script labels changed: 0.**

## 3. SHA-256 manifest

[sha256sums.txt](sha256sums.txt) lists all 39 files. From `data/images/`, this verifies them:

```bash
shasum -a 256 -c ../../dataset/sha256sums.txt
```

Observed: 39 OK. Hashes also sit in `manifest.csv`. Screening found no duplicate hashes. The closest image pair differs by 67 of 240 perceptual bits, so no near-duplicates were found.

## 4. Attribution report

Per-image credits are in [ATTRIBUTION.md](ATTRIBUTION.md).

| Source | Images | Requirement |
|---|---|---|
| The Metropolitan Museum of Art | 26 | CC0, credit suggested |
| Cleveland Museum of Art | 1 | CC0, credit suggested |
| Hultzsch 1925, via Wikimedia Commons | 6 | Public domain, credit recommended |
| Swedish History Museum, via Wikimedia Commons | 5 | **CC BY 4.0, credit required** |
| British Library / IDP, via Wikimedia Commons | 1 | Public domain per Commons, credit recommended |

## 5. Licence report

All 39 records were re-read on 2026-11-01, before any download.

| Check | Result |
|---|---|
| Met: `isPublicDomain`, image URL, accession | 26 of 26 match |
| Cleveland: `share_license_status` | CC0 |
| Commons: file page licence templates | 12 of 12 explicit, URLs match |

**Noted:**

- SE008 is tagged `PD-OLD`, which by itself covers an old object, not a modern photograph. It also carries permission ticket 2012102610006645, in which Wikimedia records that the copyright holder approved publication. The ticket is not public, and IDP's own terms say that its content varies by institution. Downloaded, with this caveat recorded. If you prefer stricter handling, SE008 can be excluded.
- SE002 to SE005, SE009, and SE010 are from a 1925 book, by an author who died in 1927.

## 6. Visual quality report

Every image was inspected, and full results are in [visual_review.csv](visual_review.csv). Doubtful images were re-examined at the 2048-pixel size a model would receive.

| Measure | Accepted (31) |
|---|---|
| Quality good / fair / poor | 21 / 9 / 1 |
| Writing clearly visible | 29, plus 2 no-writing objects with none |
| Fully readable / partly readable | 22 / 7 |
| Printed plates | 0 |
| Famous objects | 3 |

The review was a non-specialist visual check. It judges whether marks are visible, not whether a reading is correct.

**Findings metadata could not reveal:**

| Finding | Rows | Effect |
|---|---|---|
| **Site name printed on the plate** | SE002, 3, 4, 5, 9, 10 | A model could name the script from the caption. Held |
| Inscription nearly invisible in the frame | SE001 | Held |
| No recognisable writing | SE028 | Excluded |
| Modern catalogue marks in Latin characters | SE011, 12, 14, 27 | Possible confusion |
| Runes painted in by modern conservators | SE027, 29, 30 | Colour may be a cue. SE030 is a full colour reconstruction |
| Art style may reveal the class | SE020, 23, 30, 35 to 38 | Possible shortcut |
| Scale bars with text | SE008, 26, 27, 29, 30 | Runic images share a look |
| Very small text | SE013, 15, 20 | Hard, retained |

Checks that SE020 and SE016 bear Greek letters, SE021 to SE025 bear Latin letters, and SE031 to SE034 bear cuneiform agreed with the labels by eye.

**Bajaur caskets:** SE006 is spherical and SE007 is ovoid. These match Baums's descriptions for Indravarman and Ramaka, under the Met's titles. Image and inscription agree, so only the accession numbers differ between the two sources.

## 7. Exclusion report

| Row | Status | Reason |
|---|---|---|
| SE028 | **Excluded** | No recognisable rune. Only long curved painted lines survive |
| SE019 | Not acquired | Label not verified, and the row was never approved for metrics |
| RS001 to RS003 | Not acquired | Reserve rows |
| SE001 | **Held** | Inscription too small and faint in the web image |
| SE002 to SE005, SE009, SE010 | **Held** | Printed site caption reveals the source |

No image was replaced.

### Proposal needing your decision

[proposed_crops.csv](proposed_crops.csv) holds exact pixel boxes, and **none has been applied**. Previews were checked by eye to confirm that captions and margin numbering are gone.

SE001 would also need to switch to the 3400-pixel print file from the same CC0 Cleveland record.

| Option | Effect |
|---|---|
| A. Approve all 7 | 28 in-scope images, and Brahmi 5, Kharosthi 5 |
| B. Approve all except SE009 | 27 images; drops the noisiest plate |
| C. Reject | 21 images, Brahmi 0, so Brahmi cannot be evaluated |

Even with crops, 4 of 5 Brahmi rows remain printed plates of famous objects, so Brahmi results stay confounded. Cropping also adds a step that must be applied consistently, and it would need one small code change.

## 8. Updated dataset distribution

| Class | Target | Accepted | Held | Excluded | Not acquired |
|---|---|---|---|---|---|
| Brahmi | 5 | **0** | 5 | 0 | 0 |
| Kharosthi | 5 | 3 | 2 | 0 | 0 |
| Phoenician | 5 | 5 | 0 | 0 | 0 |
| Greek | 5 | 4 | 0 | 0 | 1 |
| Latin | 5 | 5 | 0 | 0 | 0 |
| Runic | 5 | 4 | 0 | 1 | 0 |
| **In-scope** | **30** | **21** | **7** | **1** | **1** |
| Cuneiform | 4 | 4 | 0 | 0 | 0 |
| Egyptian hieroglyphs | 4 | 4 | 0 | 0 | 0 |
| No writing | 2 | 2 | 0 | 0 | 0 |
| **Rejection** | **10** | **10** | **0** | **0** | **0** |

## 9. Updated evaluation denominators

The approved fractions are unchanged. Counts follow the actual denominator.

| Gate | Fraction | Now (n=21) | 95% CI at gate | If all held approved (n=28) | 95% CI at gate |
|---|---|---|---|---|---|
| Top-1 | 1/2 | **11/21** | 32% to 72% | 14/28 | 33% to 67% |
| Top-3 | 4/5 | **17/21** | 60% to 92% | 23/28 | 64% to 92% |
| Reproducibility, in-scope | 4/5 | **17/21** | 60% to 92% | 23/28 | 64% to 92% |
| Rejection | 7/10 | **7/10** | 40% to 89% | 7/10 | 40% to 89% |
| Valid output after retry | 90% | Calls answered | | Calls answered | |

`--check` prints the current figures. These are preliminary engineering gates, and they do not show general accuracy.

## 10. Remaining research gaps

- Decide the crop proposal. **This blocks Stage D.**
- No Brahmi photograph of an actual inscription is counted. SE001 is the only one downloaded.
- Greek stays at 4, pending a direct reading of IG II² 1688.
- Runic is one short. Reserve RS001 was not substituted, because it was not downloaded or viewed.
- Met pages returned HTTP 429 and UNESCO pages 403 again, so Rummindei and several Met facts still rest on search excerpts.
- The Bajaur accession numbers conflict between sources. Asking the Met would settle it.
- SE028's object record was not found beyond its Commons caption.
- No epigrapher has reviewed the labels.

## Hard negatives

**Recommendation: yes, harder negatives are needed.** Both current no-writing images were confirmed as free of writing, but they are easy: a smooth scarab and a blue figurine. Neither looks like writing, so a high rejection score on them would mean little. Hieroglyph stelae also show obvious Egyptian art, which makes out-of-scope rejection easier.

These are proposals only. **Nothing was downloaded, and no image has been viewed.** All are CC0 Met records with `isPublicDomain=true`, checked 2026-11-01.

| Type | Object | Accession | Why it is harder | Label risk |
|---|---|---|---|---|
| Decorative pattern | [Incised bowl with geometric pattern, Paracas](https://www.metmuseum.org/art/collection/search/308335) | 62.266.45 (RS002) | Repeated incised marks | Absence of writing is implied |
| Decorative pattern | [Limestone chest with incised decoration, Cypriot](https://www.metmuseum.org/art/collection/search/244044) | 74.51.5164 (RS003) | Same material and region as Phoenician rows | Absence of writing is implied |
| Non-linguistic symbol | [Stamp seal: geometric pattern, Halaf](https://www.metmuseum.org/art/collection/search/327236) | 1986.311.1 | Sign-like motifs from a very early period | Absence of writing is implied |
| Non-linguistic symbol | [Scaraboid with incised grid pattern, Cypriot](https://www.metmuseum.org/art/collection/search/321478) | 74.51.4398 | Small regular marks | Check by eye |
| Non-linguistic symbol | [Cowroid seal amulet with a geometric pattern](https://www.metmuseum.org/art/collection/search/549748) | 27.3.367 | Egyptian context with no text | Title says "Inscribed", meaning cut, so needs care |

**Damaged surfaces with ambiguous markings** have no proposed source yet, because few records state that no writing is present.

Each would need review and a decision on `implied_record`, because the current rule would not count them.

## Disclosures

- **Image inspection:** you asked me to inspect every image, and I did so by opening review copies in this session. That sends those images to Anthropic's model as part of this conversation. They are all public, openly licensed museum images, and no other service received them.
- **Wikimedia rate limit:** full-size files triggered a 10-minute `retry-after` on the last Commons file. The downloader honoured it. A future bulk fetch should use smaller files or a longer pause.
- **SE001:** Cleveland's print file was fetched once to the session scratchpad for evaluation. It is not in the dataset.
- **Reproducibility:** `tools/fetch_images.py` re-fetches from the manifest, and `sha256sums.txt` confirms the result. A source that changes a file would fail the check.
