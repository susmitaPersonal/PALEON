# Dataset Sourcing Report

**Research date:** 2026-11-01, updated at Stage C.2. This report covers label and licence research. Stage C outcomes are in [STAGE_C_REPORT.md](STAGE_C_REPORT.md), and they decide what counts.

Related: [QUALITY_REPORT.md](QUALITY_REPORT.md), [ATTRIBUTION.md](ATTRIBUTION.md)

## Result at Stage B.1

These are label counts before images were viewed. Current counted figures are 24 in-scope and 10 rejection.

| Class | Target | Counted | Not counted | Shortfall |
|---|---|---|---|---|
| Brahmi | 5 | 5 | 0 | 0 |
| Kharosthi | 5 | 5 | 0 | 0 |
| Phoenician | 5 | 5 | 0 | 0 |
| Greek | 5 | 4 | 1 | 1 |
| Latin | 5 | 5 | 0 | 0 |
| Runic | 5 | 5 | 0 | 0 |
| **In-scope total** | **30** | **29** | **1** | **1** |
| Cuneiform | 4 | 4 | 0 | 0 |
| Egyptian hieroglyphs | 4 | 4 | 0 | 0 |
| No writing | 2 | 2 | 0 | 0 |
| **Rejection total** | **10** | **10** | **0** | **0** |

The manifest holds 40 development rows and 3 reserve rows. Reserve rows never enter the metrics.

## Label rule

| Status | Meaning | Counted |
|---|---|---|
| `verified_institution` | The holding institution's record names the script, or its subject tag does | Yes |
| `verified_publication` | A scholarly edition names the script | Yes |
| `implied_record` | The source fits the label but does not name the script | No |
| `secondary_source` | Only a third-party description supports it | No |
| `unverified` | No adequate evidence | No |

Stage B.1 added one clarification: a language tag counts only with a letter-for-letter edition.

**Why the rule is strict:** Met object 26.60.69 is catalogued as Roman, yet the Met says its inscription is in Greek. Culture cannot stand in for script, so Roman or Attic culture alone does not verify a label. This object is counted as Greek because the record says so.

Labels were checked by a non-specialist against written records. **No epigrapher has reviewed them.**

## Sources

| Source | Used for | Licence basis | Attribution |
|---|---|---|---|
| The Metropolitan Museum of Art | Phoenician, Greek, Latin, Kharosthi, cuneiform, hieroglyphs, no writing | CC0 Open Access, checked per object with `isPublicDomain=true` | Not required; credit suggested |
| Cleveland Museum of Art | Brahmi | CC0, from `share_license_status` | Not required; credit suggested |
| Swedish History Museum, on Commons | Runic | CC BY 4.0 per file | **Required:** photographer, institution, licence |
| Hultzsch 1925, on Commons | Brahmi, Kharosthi | Public domain per Commons | Credit recommended |
| British Library, via International Dunhuang Project, on Commons | Kharosthi | Public domain per Commons | Credit recommended |

Exact attribution text for each image is in the manifest's `attribution` column.

## Licence review

- **Default:** even permitted images are not committed. `data/` is gitignored, and only URLs, attribution, and hashes enter Git.
- **Search summaries were wrong once.** A search result implied that Met 74.51.2293 was open access, but its record shows `isPublicDomain: false` and no image. It was excluded, and every Met row was checked against its own record.
- **Commons statuses were rechecked at Stage C.** All 12 file pages carry explicit templates. The British Library file (SE008) relies on a permission ticket that is not public, so it is held, not counted, and not redistributable until independently verified.
- **CC BY terms:** the runic images must carry attribution wherever they appear, including reports and the demo.
- **Sending images to a provider:** CC0 and public-domain material has no restriction on this. CC BY material carries its attribution requirement if results are published with the image.
- **Excluded sources:** the British Museum and Ashmolean records found carried terms that were not confirmed as open, so neither was used.

## Stage B.1 evidence review

Each of the 8 uncounted rows was reviewed. Seven were upgraded, and one stays uncounted.

