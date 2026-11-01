import type { AnalysisProgress, AnalysisResult, ApiError, ApiResponse, CaseSummary, Comparison, DemoScenario, LanguageSummary, ResearchCase, ReviewState, Reviewer, RuntimeInfo, ScriptDetail, ScriptSummary, SignInventory, SignToken, SuggestionReport, TranslationHypothesis, Transliteration } from "@scriptecho/contracts";

export class ApiClientError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
  }
}

const CONNECTION_ERROR: ApiError = { code: "internal_error", message: "PALEON could not reach its server. Check that it is running, then try again.", retryable: true };
const CANCELLED: ApiError = { code: "analysis_cancelled", message: "The analysis was cancelled.", retryable: true };
const STREAM_TYPE = "application/x-ndjson";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, init);
  } catch {
    throw new ApiClientError(CONNECTION_ERROR);
  }
  return unwrap<T>(response);
}

async function unwrap<T>(response: Response): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(CONNECTION_ERROR);
  }
  if (!body.ok) throw new ApiClientError(body.error);
  return body.data;
}

type StreamEvent = { type: "heartbeat" } | { type: "progress"; progress: AnalysisProgress } | { type: "result"; body: ApiResponse<AnalysisResult> };

/** A result counts only if its final event arrives. A stream that ends early is an error, never a partial result. */
async function readStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal | undefined, onProgress?: (progress: AnalysisProgress) => void) {
  const reader = stream.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  let pending = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new ApiClientError(CONNECTION_ERROR);
      pending += value;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === "progress") onProgress?.(event.progress);
        if (event.type === "result") {
          if (!event.body.ok) throw new ApiClientError(event.body.error);
          return event.body.data;
        }
      }
    }
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError(signal?.aborted ? CANCELLED : CONNECTION_ERROR);
  }
}

export const api = {
  runtime: () => request<RuntimeInfo>("/runtime"),
  scripts: () => request<ScriptSummary[]>("/scripts"),
  script: (id: string) => request<ScriptDetail>(`/scripts/${encodeURIComponent(id)}`),
  compare: (a: string, b: string) => request<Comparison>(`/comparisons?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  analyze: async (file: File, demoScenario: DemoScenario | undefined, signal?: AbortSignal, onProgress?: (progress: AnalysisProgress) => void) => {
    const form = new FormData();
    form.set("image", file);
    if (demoScenario) form.set("demoScenario", demoScenario);
    let response: Response;
    try {
      response = await fetch("/api/v1/analyses", { method: "POST", body: form, signal, headers: { Accept: STREAM_TYPE } });
    } catch {
      throw new ApiClientError(signal?.aborted ? CANCELLED : CONNECTION_ERROR);
    }
    if (!response.headers?.get("content-type")?.includes(STREAM_TYPE) || !response.body) return unwrap<AnalysisResult>(response);
    return readStream(response.body, signal, onProgress);
  },
};

const send = <T>(path: string, method: string, body?: unknown) =>
  request<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
const base = (id: string) => `/cases/${encodeURIComponent(id)}`;

export const research = {
  cases: () => request<CaseSummary[]>("/cases"),
  get: (id: string) => request<ResearchCase>(base(id)),
  create: (form: FormData) => request<ResearchCase>("/cases", { method: "POST", body: form }),
  update: (id: string, change: { expectedRevision: number; scriptId?: string | null; languageId?: string | null }) => send<ResearchCase>(base(id), "PATCH", change),
  remove: (id: string) => send<{ deleted: boolean }>(base(id), "DELETE"),
  segment: (id: string, expectedRevision: number) => send<ResearchCase>(`${base(id)}/segment`, "POST", { expectedRevision }),
  saveTokens: (id: string, expectedRevision: number, tokens: SignToken[], reviewer: Reviewer, evidence: string | null) =>
    send<ResearchCase>(`${base(id)}/tokens`, "PUT", { expectedRevision, tokens, reviewer, evidence }),
  suggestions: (id: string) => request<SuggestionReport>(`${base(id)}/suggestions`),
  teach: (id: string, tokenId: string, approvedBy: Reviewer) => send<unknown>(`${base(id)}/exemplars`, "POST", { tokenId, approvedBy }),
  transliteration: (id: string, scheme: string) => request<Transliteration | null>(`${base(id)}/transliteration?scheme=${encodeURIComponent(scheme)}`),
  translation: (id: string) => request<TranslationHypothesis | null>(`${base(id)}/translation`),
  addNote: (id: string, expectedRevision: number, author: string, text: string) => send<ResearchCase>(`${base(id)}/notes`, "POST", { expectedRevision, author, text }),
  addCitation: (id: string, expectedRevision: number, text: string, url: string | null) => send<ResearchCase>(`${base(id)}/citations`, "POST", { expectedRevision, text, url }),
  review: (id: string, body: { expectedRevision: number; state: ReviewState; reviewer: Reviewer; evidence: string; attestsQualified: boolean }) =>
    send<ResearchCase>(`${base(id)}/review`, "POST", body),
  inventory: (scriptId: string) => request<SignInventory>(`/scripts/${encodeURIComponent(scriptId)}/signs`),
  languages: () => request<LanguageSummary[]>("/languages"),
  identify: async (id: string, onProgress?: (progress: AnalysisProgress) => void) => {
    let response: Response;
    try {
      response = await fetch(`/api/v1${base(id)}/analysis`, { method: "POST", headers: { Accept: STREAM_TYPE } });
    } catch {
      throw new ApiClientError(CONNECTION_ERROR);
    }
    if (!response.headers?.get("content-type")?.includes(STREAM_TYPE) || !response.body) return unwrap<AnalysisResult>(response);
    return readStream(response.body, undefined, onProgress);
  },
  imageUrl: (id: string) => `/api/v1${base(id)}/image`,
  reportUrl: (id: string, format: "markdown" | "json") => `/api/v1${base(id)}/report?format=${format}`,
};
