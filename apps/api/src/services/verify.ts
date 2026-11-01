import { AnalysisStatusSchema, DirectionSchema, type CandidateResult, type DirectionCheck, type EvidenceStrength, type ModelAnalysis, type ModelObservations } from "@scriptecho/contracts";
import type { ScriptFacts } from "./references";

/** Models may not supply history. These match the written form of dates, links, and citations, not any subject. */
const HISTORY_PATTERNS = [
  /https?:\/\/|www\./i,
  /\b\d{1,4}\s*(?:B\.?\s?C\.?(?:E\.?)?|C\.?E\.?|A\.?D\.?)(?![a-z])/i,
  /\b(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[- ]cent(?:\.|ury|uries)/i,
  /\b(?:et al\.|doi:|ISBN|according to)|\bpp?\.\s?\d/i,
  /\b\d{1,3}\s?%|\bpercent\b|\bprobability of\b/i,
];

/** Strong must rest on sourced records. Today only direction can be checked, so no result can reach this. */
export const MIN_SOURCED_MATCHES_FOR_STRONG = 2;
const MIN_ITEMS_FOR_STRONG = 3;
const MIN_ITEMS_FOR_MODERATE = 2;

const WRITING_CONTRADICTION = "The model reported no writing, but also named a script. The output contradicts itself, so no identification is given.";
const POOR_IMAGE = "Image quality is too poor to compare letter forms, so no identification is given.";
const POOR_IMAGE_NO_WRITING = "Image quality is too poor to show that no writing is present.";
const NOTHING_LEFT = "No candidate had enough visual evidence after verification.";

const ABSTENTION_REASONS: Record<ModelAnalysis["status"], string | null> = {
  candidates: null,
  insufficient_evidence: "The image does not support an identification.",
  out_of_scope: "The marks do not match a supported script.",
  no_writing: "No writing was reported in this image.",
};

const NOT_SCRIPTS = new Set<string>([...AnalysisStatusSchema.options, ...DirectionSchema.options]);

export type VerifierReference = {
  facts(id: string): ScriptFacts | null;
  visualTerms: ReadonlySet<string>;
  statementTerms: ReadonlySet<string>;
};

const isClean = (text: string) => !HISTORY_PATTERNS.some((pattern) => pattern.test(text));
const words = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/**
 * Fails closed: every word must be in the reviewed vocabulary, or the statement is removed.
 * Names of people, places, and periods, and any reading or translation, fail by not being listed.
 */
function isReviewedStatement(text: string, terms: ReadonlySet<string>): boolean {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.length > 0 && tokens.every((token) => /^\d{1,2}$/.test(token)
    || terms.has(token) || (token.endsWith("s") && terms.has(token.slice(0, -1))));
}

/** The statement uses a controlled word for a visible property. This classifies it, and never shows it is true. */
function isVisual(text: string, terms: ReadonlySet<string>): boolean {
  return words(text).some((word) => terms.has(word) || (word.endsWith("s") && terms.has(word.slice(0, -1))));
}

/** A statement naming the candidate restates the conclusion, so it cannot be evidence for it. */
function namesScript(text: string, facts: ScriptFacts): boolean {
  const statement = ` ${words(text).join(" ")} `;
  return [facts.name, ...facts.alternativeNames].some((name) => statement.includes(` ${words(name).join(" ")} `));
}

const normal = (text: string) => words(text).join(" ");
const unique = (items: string[]) => [...new Map(items.map((item) => [normal(item), item])).values()];

export function directionCheck(observed: ModelObservations["direction"], stored: string | null): DirectionCheck {
  if (!stored || (observed !== "left_to_right" && observed !== "right_to_left")) return "not_checkable";
  return observed === stored ? "consistent" : "conflict";
}

export function evidenceStrength(candidate: { supportingEvidence: string[]; contradictingEvidence: string[] },
  quality: ModelObservations["imageQuality"], direction: DirectionCheck, sourcedMatches: number): EvidenceStrength {
  const supporting = candidate.supportingEvidence.length;
  const contradicting = candidate.contradictingEvidence.length;
  if (quality === "poor" || direction === "conflict" || supporting < MIN_ITEMS_FOR_MODERATE || contradicting >= supporting) return "weak";
  const sourced = sourcedMatches >= MIN_SOURCED_MATCHES_FOR_STRONG;
  if (sourced && supporting >= MIN_ITEMS_FOR_STRONG && contradicting === 0 && quality === "good") return "strong";
  return "moderate";
}

function refusalReason({ status, observations }: ModelAnalysis): string | null {
  if (!observations.writingPresent && (status === "candidates" || status === "out_of_scope")) return WRITING_CONTRADICTION;
  if (observations.imageQuality === "poor" && status === "candidates") return POOR_IMAGE;
  if (observations.imageQuality === "poor" && status === "no_writing") return POOR_IMAGE_NO_WRITING;
  return null;
}

export type VerifiedAnalysis = {
  status: ModelAnalysis["status"];
  statusReason: string | null;
  observations: ModelObservations;
  candidates: CandidateResult[];
  unsupportedScriptIds: string[];
  removedStatements: number;
  recommendExpertReview: boolean;
};

/** Deterministic checks on validated output. It removes or refuses, and it never repairs by guessing. No text it keeps is verified. */
export function verifyAnalysis(analysis: ModelAnalysis, reference: VerifierReference): VerifiedAnalysis {
  let removedStatements = 0;
  const reviewed = (item: string) => isClean(item) && isReviewedStatement(item, reference.statementTerms);
  const filter = (items: string[], accept: (item: string) => boolean) => {
    const kept = unique(items).filter((item) => reviewed(item) && accept(item));
    removedStatements += items.length - kept.length;
    return kept;
  };
  const visual = (item: string) => isVisual(item, reference.visualTerms);
  const anything = () => true;
  const observations: ModelObservations = {
    ...analysis.observations,
    visualFeatures: filter(analysis.observations.visualFeatures, visual),
    characterShapes: filter(analysis.observations.characterShapes, visual),
    limitations: filter(analysis.observations.limitations, anything),
    ambiguities: filter(analysis.observations.ambiguities, anything),
  };
  if (observations.directionBasis && !reviewed(observations.directionBasis)) {
    observations.directionBasis = null;
    removedStatements += 1;
  }
  let statusReason = analysis.statusReason;
  if (statusReason && !reviewed(statusReason)) {
    statusReason = ABSTENTION_REASONS[analysis.status];
    removedStatements += 1;
  }

  const unsupportedScriptIds: string[] = [];
  let candidates: CandidateResult[] = [];
  for (const candidate of analysis.candidates) {
    const facts = reference.facts(candidate.scriptId);
    if (!facts) {
      // Observed in real output: a status or direction name used as a script ID, which names no script at all.
      if (!NOT_SCRIPTS.has(candidate.scriptId)) unsupportedScriptIds.push(candidate.scriptId);
      continue;
    }
    const supportingEvidence = filter(candidate.supportingEvidence, (item) => visual(item) && !namesScript(item, facts));
    const contradictingEvidence = filter(candidate.contradictingEvidence, anything);
    // A removed statement against a candidate still counts, because removing it must never flatter that candidate.
    const against = { supportingEvidence, contradictingEvidence: unique(candidate.contradictingEvidence) };
    if (supportingEvidence.length === 0) continue;
    const direction = directionCheck(observations.direction, facts.direction);
    const result = { ...candidate, supportingEvidence, contradictingEvidence, scriptName: facts.name,
      rank: candidates.length + 1, directionCheck: direction };
    const sourcedMatches = direction === "consistent" ? 1 : 0;
    candidates.push({ ...result, evidenceStrength: evidenceStrength(against, observations.imageQuality, direction, sourcedMatches) });
  }

  // Evidence given word for word for two scripts cannot separate them, so it cannot lift either above weak.
  const others = (item: CandidateResult) => candidates.filter((other) => other !== item).flatMap((other) => other.supportingEvidence.map(normal));
  candidates = candidates.map((item) => (item.supportingEvidence.every((text) => others(item).includes(normal(text)))
    ? { ...item, evidenceStrength: "weak" } : item));

  let status = analysis.status;
  const refusal = refusalReason(analysis);
  if (refusal) {
    status = "insufficient_evidence";
    statusReason = refusal;
    candidates = [];
  } else if (status === "candidates" && candidates.length === 0) {
    status = unsupportedScriptIds.length > 0 ? "out_of_scope" : "insufficient_evidence";
    statusReason = NOTHING_LEFT;
  }
  const [first, second] = candidates;
  const clearLead = first?.evidenceStrength === "strong" && second?.evidenceStrength !== "strong";
  // Nothing the model writes can switch this off. A "no writing" answer also keeps it, because appearance is no proof (ADR-049).
  return { status, statusReason, observations, candidates, unsupportedScriptIds, removedStatements, recommendExpertReview: !clearLead };
}
