import { z } from "zod";

const flag = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const optionalNumber = z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().nonnegative().optional());

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  MODEL_PROVIDER: z.enum(["mock", "openai-compatible"]).default("mock"),
  ALLOW_EXTERNAL_INFERENCE: flag,
  MODEL_BASE_URL: z.string().default(""),
  MODEL_ID: z.string().default(""),
  MODEL_API_KEY: z.string().default(""),
  MODEL_INPUT_USD_PER_MTOK: optionalNumber,
  MODEL_OUTPUT_USD_PER_MTOK: optionalNumber,
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  MODEL_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  ANALYSIS_DEADLINE_MS: z.coerce.number().int().positive().default(55_000),
  EXPERIMENT_ID: z.string().default(""),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(120_000_000),
  MAX_MODEL_IMAGE_EDGE: z.coerce.number().int().positive().default(2048),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  TRUST_PROXY: flag,
  MAX_CONCURRENT_ANALYSES: z.coerce.number().int().positive().default(4),
  WEB_DIST: z.string().default(""),
});

export type Config = {
  port: number;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  provider: "mock" | "openai-compatible";
  allowExternalInference: boolean;
  modelBaseUrl: string;
  modelId: string;
  modelApiKey: string;
  inputUsdPerMtok: number | null;
  outputUsdPerMtok: number | null;
  modelTimeoutMs: number;
  modelMaxRetries: number;
  analysisDeadlineMs: number;
  experimentId: string | null;
  maxUploadBytes: number;
  maxImagePixels: number;
  maxModelImageEdge: number;
  rateLimitPerMinute: number;
  trustProxy: boolean;
  maxConcurrentAnalyses: number;
  webDist: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  if (parsed.MODEL_PROVIDER !== "mock") {
    // External inference sends user images to a third party, so it takes an explicit second switch.
    if (!parsed.ALLOW_EXTERNAL_INFERENCE) {
      throw new Error("MODEL_PROVIDER is not mock, but ALLOW_EXTERNAL_INFERENCE is not true");
    }
    const missing = (["MODEL_BASE_URL", "MODEL_ID", "MODEL_API_KEY"] as const).filter((name) => !parsed[name]);
    if (missing.length > 0) throw new Error(`Missing configuration: ${missing.join(", ")}`);
  }
  return {
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    provider: parsed.MODEL_PROVIDER,
    allowExternalInference: parsed.ALLOW_EXTERNAL_INFERENCE,
    modelBaseUrl: parsed.MODEL_BASE_URL,
    modelId: parsed.MODEL_ID,
    modelApiKey: parsed.MODEL_API_KEY,
    inputUsdPerMtok: parsed.MODEL_INPUT_USD_PER_MTOK ?? null,
    outputUsdPerMtok: parsed.MODEL_OUTPUT_USD_PER_MTOK ?? null,
    modelTimeoutMs: parsed.MODEL_TIMEOUT_MS,
    modelMaxRetries: parsed.MODEL_MAX_RETRIES,
    analysisDeadlineMs: parsed.ANALYSIS_DEADLINE_MS,
    experimentId: parsed.EXPERIMENT_ID || null,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    maxImagePixels: parsed.MAX_IMAGE_PIXELS,
    maxModelImageEdge: parsed.MAX_MODEL_IMAGE_EDGE,
    rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
    trustProxy: parsed.TRUST_PROXY,
    maxConcurrentAnalyses: parsed.MAX_CONCURRENT_ANALYSES,
    webDist: parsed.WEB_DIST,
  };
}
