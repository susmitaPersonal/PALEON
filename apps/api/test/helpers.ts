import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createApp } from "../src/app";
import { loadConfig, type Config } from "../src/config";
import { createLogger } from "../src/logger";
import { MockProvider } from "../src/providers/mock";
import type { ModelProvider, ProviderRequest, ProviderResponse } from "../src/providers/types";
import { AnalysisService } from "../src/services/analysis";
import { loadPrompt } from "../src/services/prompt";
import { loadCollection, ReferenceService } from "../src/services/references";

const here = dirname(fileURLToPath(import.meta.url));
export const KNOWLEDGE = resolve(here, "../../../knowledge");
export const FIXTURES = resolve(here, "../fixtures/mock");
export const PROMPT_PATH = resolve(here, "../prompts/script_analysis_v1.md");

export const references = () => new ReferenceService(loadCollection(KNOWLEDGE));

/** Plays a script of outcomes, then fails loudly if asked for more. */
export class ScriptedProvider implements ModelProvider {
  readonly id = "scripted";
  readonly modelId = "scripted-model";
  readonly simulated = false;
  readonly calls: ProviderRequest[] = [];

  constructor(private readonly outcomes: (ProviderResponse | Error | ((request: ProviderRequest) => Promise<ProviderResponse>))[],
    readonly inputUsdPerMtok: number | null = null, readonly outputUsdPerMtok: number | null = null) {}

  async analyze(request: ProviderRequest): Promise<ProviderResponse> {
    this.calls.push(request);
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error("no scripted outcome left");
    if (outcome instanceof Error) throw outcome;
    return typeof outcome === "function" ? outcome(request) : outcome;
  }
}

export const response = (body: unknown, usage: ProviderResponse["usage"] = null): ProviderResponse => ({
  content: typeof body === "string" ? body : JSON.stringify(body), modelVersion: "m-1", usage,
});

export function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    status: "candidates",
    statusReason: null,
    observations: {
      writingPresent: true, imageQuality: "fair", visualFeatures: ["straight strokes"], characterShapes: ["angular forms"],
      direction: "left_to_right", directionBasis: "lines start at the left", limitations: [], ambiguities: [],
    },
    candidates: [{ rank: 1, scriptId: "greek", supportingEvidence: ["angular forms"], contradictingEvidence: [] }],
    ...overrides,
  };
}

export function testConfig(env: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({ LOG_LEVEL: "silent", ...env });
}

export function buildApp(provider: ModelProvider = new MockProvider(FIXTURES), env: NodeJS.ProcessEnv = {},
  sleep: (ms: number) => Promise<void> = async () => {}) {
  const config = testConfig(env);
  const logger = createLogger("silent");
  const collection = references();
  const prompt = loadPrompt(PROMPT_PATH, collection.scriptIds());
  const analysis = new AnalysisService(provider, collection, prompt, logger, {
    deadlineMs: config.analysisDeadlineMs, attemptTimeoutMs: config.modelTimeoutMs, maxRetries: config.modelMaxRetries,
    experimentId: config.experimentId, sleep,
  });
  return createApp({ config, logger, provider, references: collection, analysis, promptVersion: prompt.version });
}

export const png = (width = 32, height = 24) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } }).png().toBuffer();

export const jpeg = (width = 32, height = 24) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg().toBuffer();

export function upload(bytes: Uint8Array, fields: Record<string, string> = {}, name = "image.png", type = "image/png") {
  const form = new FormData();
  form.set("image", new File([new Uint8Array(bytes)], name, { type }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://local/api/v1/analyses", { method: "POST", body: form });
}
