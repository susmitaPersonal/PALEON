import type { LanguagePack, ReviewState, TranslationHypothesis, Transliteration, WordAnalysis } from "@scriptecho/contracts";

const MAX_FORMS = 256;
const LIMITATIONS = [
  "Glosses are looked up word by word. No grammar, syntax, or morphology has been applied, so this is not a translation of the text.",
  "A match shows that a form exists in the lexicon, not that this inscription means it.",
];

const wordKey = (word: Transliteration["words"][number]) => word.segments.flatMap((segment) => segment.tokenIds);
const wordText = (word: Transliteration["words"][number]) => word.segments
  .map((segment) => (segment.alternatives.length > 1 ? `(${segment.alternatives.join("/")})` : segment.alternatives[0])).join("");

function formsOf(word: Transliteration["words"][number]): string[] | null | "too_many" {
  let forms = [""];
  for (const segment of word.segments) {
    if (!segment.plain) return null;
    if (forms.length * segment.plain.length > MAX_FORMS) return "too_many";
    forms = forms.flatMap((form) => segment.plain!.map((value) => form + value));
  }
  return forms;
}

function analyseWord(word: Transliteration["words"][number], language: LanguagePack): WordAnalysis {
  const base = { tokenIds: wordKey(word), transliteration: wordText(word) };
  const forms = formsOf(word);
  if (forms === null) return { ...base, candidateForms: [], matches: [], state: "unreadable" };
  if (forms === "too_many") return { ...base, candidateForms: [], matches: [], state: "too_many_alternatives" };
  const matches = forms.flatMap((form) => language.entries.filter((entry) => entry.forms.includes(form)).map((entry) => ({
    form, entryId: entry.id, lemma: entry.lemma, partOfSpeech: entry.partOfSpeech, gloss: entry.gloss, sourceIds: entry.sourceIds, locator: entry.locator,
  })));
  const state = matches.length === 0 ? "no_lexical_match" : matches.length === 1 ? "matched" : "ambiguous";
  return { ...base, candidateForms: forms, matches, state };
}

/** Sets sourced glosses beside words. With no established language it offers nothing, and it never writes a sentence. */
export function buildHypothesis(reading: Transliteration, language: LanguagePack | null, reviewState: ReviewState): TranslationHypothesis {
  const base = { scriptId: reading.scriptId, method: "lexicon_lookup" as const, reviewState };
  if (!language) {
    return { ...base, languageId: null, status: "language_not_established", words: [], matchedWords: 0, unmatchedWords: 0, sources: [],
      limitations: ["A person has not set a language for this case. A script alone does not establish one, so nothing was translated."] };
  }
  const words = reading.words.map((word) => analyseWord(word, language));
  const matchedWords = words.filter((word) => word.matches.length > 0).length;
  const used = new Set(words.flatMap((word) => word.matches.flatMap((match) => match.sourceIds)));
  const status = words.every((word) => word.state === "unreadable") ? "no_readable_text" : matchedWords === words.length ? "all_words_matched" : "partial";
  return { ...base, languageId: language.id, status, words, matchedWords, unmatchedWords: words.length - matchedWords,
    sources: language.sources.filter((source) => used.has(source.id)), limitations: [...LIMITATIONS, ...language.limitations] };
}
