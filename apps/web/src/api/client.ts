import type { AnalysisResult, ApiError, ApiResponse, Comparison, DemoScenario, RuntimeInfo, ScriptDetail, ScriptSummary } from "@scriptecho/contracts";

export class ApiClientError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
  }
}

const CONNECTION_ERROR: ApiError = { code: "internal_error", message: "ScriptEcho could not reach its server. Check that it is running, then try again.", retryable: true };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, init);
  } catch {
    throw new ApiClientError(CONNECTION_ERROR);
  }
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(CONNECTION_ERROR);
  }
  if (!body.ok) throw new ApiClientError(body.error);
  return body.data;
}

export const api = {
  runtime: () => request<RuntimeInfo>("/runtime"),
  scripts: () => request<ScriptSummary[]>("/scripts"),
  script: (id: string) => request<ScriptDetail>(`/scripts/${encodeURIComponent(id)}`),
  compare: (a: string, b: string) => request<Comparison>(`/comparisons?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  analyze: (file: File, demoScenario?: DemoScenario) => {
    const form = new FormData();
    form.set("image", file);
    if (demoScenario) form.set("demoScenario", demoScenario);
    return request<AnalysisResult>("/analyses", { method: "POST", body: form });
  },
};
