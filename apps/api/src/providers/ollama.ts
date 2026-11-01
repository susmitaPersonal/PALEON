import { postLocal, type LocalReply, type LocalTransport } from "./localHttp";
import { ProviderError, type ModelHealth, type ModelProvider, type ProviderErrorKind, type ProviderRequest, type ProviderResponse } from "./types";

type Options = {
  baseUrl: string;
  modelId: string;
  numCtx: number;
  numPredict: number;
  keepAlive: string;
  seed: number;
  transport?: LocalTransport;
};

type ChatChunk = { error?: unknown; model?: string; done?: boolean; done_reason?: string; message?: { content?: string | null };
  prompt_eval_count?: number; eval_count?: number };

const HEALTH_FAILURES: Record<Exclude<ModelHealth["status"], "ready" | "not_checked">, [ProviderErrorKind, string]> = {
  server_unreachable: ["unavailable", "Ollama is not reachable"],
  model_not_installed: ["model_not_installed", "The local model is not installed"],
  no_vision_support: ["model_unsupported", "The model does not report image input"],
  not_local: ["model_unsupported", "The model runs remotely, so the image will not be sent"],
};

async function readAll(reply: LocalReply): Promise<string> {
  let text = "";
  for await (const line of reply.lines) text += line;
  return text;
}

/** Local inference through Ollama's own API. Every image is sent only after the model is confirmed local and vision-capable. */
export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly modelId: string;
  readonly simulated = false;
  readonly inferenceMode = "local";
  readonly inputUsdPerMtok = null;
  readonly outputUsdPerMtok = null;
  private readonly transport: LocalTransport;
  private readonly baseUrl: string;

  constructor(private readonly options: Options) {
    this.modelId = options.modelId;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.transport = options.transport ?? postLocal;
  }

  async health(signal: AbortSignal): Promise<ModelHealth> {
    const unknown: ModelHealth = { status: "server_unreachable", details: null };
    let reply: LocalReply;
    let text: string;
    try {
      reply = await this.transport(`${this.baseUrl}/api/show`, { model: this.modelId }, signal);
      text = await readAll(reply);
    } catch {
      return unknown;
    }
    if (reply.status === 404) return { status: "model_not_installed", details: null };
    if (reply.status !== 200) return unknown;
    let body: { capabilities?: unknown; remote_host?: unknown; remote_model?: unknown;
      details?: { family?: string; parameter_size?: string; quantization_level?: string } };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return unknown;
    }
    const details = { family: body.details?.family ?? null, parameterSize: body.details?.parameter_size ?? null,
      quantization: body.details?.quantization_level ?? null };
    // Cloud models appear through the same local server, so a loopback address alone does not keep an image here.
    if (body.remote_host || body.remote_model) return { status: "not_local", details };
    const vision = Array.isArray(body.capabilities) && body.capabilities.includes("vision");
    const thinking = Array.isArray(body.capabilities) && body.capabilities.includes("thinking");
    return { status: vision ? "ready" : "no_vision_support", details, thinking };
  }

  async analyze(request: ProviderRequest): Promise<ProviderResponse> {
    const health = await this.health(request.signal);
    if (health.status !== "ready" && health.status !== "not_checked") {
      if (request.signal.aborted) throw new ProviderError("timeout", "Ollama did not respond in time");
      const [kind, message] = HEALTH_FAILURES[health.status];
      throw new ProviderError(kind, message);
    }
    const userText = request.repairNote ? `${request.userText}\n\n${request.repairNote}` : request.userText;
    const body = {
      model: this.modelId, stream: true, keep_alive: this.options.keepAlive, format: request.jsonSchema,
      // Observed on Ollama 0.40.3: a thinking model can spend every token thinking and return empty content.
      ...(health.thinking ? { think: false } : {}),
      options: { temperature: 0, seed: this.options.seed, num_ctx: this.options.numCtx, num_predict: this.options.numPredict },
      messages: [{ role: "system", content: request.system },
        { role: "user", content: userText, images: [request.image.bytes.toString("base64")] }],
    };
    try {
      return await this.collect(await this.transport(`${this.baseUrl}/api/chat`, body, request.signal), request);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (request.signal.aborted) throw new ProviderError("timeout", "Ollama did not respond in time");
      throw new ProviderError("unavailable", "Ollama is not reachable");
    }
  }

  private async collect(reply: LocalReply, request: ProviderRequest): Promise<ProviderResponse> {
    if (reply.status !== 200) {
      const text = await readAll(reply);
      let error: unknown;
      try {
        error = (JSON.parse(text) as ChatChunk).error;
      } catch {
        error = undefined;
      }
      throw failure(reply.status, error);
    }
    let content = "";
    let tokens = 0;
    let last: ChatChunk | null = null;
    for await (const line of reply.lines) {
      let chunk: ChatChunk;
      try {
        chunk = JSON.parse(line) as ChatChunk;
      } catch {
        throw new ProviderError("bad_response", "Ollama reply was not JSON");
      }
      if (chunk.error) throw failure(reply.status, chunk.error);
      content += chunk.message?.content ?? "";
      tokens += 1;
      request.onProgress?.({ stage: "generating", tokens });
      last = chunk;
    }
    // A stream that ends with no final chunk is incomplete, so it can never become a result.
    if (!last?.done) throw new ProviderError("bad_response", "Ollama ended the reply early");
    if (last.done_reason === "length") throw new ProviderError("output_truncated", "The model ran out of output tokens");
    return {
      content,
      modelVersion: last.model ?? this.modelId,
      usage: last.prompt_eval_count !== undefined && last.eval_count !== undefined
        ? { inputTokens: last.prompt_eval_count, outputTokens: last.eval_count } : null,
    };
  }
}

/** The error text only selects a fixed kind, because it can echo request data. */
function failure(status: number, error: unknown): ProviderError {
  const text = typeof error === "string" ? error : "";
  if (status === 404 || /model .*not found/i.test(text)) return new ProviderError("model_not_installed", "The local model is not installed");
  if (/load|runner|memory|terminated/i.test(text)) return new ProviderError("model_load_failed", "The local model could not be loaded");
  if (status === 429) return new ProviderError("rate_limited", "Ollama is busy");
  if (status === 400) return new ProviderError("bad_request", `Ollama returned ${status}`);
  return new ProviderError("unavailable", `Ollama returned ${status}`);
}
