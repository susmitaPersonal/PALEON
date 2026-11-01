import type { AnalysisResult, Comparison, RuntimeInfo, ScriptDetail, ScriptSummary, SourceRecord } from "@scriptecho/contracts";

export const runtime: RuntimeInfo = {
  provider: "mock", modelId: "scriptecho-mock", simulated: true, inferenceMode: "simulated", modelStatus: "not_checked", modelDetails: null, externalInferenceEnabled: false, promptVersion: "script_analysis_v1",
  referenceVersion: "2026-11-01", maxUploadBytes: 1024 * 1024, acceptedFormats: ["jpeg", "png", "webp"], maxCandidates: 3,
  rejectionClasses: ["Cuneiform", "Egyptian hieroglyphs", "No writing"],
};

export const source: SourceRecord = {
  id: "unicode-16-ch14", title: "Unicode Chapter 14", publisher: "Unicode Consortium", year: 2024,
  url: "https://www.unicode.org/x/", accessedOn: "2026-11-01", accessMethod: "read_directly", reuseNote: "n",
};

export const scripts: ScriptSummary[] = [
  { id: "brahmi", name: "Brahmi", alternativeNames: [], verificationStatus: "source_checked_not_expert_reviewed", incompleteFields: ["Directionality"] },
  { id: "kharosthi", name: "Kharosthi", alternativeNames: ["Kharoshthi"], verificationStatus: "source_checked_not_expert_reviewed", incompleteFields: [] },
];

const claim = { id: "brahmi.period", text: "Attested from the third century BCE.", sourceIds: ["unicode-16-ch14"], locator: "Section 14.1.1" };

export const detail: ScriptDetail = {
  script: {
    id: "brahmi", name: "Brahmi", alternativeNames: [], historicalPeriod: claim, geographicDistribution: null, directionality: null,
    characteristics: [], relationships: [], traits: [], referenceCharacters: [{ character: "𑀓", codePoint: "U+11013", name: "BRAHMI LETTER KA" }],
    verificationStatus: "source_checked_not_expert_reviewed", limitations: ["No direction is stated."],
  },
  sources: [source], incompleteFields: ["Geographic distribution", "Directionality"], characterNote: "Modern forms, not attested letter shapes.",
};

export const comparison: Comparison = {
  first: { id: "brahmi", name: "Brahmi" }, second: { id: "kharosthi", name: "Kharosthi" },
  shared: [{ topic: "Writing system type", first: "An abugida.", second: "An abugida type.", sourceIds: ["unicode-16-ch14"] }],
  differences: [], missingEvidence: ["Writing direction: no stored claim for Brahmi"],
  referenceCharacters: { first: detail.script.referenceCharacters, second: [] }, sources: [source],
  caveat: "Visual similarity does not establish historical descent or a linguistic relationship.",
};

export function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    analysisId: "a-1", status: "candidates", statusReason: null,
    observations: { writingPresent: true, imageQuality: "fair", visualFeatures: ["Simulated feature"], characterShapes: [], direction: "unclear", directionBasis: null, limitations: ["Simulated limitation"], ambiguities: [] },
    candidates: [
      { rank: 1, scriptId: "brahmi", scriptName: "Brahmi", supportingEvidence: ["Upright strokes"], contradictingEvidence: ["No line seen"], evidenceStrength: "moderate", directionCheck: "not_checkable" },
      { rank: 2, scriptId: "kharosthi", scriptName: "Kharosthi", supportingEvidence: ["Cursive strokes"], contradictingEvidence: [], evidenceStrength: "weak", directionCheck: "not_checkable" },
    ],
    unsupportedScriptIds: [], removedStatements: 0, recommendExpertReview: true,
    capabilities: { scriptIdentification: "available", languageIdentification: "unavailable", transcription: "unavailable", transliteration: "unavailable", translation: "unavailable" },
    image: { width: 100, height: 80, format: "png", processedBytes: 1000 },
    provenance: { simulated: true, inferenceMode: "simulated", provider: "mock", modelId: "scriptecho-mock", modelVersion: "fixture-v1", promptVersion: "script_analysis_v1", promptSha256: "a".repeat(64), referenceVersion: "2026-11-01", experimentId: null, analyzedAt: "2026-11-01T00:00:00.000Z", latencyMs: 3, attempts: 1, inputTokens: null, outputTokens: null, estimatedCostUsd: null },
    ...overrides,
  };
}
