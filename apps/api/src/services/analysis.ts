import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ModelAnalysisSchema, type AnalysisProgress, type AnalysisResult } from "@scriptecho/contracts";
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

export type RunOptions = { signal?: AbortSignal; onProgress?: (progress: AnalysisProgress) => void };

export type AnalysisOptions = {
  deadlineMs: number;
  attemptTimeoutMs: number;
  maxRetries: number;
  experimentId: string | null;
  rawOutputDir?: string | null;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const MAX_RETRY_WAIT_MS = 30_000;

/** These need the owner to act, so offering a retry would only repeat the failure. */
const LOCAL_FAILURES: Partial<Record<ProviderError["kind"], string>> = {
  model_not_installed: "The local model is not installed. Install it with Ollama, then try again.",
  model_load_failed: "The local model could not be loaded. Close other apps to free memory, then try again.",
  model_unsupported: "The configured local model cannot analyse this image here. No image was sent.",
};

function toAppError(error: ProviderError): AppError {
  if (error.kind === "timeout") return new AppError("analysis_timeout", "The analysis took too long. Try again.");
  if (error.kind === "output_truncated") {
    return new AppError("model_output_invalid", "The model's reply was cut off, so no result is shown.", undefined, false);
  }
  const local = LOCAL_FAILURES[error.kind];
  if (local) return new AppError("provider_unavailable", local, undefined, false);
  return new AppError("provider_unavailable", "The analysis service is unavailable. Try again later.", error.retryAfterSeconds);
}

/** A retry wait must end at the deadline, so a long `retry-after` cannot hold the request open. */
function waitForRetry(sleep: (ms: number) => Promise<void>, ms: number, deadline: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const expired = () => reject(new AppError("analysis_timeout", "The analysis took too long. Try again."));
    if (deadline.aborted) return expired();
    deadline.addEventListener("abort", expired, { once: true });
    void sleep(ms).then(() => {
      deadline.removeEventListener("abort", expired);
      resolve();
    });
  });
}

/**
 * An abstention wins over anything else in the same reply. Observed in real output: a correct "no_writing" with
 * leftover candidates and writingPresent true. This can only remove claims, so it never makes a reply more certain.
 */
function settleAbstention(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const reply = value as { status?: unknown; candidates?: unknown; observations?: unknown };
  if (typeof reply.status !== "string" || reply.status === "candidates") return value;
  const observations = reply.status === "no_writing" && typeof reply.observations === "object" && reply.observations !== null
    ? { ...reply.observations, writingPresent: false } : reply.observations;
  return { ...reply, candidates: [], observations };
}

function parseOutput(content: string) {
  try {
    return ModelAnalysisSchema.safeParse(settleAbstention(JSON.parse(content)));
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
    repairNote: string | undefined, onProgress: RunOptions["onProgress"]): Promise<ProviderResponse> {
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(this.options.attemptTimeoutMs)]);
    return this.provider.analyze({
      system: this.prompt.system, userText: this.prompt.user, jsonSchema: JSON_SCHEMA,
      image: { mimeType: image.mimeType, bytes: image.bytes }, repairNote, demoScenario, signal, onProgress,
    });
  }

  /** Off unless configured. Keeps exactly what the model said, for research records. It never holds image bytes. */
  private saveRawOutput(requestId: string, attempt: number, content: string): void {
    if (!this.options.rawOutputDir) return;
    mkdirSync(this.options.rawOutputDir, { recursive: true });
    writeFileSync(join(this.options.rawOutputDir, `${requestId}-attempt${attempt}.txt`), content);
  }

  async analyze(image: ProcessedImage, requestId: string, demoScenario?: string, run: RunOptions = {}): Promise<AnalysisResult> {
    const started = performance.now();
    const expiry = AbortSignal.timeout(this.options.deadlineMs);
    const cancelled = () => run.signal?.aborted === true;
    const deadline = run.signal ? AbortSignal.any([expiry, run.signal]) : expiry;
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
        response = await this.call(image, deadline, demoScenario, repaired ? REPAIR_NOTE : undefined, run.onProgress);
      } catch (error) {
        if (cancelled()) throw new AppError("analysis_cancelled", "The analysis was cancelled.", undefined, false);
        if (!(error instanceof ProviderError)) throw error;
        this.logger.warn("provider_failure", { requestId, kind: error.kind, attempt: attempts });
        if (deadline.aborted) throw new AppError("analysis_timeout", "The analysis took too long. Try again.");
        if (error.retryable && providerRetries < this.options.maxRetries) {
          providerRetries += 1;
          await waitForRetry(sleep, Math.min((error.retryAfterSeconds ?? 1) * 1000, MAX_RETRY_WAIT_MS), deadline);
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

      if (cancelled()) throw new AppError("analysis_cancelled", "The analysis was cancelled.", undefined, false);
      this.saveRawOutput(requestId, attempts, response.content);
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
        capabilities: { scriptIdentification: this.provider.simulated ? "simulated" : "available", languageIdentification: "unavailable",
          transcription: "unavailable", transliteration: "unavailable", translation: "unavailable" },
        image: { width: image.width, height: image.height, format: image.sourceFormat, processedBytes: image.bytes.length },
        provenance: {
          simulated: this.provider.simulated, inferenceMode: this.provider.inferenceMode, provider: this.provider.id, modelId: this.provider.modelId,
          modelVersion: response.modelVersion, promptVersion: this.prompt.version, promptSha256: this.prompt.sha256,
          referenceVersion: this.references.version, experimentId: this.options.experimentId,
          analyzedAt: new Date().toISOString(), latencyMs, attempts, inputTokens, outputTokens, estimatedCostUsd: cost,
        },
      };
    }
  }
}
