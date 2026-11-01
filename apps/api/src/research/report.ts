import type { ResearchCase, SignInventory, TranslationHypothesis, Transliteration } from "@scriptecho/contracts";

export type ResearchReport = {
  generatedAt: string;
  case: Omit<ResearchCase, "history" | "analysis">;
  analysis: ResearchCase["analysis"];
  transliteration: Transliteration | null;
  translation: TranslationHypothesis | null;
  history: { revision: number; at: string; action: string; reviewer: string | null; evidence: string | null }[];
  limitations: string[];
};

const LIMITATIONS = [
  "No recognition or translation method here has been validated on held-out data.",
  "Segmentation boxes are rule-based proposals, and sign suggestions are shape comparisons, not recognition by a trained model.",
  "A status of expert review records one person's own attestation. PALEON cannot check a qualification.",
];

export function buildReport(record: ResearchCase, inventory: SignInventory | null, transliteration: Transliteration | null, translation: TranslationHypothesis | null): ResearchReport {
  const { history, analysis, ...rest } = record;
  return {
    generatedAt: new Date().toISOString(), case: rest, analysis, transliteration, translation,
    history: history.map(({ revision, at, action, reviewer, evidence }) => ({ revision, at, action, reviewer: reviewer ? `${reviewer.name} (${reviewer.role})` : null, evidence })),
    limitations: [...LIMITATIONS, ...(inventory?.limitations ?? [])],
  };
}

const list = (items: string[], empty: string) => (items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : empty);

/** Keeps every alternative and label from the data. Untranslated words stay listed as untranslated. */
export function reportMarkdown(report: ResearchReport): string {
  const { case: record, analysis, transliteration, translation } = report;
  const quality = record.quality;
  const candidates = analysis?.candidates.map((candidate) =>
    `### ${candidate.rank}. ${candidate.scriptName}\n\nEvidence strength: ${candidate.evidenceStrength}\n\nSupporting:\n${list(candidate.supportingEvidence, "None stated.")}\n\nContradictory:\n${list(candidate.contradictingEvidence, "None stated.")}`) ?? [];
  const signs = record.tokens.map((token, index) => {
    const reading = token.readings.map((item) => item.signIds.join("+")).join(" / ") || "none";
    const box = token.box ? `${token.box.x},${token.box.y} ${token.box.width}×${token.box.height}` : "no box";
    return `| ${index + 1} | ${token.id} | ${box} | ${reading} | ${token.status} | ${token.origin} |`;
  });
  const words = translation?.words.map((word) => {
    const glosses = word.matches.map((match) => `${match.lemma} (${match.partOfSpeech}): ${match.gloss} [${match.sourceIds.join(", ")}; ${match.locator}]`);
    return `- **${word.transliteration}**, ${word.state.replaceAll("_", " ")}${glosses.length > 0 ? `\n${glosses.map((gloss) => `  - ${gloss}`).join("\n")}` : ""}`;
  }) ?? [];
  const provenance = analysis?.provenance;
  return `# ${record.title}

Generated ${report.generatedAt}. Review state: ${record.reviewState.replaceAll("_", " ")}. Revision ${record.revision}.

## Original image

Stored image: \`image.jpg\`, SHA-256 \`${record.image.sha256}\`, ${record.image.width}×${record.image.height} px.

## Image provenance

Source: ${record.provenance.sourceDescription || "Not recorded."}

Rights: ${record.provenance.rights || "Not recorded."}

## Image quality

${quality ? `Brightness ${quality.meanBrightness}, contrast ${quality.contrast}, sharpness ${quality.sharpness}. Flags: ${quality.flags.join(", ") || "none"}. Line orientation: ${quality.lineOrientation}. ${quality.note}` : "Not measured."}

## Script candidates

${analysis ? `Status: ${analysis.status.replaceAll("_", " ")}.${analysis.provenance.simulated ? " **Simulated demo output, not a model result.**" : ""}\n\n${candidates.join("\n\n") || analysis.statusReason || "No candidates."}` : "No identification has been run."}

Script set by a person for reading: ${record.scriptId ?? "none"}.

## Recognised signs

${signs.length > 0 ? `| # | Token | Box | Readings | Status | Origin |\n|---|---|---|---|---|---|\n${signs.join("\n")}` : "No signs recorded."}

## Transliteration

${transliteration ? `\`\`\`\n${transliteration.text}\n\`\`\`\n\n${transliteration.notation}\n\nTokens not read with certainty: ${transliteration.unresolvedTokens}.` : "None, because no script is set."}

## Translation hypotheses

${translation ? `Status: ${translation.status.replaceAll("_", " ")}. Words with a lexical match: ${translation.matchedWords}. Without: ${translation.unmatchedWords}. Glosses only, not a translation of the text.\n\n${list(translation.limitations, "")}\n\n${words.join("\n")}` : "None, because no script is set."}

## Research notes

${list(record.notes.map((note) => `${note.at}, ${note.author}: ${note.text}`), "None.")}

## Source references

${list([...(translation?.sources.map((source) => `${source.title}, ${source.publisher}, ${source.url}, accessed ${source.accessedOn}. ${source.reuseNote}`) ?? []), ...record.citations.map((citation) => `${citation.text}${citation.url ? ` ${citation.url}` : ""}`)], "None.")}

## Model information

${provenance ? `Provider ${provenance.provider}, model ${provenance.modelId}, mode ${provenance.inferenceMode}, prompt ${provenance.promptVersion}, analysed ${provenance.analyzedAt}.` : "No model was used."}

## Evaluation limitations

${list(report.limitations, "None.")}

## Revision history

${list(report.history.map((item) => `Revision ${item.revision}, ${item.at}: ${item.action}${item.reviewer ? `, by ${item.reviewer}` : ""}${item.evidence ? `. Evidence: ${item.evidence}` : ""}`), "None.")}
`;
}
