import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { stream } from "hono/streaming";
import { DEMO_SCENARIOS, DemoScenarioSchema, MAX_CANDIDATES, type AnalysisProgress, type AnalysisResult, type ApiFailure, type ApiSuccess, type RuntimeInfo } from "@scriptecho/contracts";
import type { Config } from "./config";
import { AppError } from "./errors";
import type { Logger } from "./logger";
import { rateLimit } from "./middleware/rateLimit";
import type { ModelHealth, ModelProvider } from "./providers/types";
import type { AnalysisService } from "./services/analysis";
import { ACCEPTED_FORMATS, processUpload } from "./services/intake";
import type { ReferenceService } from "./services/references";
import { createResearchRoutes, type ResearchDependencies } from "./research/routes";

export const REJECTION_CLASSES = ["Cuneiform", "Egyptian hieroglyphs", "No writing"];
const MULTIPART_OVERHEAD = 64 * 1024;
const HEALTH_TIMEOUT_MS = 3000;
const STREAM_TYPE = "application/x-ndjson";
const HEARTBEAT_MS = 15_000;

export type AppEnv = { Variables: { requestId: string } };
export type Dependencies = {
  config: Config;
  logger: Logger;
  provider: ModelProvider;
  references: ReferenceService;
  analysis: AnalysisService;
  promptVersion: string;
  research?: ResearchDependencies;
};

