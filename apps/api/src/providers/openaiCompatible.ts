import { ProviderError, type ModelProvider, type ProviderErrorKind, type ProviderRequest, type ProviderResponse } from "./types";

type Options = {
  id: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  inputUsdPerMtok: number | null;
  outputUsdPerMtok: number | null;
  fetchImpl?: typeof fetch;
};

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "credit_exhausted";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "bad_request";
}

/** Disabled by default. Tests use a fake fetch. Real use needs ALLOW_EXTERNAL_INFERENCE and has never been run. */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly modelId: string;
  readonly simulated = false;
  readonly inputUsdPerMtok: number | null;
  readonly outputUsdPerMtok: number | null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: Options) {
    this.id = options.id;
    this.modelId = options.modelId;
    this.inputUsdPerMtok = options.inputUsdPerMtok;
    this.outputUsdPerMtok = options.outputUsdPerMtok;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async analyze(request: ProviderRequest): Promise<ProviderResponse> {
    const dataUrl = `data:${request.image.mimeType};base64,${request.image.bytes.toString("base64")}`;
    const userText = request.repairNote ? `${request.userText}\n\n${request.repairNote}` : request.userText;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: request.signal,
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelId,
          temperature: 0,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: [{ type: "text", text: userText }, { type: "image_url", image_url: { url: dataUrl } }] },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "script_analysis", strict: true, schema: request.jsonSchema },
          },
        }),
      });
    } catch (error) {
      if (request.signal.aborted) throw new ProviderError("timeout", "Provider request timed out");
      throw new ProviderError("unavailable", error instanceof Error ? error.message : "Network failure");
    }

    if (!response.ok) {
      const retryAfter = Number(response.headers.get("retry-after"));
      // Provider error bodies can echo request data, so only the status is kept.
      throw new ProviderError(kindForStatus(response.status), `Provider returned ${response.status}`,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }

    let body: { error?: unknown; model?: string; choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number } };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new ProviderError("bad_response", "Provider response was not JSON");
    }
    if (body.error) throw new ProviderError("unavailable", "Provider reported an upstream failure");
    const choice = body.choices?.[0];
    if (!choice) throw new ProviderError("bad_response", "Provider response had no choices");

    const usage = body.usage;
    return {
      content: choice.message?.content ?? "",
      modelVersion: body.model ?? null,
      usage: usage?.prompt_tokens !== undefined && usage.completion_tokens !== undefined
        ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } : null,
    };
  }
}
