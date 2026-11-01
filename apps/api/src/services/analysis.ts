import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ModelAnalysisSchema, type AnalysisResult } from "@scriptecho/contracts";
import { AppError } from "../errors";
import type { Logger } from "../logger";
import { ProviderError, type ModelProvider, type ProviderResponse, type ProviderUsage } from "../providers/types";
import type { ProcessedImage } from "./intake";
import type { Prompt } from "./prompt";
import type { ReferenceService } from "./references";
import { verifyAnalysis } from "./verify";

const REPAIR_NOTE = "Your previous reply failed validation. Return only one JSON object that matches the schema. Do not change your assessment of the image.";
// z.toJSONSchema cannot express cross-field rules, so those are enforced by validation after the call.
const JSON_SCHEMA = z.toJSONSchema(ModelAnalysisSchema, { unrepresentable: "any" }) as Record<string, unknown>;

export type AnalysisOptions = {
  deadlineMs: number;
  attemptTimeoutMs: number;
  maxRetries: number;
  experimentId: string | null;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toAppError(error: ProviderError): AppError {
  if (error.kind === "timeout") return new AppError("analysis_timeout", "The analysis took too long. Try again.");
  return new AppError("provider_unavailable", "The analysis service is unavailable. Try again later.", error.retryAfterSeconds);
}

function parseOutput(content: string) {
  try {
    return ModelAnalysisSchema.safeParse(JSON.parse(content));
  } catch {
    return ModelAnalysisSchema.safeParse(undefined);
  }
}

function estimateCost(usage: ProviderUsage | null, provider: ModelProvider): number | null {
  if (!usage || provider.inputUsdPerMtok === null || provider.outputUsdPerMtok === null) return null;
  return (usage.inputTokens * provider.inputUsdPerMtok + usage.outputTokens * provider.outputUsdPerMtok) / 1e6;
}

export class AnalysisService {
  constructor(
    private readonly provider: ModelProvider,
    private readonly references: ReferenceService,
    private readonly prompt: Prompt,
    private readonly logger: Logger,
    private readonly options: AnalysisOptions,
  ) {}

  private async call(image: ProcessedImage, deadline: AbortSignal, demoScenario: string | undefined,
    repairNote: string | undefined): Promise<ProviderResponse> {
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(this.options.attemptTimeoutMs)]);
    return this.provider.analyze({
      system: this.prompt.system, userText: this.prompt.user, jsonSchema: JSON_SCHEMA,
      image: { mimeType: image.mimeType, bytes: image.bytes }, repairNote, demoScenario, signal,
    });
  }

  async analyze(image: ProcessedImage, requestId: string, demoScenario?: string): Promise<AnalysisResult> {
    const started = performance.now();
    const deadline = AbortSignal.timeout(this.options.deadlineMs);
    const sleep = this.options.sleep ?? defaultSleep;
    let attempts = 0;
    let providerRetries = 0;
    let repaired = false;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let cost: number | null = null;

    for (;;) {
      attempts += 1;
      let response: ProviderResponse;
      try {
        response = await this.call(image, deadline, demoScenario, repaired ? REPAIR_NOTE : undefined);
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
        this.logger.warn("provider_failure", { requestId, kind: error.kind, attempt: attempts });
        if (deadline.aborted) throw new AppError("analysis_timeout", "The analysis took too long. Try again.");
        if (error.retryable && providerRetries < this.options.maxRetries) {
          providerRetries += 1;
          await sleep((error.retryAfterSeconds ?? 1) * 1000);
          continue;
        }
        throw toAppError(error);
      }

      if (response.usage) {
        inputTokens = (inputTokens ?? 0) + response.usage.inputTokens;
        outputTokens = (outputTokens ?? 0) + response.usage.outputTokens;
        const attemptCost = estimateCost(response.usage, this.provider);
        if (attemptCost !== null) cost = (cost ?? 0) + attemptCost;
      }

      const parsed = parseOutput(response.content);
      if (!parsed.success) {
        this.logger.warn("model_output_invalid", { requestId, attempt: attempts, repaired });
        if (repaired) throw new AppError("model_output_invalid", "The model returned an invalid response. Try again.");
        repaired = true;
        continue;
      }

      const verified = verifyAnalysis(parsed.data, this.references);
      const latencyMs = Math.round(performance.now() - started);
      this.logger.info("analysis_complete", { requestId, status: verified.status, attempts, latencyMs,
        provider: this.provider.id, removedStatements: verified.removedStatements });
      return {
        analysisId: randomUUID(),
        ...verified,
        capabilities: { scriptIdentification: "available", languageIdentification: "unavailable",
          transcription: "unavailable", transliteration: "unavailable", translation: "unavailable" },
        image: { width: image.width, height: image.height, format: image.sourceFormat, processedBytes: image.bytes.length },
        provenance: {
          simulated: this.provider.simulated, provider: this.provider.id, modelId: this.provider.modelId,
          modelVersion: response.modelVersion, promptVersion: this.prompt.version, promptSha256: this.prompt.sha256,
          referenceVersion: this.references.version, experimentId: this.options.experimentId,
          analyzedAt: new Date().toISOString(), latencyMs, attempts, inputTokens, outputTokens, estimatedCostUsd: cost,
        },
      };
    }
  }
}
