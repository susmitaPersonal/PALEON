import { z } from "zod";

/** Script IDs are data, not an enum, so adding a writing system needs a record and no code change. */
export const ScriptIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/);

const Text = z.string().trim().min(1).max(400);

export const AnalysisStatusSchema = z.enum(["candidates", "insufficient_evidence", "out_of_scope", "no_writing"]);
export const ImageQualitySchema = z.enum(["good", "fair", "poor"]);
export const DirectionSchema = z.enum(["left_to_right", "right_to_left", "boustrophedon", "vertical", "unclear"]);

export const MAX_CANDIDATES = 3;

export const ModelCandidateSchema = z.strictObject({
  rank: z.number().int().min(1).max(MAX_CANDIDATES),
  scriptId: ScriptIdSchema,
  supportingEvidence: z.array(Text).min(1).max(6),
  contradictingEvidence: z.array(Text).max(6),
});

export const ModelObservationsSchema = z.strictObject({
  writingPresent: z.boolean(),
  imageQuality: ImageQualitySchema,
  visualFeatures: z.array(Text).max(12),
  characterShapes: z.array(Text).max(12),
  direction: DirectionSchema,
  directionBasis: Text.nullable(),
  limitations: z.array(Text).max(8),
  ambiguities: z.array(Text).max(8),
});

/** Everything a vision model may say. There is deliberately no field for dates, sources, or URLs. */
export const ModelAnalysisSchema = z
  .strictObject({
    status: AnalysisStatusSchema,
    observations: ModelObservationsSchema,
    candidates: z.array(ModelCandidateSchema).max(MAX_CANDIDATES),
    statusReason: Text.nullable(),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (value.status === "candidates") {
      if (value.candidates.length === 0) issue("status 'candidates' requires at least one candidate");
    } else {
      if (value.candidates.length > 0) issue("an abstaining status must have no candidates");
      if (!value.statusReason) issue("an abstaining status requires statusReason");
    }
    if (value.status === "no_writing" && value.observations.writingPresent) {
      issue("status 'no_writing' contradicts writingPresent=true");
    }
    const ranks = value.candidates.map((candidate) => candidate.rank);
    if (ranks.some((rank, index) => rank !== index + 1)) issue("candidate ranks must start at 1 with no gaps");
    if (new Set(value.candidates.map((candidate) => candidate.scriptId)).size !== value.candidates.length) {
      issue("candidate scripts must be unique");
    }
  });

export const EvidenceStrengthSchema = z.enum(["strong", "moderate", "weak"]);

/** The observed direction against the stored, sourced trait. This compares two records, and it never reads the image. */
export const DirectionCheckSchema = z.enum(["consistent", "conflict", "not_checkable"]);

export const CandidateResultSchema = ModelCandidateSchema.extend({
  scriptName: z.string(),
  evidenceStrength: EvidenceStrengthSchema,
  directionCheck: DirectionCheckSchema,
});

/** Simulated fixtures, a model on this machine, or a third-party model. The interface must keep these apart. */
export const InferenceModeSchema = z.enum(["simulated", "local", "external"]);

export const ProvenanceSchema = z.strictObject({
  simulated: z.boolean(),
  inferenceMode: InferenceModeSchema,
  provider: z.string(),
  modelId: z.string(),
  modelVersion: z.string().nullable(),
  promptVersion: z.string(),
  promptSha256: z.string(),
  referenceVersion: z.string(),
  experimentId: z.string().nullable(),
  analyzedAt: z.string(),
  latencyMs: z.number().nonnegative(),
  attempts: z.number().int().positive(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
});

export const AnalysisResultSchema = z.strictObject({
  analysisId: z.string(),
  status: AnalysisStatusSchema,
  statusReason: z.string().nullable(),
  observations: ModelObservationsSchema,
  candidates: z.array(CandidateResultSchema).max(MAX_CANDIDATES),
  unsupportedScriptIds: z.array(z.string()),
  removedStatements: z.number().int().nonnegative(),
  recommendExpertReview: z.boolean(),
  capabilities: z.strictObject({
    scriptIdentification: z.enum(["available", "simulated"]),
    languageIdentification: z.literal("unavailable"),
    transcription: z.literal("unavailable"),
    transliteration: z.literal("unavailable"),
    translation: z.literal("unavailable"),
  }),
  image: z.strictObject({ width: z.number(), height: z.number(), format: z.string(), processedBytes: z.number() }),
  provenance: ProvenanceSchema,
});

export type ModelAnalysis = z.infer<typeof ModelAnalysisSchema>;
export type ModelObservations = z.infer<typeof ModelObservationsSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>;
export type DirectionCheck = z.infer<typeof DirectionCheckSchema>;
export type CandidateResult = z.infer<typeof CandidateResultSchema>;
export type InferenceMode = z.infer<typeof InferenceModeSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
