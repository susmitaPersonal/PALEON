import { z } from "zod";
import { InferenceModeSchema, MAX_CANDIDATES } from "./analysis";

export const ErrorCodeSchema = z.enum([
  "invalid_request", "file_too_large", "unsupported_media_type", "undecodable_image", "image_too_large",
  "forbidden", "not_found", "conflict", "rate_limited", "model_output_invalid", "provider_unavailable", "analysis_timeout", "analysis_cancelled", "internal_error",
]);

export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
});

export const ResponseMetaSchema = z.strictObject({ requestId: z.string() });

export const DEMO_SCENARIOS = [
  "auto", "clear_candidate", "ambiguous_candidates", "out_of_scope", "no_writing", "insufficient_evidence",
  "provider_failure",
] as const;
export const DemoScenarioSchema = z.enum(DEMO_SCENARIOS);

export const ModelStatusSchema = z.enum(["ready", "not_checked", "server_unreachable", "model_not_installed", "no_vision_support", "not_local"]);
export const ModelDetailsSchema = z.strictObject({
  family: z.string().nullable(),
  parameterSize: z.string().nullable(),
  quantization: z.string().nullable(),
});

export const RuntimeInfoSchema = z.strictObject({
  provider: z.string(),
  modelId: z.string(),
  simulated: z.boolean(),
  inferenceMode: InferenceModeSchema,
  modelStatus: ModelStatusSchema,
  modelDetails: ModelDetailsSchema.nullable(),
  externalInferenceEnabled: z.boolean(),
  promptVersion: z.string(),
  referenceVersion: z.string(),
  maxUploadBytes: z.number(),
  acceptedFormats: z.array(z.string()),
  maxCandidates: z.literal(MAX_CANDIDATES),
  rejectionClasses: z.array(z.string()),
});

export type ModelStatus = z.infer<typeof ModelStatusSchema>;
export type ModelDetails = z.infer<typeof ModelDetailsSchema>;
/** Streamed while an analysis runs, because a local model can take many minutes. */
export const AnalysisProgressSchema = z.strictObject({
  stage: z.enum(["received", "analysing", "generating"]),
  tokens: z.number().int().nonnegative().optional(),
});

export type AnalysisProgress = z.infer<typeof AnalysisProgressSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type DemoScenario = z.infer<typeof DemoScenarioSchema>;
export type RuntimeInfo = z.infer<typeof RuntimeInfoSchema>;
export type ApiSuccess<T> = { ok: true; data: T; meta: { requestId: string } };
export type ApiFailure = { ok: false; error: ApiError; meta: { requestId: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
