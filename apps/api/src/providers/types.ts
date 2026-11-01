export type ProviderErrorKind =
  | "timeout" | "rate_limited" | "unavailable" | "credit_exhausted" | "auth" | "bad_request" | "bad_response";

export class ProviderError extends Error {
  constructor(readonly kind: ProviderErrorKind, message: string, readonly retryAfterSeconds?: number) {
    super(message);
  }

  get retryable(): boolean {
    return this.kind === "timeout" || this.kind === "rate_limited" || this.kind === "unavailable";
  }
}

export type ProviderUsage = { inputTokens: number; outputTokens: number };

export type ProviderRequest = {
  system: string;
  userText: string;
  image: { mimeType: string; bytes: Buffer };
  jsonSchema: Record<string, unknown>;
  repairNote?: string;
  demoScenario?: string;
  signal: AbortSignal;
};

export type ProviderResponse = {
  content: string;
  modelVersion: string | null;
  usage: ProviderUsage | null;
};

/** The one seam between ScriptEcho and any model. It returns raw text, so every provider faces the same validation. */
export interface ModelProvider {
  readonly id: string;
  readonly modelId: string;
  readonly simulated: boolean;
  readonly inputUsdPerMtok: number | null;
  readonly outputUsdPerMtok: number | null;
  analyze(request: ProviderRequest): Promise<ProviderResponse>;
}