| Row | Result | Source | Exact evidence |
|---|---|---|---|
| Delhi-Topra pillar | **Upgraded** | Hultzsch 1925, pp. xvi-xvii | "The Delhi-Topra pillar-inscription is the first record of Asoka that was read"; "deciphering the ancient Brahmi alphabet"; "tested by applying it to the inscription on the Delhi column" |
| Rummindei pillar | **Upgraded** | [UNESCO list entry 666](https://whc.unesco.org/en/list/666/) | "the sandstone Ashoka pillar with its Pali inscription in Brahmi script" |
| Met 1987.142.71 (Ramaka) | **Upgraded** | [Baums 2012](https://stefanbaums.com/publications/baums_2012.pdf), no. 15 | Entry "cki 243"; same publication: "CKI = Corpus of Kharoṣṭhī inscriptions" |
| Met 26.60.5 | **Upgraded** | [IG I³ 71](https://www.atticinscriptions.com/inscription/IGI3/71?text_type=greek), USEP | "Fragment 21 ... (Metropolitan Museum, New York 26.60.5)"; text printed in Greek letters; `mainLang="grc"` |
| Met 08.258.41 | **Upgraded** | USEP, IG II² 7090 | `mainLang="grc"`; "Σώστρατος ∶ Τεισάνδρο ∶ Παιανιεύς" |
| Met X.248.2 | **Upgraded** | USEP, CIL VI 20621, EDR177137 | `mainLang="lat"`; "Lolliae Geniali Lollia Sameramis mater infelicissima fecit" |
| Met X.248.3 | **Upgraded** | USEP, EDR177299 | `mainLang="lat"`; "Antoninus vixit annis XII. Satria Epicharis vernae suo bene merenti fecit" |
| Met 26.60.6 | **Not upgraded** | USEP, IG II² 1688 | `mainLang="grc"`, but no text was read, and descriptions conflict |

USEP is the [U.S. Epigraphy Project](https://usepigraphy.brown.edu/projects/usep/collections/NY.NY.MMA/) at Brown University. Its records were read as [EpiDoc XML](https://github.com/Brown-University-Library/usep-data).

**Standard applied:** a language tag alone does not identify a writing system. A language tag with a letter-for-letter edition does, because the edition shows the letters. That is why 26.60.6 stays uncounted while 26.60.5 was upgraded.

**Still read through search excerpts:** the Met website returned HTTP 429 and UNESCO pages returned HTTP 403 throughout. Rummindei and several Met facts should be re-read directly at Stage C.

### Accession conflict

| Inscription | Baums 2012 | Met record |
|---|---|---|
| Indravarman, year 63 (CKI 242) | 1987.142.71a,b, spherical | 1987.142.70a,b |
| Ramaka and Uḍita (CKI 243) | 1987.142.70a,b, ovoid | 1987.142.71a,b |

The two sources number these caskets the opposite way round. Script labels are unaffected, because both inscriptions are in the Corpus of Kharoṣṭhī inscriptions.

**Stage C result:** SE006 is spherical and SE007 is ovoid, matching Baums under the Met's titles. Image and text agree, so the conflict concerns accession numbers only.

**Stage C.2 result:** narrowed, not independently resolved. The Met's live record gives Diam. 9.2 cm for 1987.142.70 and H. 7.5 cm, Diam. 5.4 cm for 1987.142.71, which fits the images. Behrendt 2007, Salomon and Schopen, gandhari.org entries, and Met pages could not be read.

### SE001 evidence

The Cleveland record reads "Brahmi script." [Lüders, Bharhut Inscriptions](https://archive.org/details/corpusinscriptio014676mbp), A 101 (847), edits the same words, Mitasa suchi danam, on a rail-bar in the Indian Museum, Calcutta. That is a published parallel on a different object, not independent evidence for the Cleveland piece. Pal 1977 and Lee 1983 were not accessed.

## Coverage gaps

| Gap | Cause | Options |
|---|---|---|
| Greek, 1 short | No text of Met 26.60.6 could be read | Read IG II² 1688 directly, or leave Greek at 4 |

No poorly verified image was substituted to reach a target.

## Leakage and bias

| Risk | Affected | Effect |
|---|---|---|
| Single-source class | Phoenician (all Cesnola); runic (one museum series) | Photography style follows class |
| Medium differs by class | 6 of 10 South Asian rows are printed plates | Models may separate plates from photographs |
| Combined confound | 4 of 5 Brahmi rows are plates and famous objects | Brahmi results are hard to interpret |
| Repeated text | Ashokan edicts appear at several sites | Different rocks, closely related text |
| Famous objects | 9 of 40 rows flagged | Recognition could replace reading |
| Inscription not visible | Checked at Stage C | SE028 excluded, SE001 held |
| Easy negatives | Both no-writing rows | Rejection may be overstated; 2 hard negatives are in reserve |

`image_quality` now comes from viewing. The full assessment is in [QUALITY_REPORT.md](QUALITY_REPORT.md).

## Reproducing the research

Metadata came from the Met Collection API (`/v1.1/search`, `/v1/objects`), the Cleveland Open Access API, and the Wikimedia Commons API. The Met's older `/v1/search` was retired on 2026-10-01. The Art Institute of Chicago API returned HTTP 403, and DigitaltMuseum's API returned no usable data, so neither was used.

## Key references

- [Met Open Access](https://www.metmuseum.org/hubs/open-access)
- [Cleveland Museum of Art Open Access](https://github.com/ClevelandMuseumArt/openaccess)
- [Wikimedia Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
- [Hultzsch, Inscriptions of Asoka (1925), archive.org](https://archive.org/details/InscriptionsOfAsoka.NewEditionByE.Hultzsch/HultzschCorpusAsokaSearchable)
- [Marble architrave, Met 26.60.69](https://www.metmuseum.org/art/collection/search/252533)
