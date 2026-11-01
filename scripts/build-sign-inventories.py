#!/usr/bin/env python3
"""Builds knowledge/sign_inventories/*.json from Python's Unicode database, so names and code points are never typed by hand.

Transliteration values are conventions entered here. They are checked against nothing but the Unicode name,
so every sign is written as `unreviewed`. Only a qualified person may change that, in the data.
"""
import json
import pathlib
import unicodedata

OUT = pathlib.Path(__file__).resolve().parent.parent / "knowledge" / "sign_inventories"
UCD_NOTE = f"Unicode names read from unicodedata {unicodedata.unidata_version}."
FORM_NOTE = "Modern Unicode forms stand for the sign. They are not attested letter shapes."


def sign(char, kind, values, **extra):
    """One sign. `values` lists every accepted reading, most conventional first, and `schemes` gives other notations."""
    point = f"U+{ord(char):04X}"
    return {"id": f"u{ord(char):04x}", "character": char, "codePoint": point, "name": unicodedata.name(char),
            "kind": kind, "values": values, "schemes": {"unicode": char, **extra.pop("schemes", {})},
            "allographs": [], "reviewStatus": "unreviewed", **extra}


LATIN = {"A": ["a"], "B": ["b"], "C": ["c"], "D": ["d"], "E": ["e"], "F": ["f"], "G": ["g"], "H": ["h"], "I": ["i", "j"],
         "K": ["k"], "L": ["l"], "M": ["m"], "N": ["n"], "O": ["o"], "P": ["p"], "Q": ["q"], "R": ["r"], "S": ["s"],
         "T": ["t"], "V": ["u", "v"], "X": ["x"], "Y": ["y"], "Z": ["z"]}

GREEK = [("Α", "a"), ("Β", "b"), ("Γ", "g"), ("Δ", "d"), ("Ε", "e"), ("Ζ", "z"), ("Η", "ē"), ("Θ", "th"), ("Ι", "i"), ("Κ", "k"),
         ("Λ", "l"), ("Μ", "m"), ("Ν", "n"), ("Ξ", "x"), ("Ο", "o"), ("Π", "p"), ("Ρ", "r"), ("Σ", "s"), ("Τ", "t"), ("Υ", "y"),
         ("Φ", "ph"), ("Χ", "ch"), ("Ψ", "ps"), ("Ω", "ō")]

PHOENICIAN = ["ʾ", "b", "g", "d", "h", "w", "z", "ḥ", "ṭ", "y", "k", "l", "m", "n", "s", "ʿ", "p", "ṣ", "q", "r", "š", "t"]

ELDER_FUTHARK = [("ᚠ", "f"), ("ᚢ", "u"), ("ᚦ", "þ"), ("ᚨ", "a"), ("ᚱ", "r"), ("ᚲ", "k"), ("ᚷ", "g"),
                 ("ᚹ", "w"), ("ᚺ", "h"), ("ᚾ", "n"), ("ᛁ", "i"), ("ᛃ", "j"), ("ᛇ", "ï"), ("ᛈ", "p"),
                 ("ᛉ", "z"), ("ᛊ", "s"), ("ᛏ", "t"), ("ᛒ", "b"), ("ᛖ", "e"), ("ᛗ", "m"), ("ᛚ", "l"),
                 ("ᛜ", "ŋ"), ("ᛞ", "d"), ("ᛟ", "o")]

# Unicode name endings to conventional Indic romanisation.
INDIC_CONSONANTS = {"KA": "ka", "KHA": "kha", "GA": "ga", "GHA": "gha", "NGA": "ṅa", "CA": "ca", "CHA": "cha", "JA": "ja", "JHA": "jha",
                    "NYA": "ña", "TTA": "ṭa", "TTHA": "ṭha", "DDA": "ḍa", "DDHA": "ḍha", "NNA": "ṇa", "TA": "ta", "THA": "tha", "DA": "da",
                    "DHA": "dha", "NA": "na", "PA": "pa", "PHA": "pha", "BA": "ba", "BHA": "bha", "MA": "ma", "YA": "ya", "RA": "ra",
                    "LA": "la", "VA": "va", "SHA": "śa", "SSA": "ṣa", "SA": "sa", "HA": "ha", "ZA": "za", "LLA": "ḷa"}
INDIC_VOWELS = {"A": "a", "AA": "ā", "I": "i", "II": "ī", "U": "u", "UU": "ū", "E": "e", "AI": "ai", "O": "o", "AU": "au"}


def indic(first, last, prefix):
    signs = []
    for point in range(first, last + 1):
        name = unicodedata.name(chr(point), "")
        for marker, kind, table in ((f"{prefix} VOWEL SIGN ", "vowel_sign", INDIC_VOWELS), (f"{prefix} LETTER ", None, None)):
            if not name.startswith(marker):
                continue
            ending = name[len(marker):]
            if table is not None:
                if ending in table:
                    signs.append(sign(chr(point), kind, [table[ending]]))
            elif ending in INDIC_VOWELS:
                signs.append(sign(chr(point), "vowel", [INDIC_VOWELS[ending]]))
            elif ending in INDIC_CONSONANTS:
                signs.append(sign(chr(point), "consonant", [INDIC_CONSONANTS[ending]]))
            break
    return signs


def inventory(script, scope, signs, limitations):
    return {"scriptId": script, "version": "2026-11-02", "scope": scope, "inherentVowel": "a" if script in ("brahmi", "kharosthi") else None,
            "schemes": [{"id": "conventional", "label": "Conventional romanisation", "reversible": False},
                        {"id": "unicode", "label": "Unicode characters", "reversible": True}],
            "sourceIds": ["unicode-16-ucd"], "signs": signs,
            "limitations": [FORM_NOTE, UCD_NOTE, "Values are conventions entered by a non-specialist, and no expert has reviewed them.", *limitations]}


TABLES = {
    "latin": inventory("latin", "Classical capitals only", [sign(c, "letter", v) for c, v in LATIN.items()],
                       ["I and V each keep two readings, because the choice depends on the word."]),
    "greek": inventory("greek", "The 24 letters only", [sign(c, "letter", [v]) for c, v in GREEK],
                       ["Local epichoric alphabets, digamma, and other archaic letters are not included."]),
    "phoenician": inventory("phoenician", "The 22 letters", [sign(chr(0x10900 + i), "consonant", [v]) for i, v in enumerate(PHOENICIAN)],
                            ["The script writes consonants only, so a reading stays unvocalised."]),
    "runic": inventory("runic", "Elder Futhark only", [sign(c, "letter", [v]) for c, v in ELDER_FUTHARK],
                       ["Younger futharks and Anglo-Frisian runes are not included."]),
    "brahmi": inventory("brahmi", "Core vowels, consonants, and vowel signs", indic(0x11000, 0x11075, "BRAHMI"),
                        ["Numerals, punctuation, and later or regional letters are not included."]),
    "kharosthi": inventory("kharosthi", "Core vowels, consonants, and vowel signs", indic(0x10A00, 0x10A3F, "KHAROSHTHI"),
                           ["Modified consonants, numerals, and punctuation are not included."]),
}

OUT.mkdir(exist_ok=True)
for script, table in TABLES.items():
    (OUT / f"{script}.json").write_text(json.dumps(table, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print(script, len(table["signs"]))