export function createApp({ config, logger, provider, references, analysis, promptVersion, research }: Dependencies) {
  const app = new Hono<AppEnv>();
  let active = 0;

  const success = <T>(requestId: string, data: T): ApiSuccess<T> => ({ ok: true, data, meta: { requestId } });

  app.use("*", async (c, next) => {
    const supplied = c.req.header("x-request-id");
    const requestId = supplied && /^[\w-]{8,64}$/.test(supplied) ? supplied : randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    const started = performance.now();
    await next();
    logger.info("request", { requestId, method: c.req.method, path: c.req.path, status: c.res.status,
      durationMs: Math.round(performance.now() - started) });
  });

  app.use("*", secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"], imgSrc: ["'self'", "blob:", "data:"], styleSrc: ["'self'"],
      scriptSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"],
    },
    referrerPolicy: "no-referrer",
  }));

  // Requests stay on this machine. Host stops DNS rebinding, and Origin stops other websites, whatever Host claims.
  const allowed = new Set(config.allowedHosts);
  app.use("*", async (c, next) => {
    const host = c.req.header("host");
    if (host && !allowed.has(host.toLowerCase())) throw new AppError("forbidden", "This host is not allowed.");
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      let originHost: string | null = null;
      try {
        originHost = origin ? new URL(origin).host : null;
      } catch {
        throw new AppError("forbidden", "This origin is not allowed.");
      }
      const site = c.req.header("sec-fetch-site");
      if ((originHost !== null && !allowed.has(originHost)) || site === "cross-site" || origin === "null") {
        throw new AppError("forbidden", "Requests from other websites are not allowed.");
      }
    }
    await next();
  });

  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? "unknown";
    const known = error instanceof AppError ? error : null;
    if (!known) logger.error("unhandled_error", { requestId, name: error.name });
    const body: ApiFailure = {
      ok: false,
      error: known
        ? { code: known.code, message: known.message, retryable: known.retryable }
        : { code: "internal_error", message: "Something went wrong.", retryable: false },
      meta: { requestId },
    };
    if (known?.retryAfterSeconds) c.header("retry-after", String(known.retryAfterSeconds));
    return c.json(body, (known?.status ?? 500) as 500);
  });

  app.notFound((c) => {
    if (!c.req.path.startsWith("/api") && c.req.method === "GET") return c.text("Not found", 404);
    throw new AppError("not_found", "That resource does not exist.");
  });

  app.get("/health", (c) => c.json(success(c.get("requestId"), { status: "ok" })));

  const modelHealth = (): Promise<ModelHealth> =>
    provider.health?.(AbortSignal.timeout(HEALTH_TIMEOUT_MS)) ?? Promise.resolve({ status: "not_checked", details: null });

  app.get("/ready", async (c) => {
    const health = await modelHealth();
    const ready = references.scriptIds().length > 0 && (health.status === "ready" || health.status === "not_checked");
    return c.json(success(c.get("requestId"), { status: ready ? "ready" : "not_ready", scripts: references.scriptIds().length,
      provider: provider.id, simulated: provider.simulated, inferenceMode: provider.inferenceMode, modelStatus: health.status }), ready ? 200 : 503);
  });

  const api = new Hono<AppEnv>();

  api.get("/runtime", async (c) => {
    const health = await modelHealth();
    const info: RuntimeInfo = {
      provider: provider.id, modelId: provider.modelId, simulated: provider.simulated, inferenceMode: provider.inferenceMode,
      modelStatus: health.status, modelDetails: health.details,
      externalInferenceEnabled: config.allowExternalInference && provider.inferenceMode === "external", promptVersion,
      referenceVersion: references.version, maxUploadBytes: config.maxUploadBytes,
      acceptedFormats: [...ACCEPTED_FORMATS], maxCandidates: MAX_CANDIDATES, rejectionClasses: REJECTION_CLASSES,
    };
    return c.json(success(c.get("requestId"), info));
  });

  api.get("/scripts", (c) => c.json(success(c.get("requestId"), references.list())));

  api.get("/scripts/:id", (c) => {
    const detail = references.detail(c.req.param("id"));
    if (!detail) throw new AppError("not_found", "That script is not in the reference collection.");
    return c.json(success(c.get("requestId"), detail));
  });

  api.get("/comparisons", (c) => {
    const a = c.req.query("a");
    const b = c.req.query("b");
    if (!a || !b || a === b) throw new AppError("invalid_request", "Choose two different scripts to compare.");
    const comparison = references.compare(a, b);
    if (!comparison) throw new AppError("not_found", "One of those scripts is not in the reference collection.");
    return c.json(success(c.get("requestId"), comparison));
  });

  const withSlot = async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= config.maxConcurrentAnalyses) {
      throw new AppError("rate_limited", "An analysis is already running. Wait for it to finish, or cancel it.", 5);
    }
    // The slot is claimed before the first await, so parallel uploads cannot all pass the check.
    active += 1;
    try {
      return await work();
    } finally {
      active -= 1;
    }
  };

  /** Validates the upload and runs one analysis. Shared by the JSON and streamed responses. */
  const runAnalysis = (c: Context<AppEnv>, signal: AbortSignal, onProgress?: (progress: AnalysisProgress) => void) => withSlot(async () => {
    const form = await c.req.parseBody({ all: true }).catch(() => {
      throw new AppError("invalid_request", "Send the image as multipart form data.");
    });
    const file = form.image;
    if (Array.isArray(file) || !(file instanceof File)) {
      throw new AppError("invalid_request", "Send exactly one file in the image field.");
    }
    let demoScenario: string | undefined;
    if (provider.simulated && typeof form.demoScenario === "string") {
      const parsed = DemoScenarioSchema.safeParse(form.demoScenario);
      if (!parsed.success) {
        throw new AppError("invalid_request", `Unknown demo scenario. Use one of: ${DEMO_SCENARIOS.join(", ")}.`);
      }
      demoScenario = parsed.data;
    }
    onProgress?.({ stage: "received" });
    const image = await processUpload(Buffer.from(await file.arrayBuffer()), {
      maxBytes: config.maxUploadBytes, maxPixels: config.maxImagePixels, maxEdge: config.maxModelImageEdge,
    });
    onProgress?.({ stage: "analysing" });
    return await analysis.analyze(image, c.get("requestId"), demoScenario, { signal, onProgress });
  });

  const failureBody = (error: unknown, requestId: string): ApiFailure => {
    const known = error instanceof AppError ? error : null;
    if (!known) logger.error("unhandled_error", { requestId, name: error instanceof Error ? error.name : "unknown" });
    return { ok: false, meta: { requestId }, error: known
      ? { code: known.code, message: known.message, retryable: known.retryable }
      : { code: "internal_error", message: "Something went wrong.", retryable: false } };
  };

  type Run = (signal: AbortSignal, onProgress?: (progress: AnalysisProgress) => void) => Promise<AnalysisResult>;
  const respond = async (c: Context<AppEnv>, run: Run) => {
    const requestId = c.get("requestId");
    if (!c.req.header("accept")?.includes(STREAM_TYPE)) return c.json(success(requestId, await run(c.req.raw.signal)));
    // Headers go out at once, so no client or proxy waits minutes for them, and progress can be shown.
    c.header("content-type", STREAM_TYPE);
    return stream(c, async (output) => {
      const cancel = new AbortController();
      output.onAbort(() => cancel.abort());
      const write = (event: unknown) => { void output.write(`${JSON.stringify(event)}\n`); };
      const heartbeat = setInterval(() => write({ type: "heartbeat" }), HEARTBEAT_MS);
      try {
        write({ type: "result", body: success(requestId, await run(cancel.signal, (progress) => write({ type: "progress", progress }))) });
      } catch (error) {
        write({ type: "result", body: failureBody(error, requestId) });
      } finally {
        clearInterval(heartbeat);
      }
    });
  };

  api.post("/analyses",
    // A forwarded address is client-supplied unless a trusted proxy sets it, so it is ignored by default.
    rateLimit(config.rateLimitPerMinute, (header) => (config.trustProxy && header("x-forwarded-for")?.split(",")[0]?.trim()) || "local"),
    bodyLimit({
      maxSize: config.maxUploadBytes + MULTIPART_OVERHEAD,
      onError: () => { throw new AppError("file_too_large", "The uploaded file is too large."); },
    }),
    (c) => respond(c, (signal, onProgress) => runAnalysis(c, signal, onProgress)));

  if (research) api.route("/", createResearchRoutes({ ...research, config, references, analysis, respond, withSlot, success }));

  app.route("/api/v1", api);
  return app;
}
