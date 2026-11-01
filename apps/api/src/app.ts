import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { DEMO_SCENARIOS, DemoScenarioSchema, MAX_CANDIDATES, type ApiFailure, type ApiSuccess, type RuntimeInfo } from "@scriptecho/contracts";
import type { Config } from "./config";
import { AppError } from "./errors";
import type { Logger } from "./logger";
import { rateLimit } from "./middleware/rateLimit";
import type { ModelProvider } from "./providers/types";
import type { AnalysisService } from "./services/analysis";
import { ACCEPTED_FORMATS, processUpload } from "./services/intake";
import type { ReferenceService } from "./services/references";

export const REJECTION_CLASSES = ["Cuneiform", "Egyptian hieroglyphs", "No writing"];
const MULTIPART_OVERHEAD = 64 * 1024;

type Env = { Variables: { requestId: string } };
export type Dependencies = {
  config: Config;
  logger: Logger;
  provider: ModelProvider;
  references: ReferenceService;
  analysis: AnalysisService;
  promptVersion: string;
};

export function createApp({ config, logger, provider, references, analysis, promptVersion }: Dependencies) {
  const app = new Hono<Env>();
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

  app.get("/ready", (c) => {
    const ready = references.scriptIds().length > 0;
    return c.json(success(c.get("requestId"), { status: ready ? "ready" : "not_ready", scripts: references.scriptIds().length,
      provider: provider.id, simulated: provider.simulated }), ready ? 200 : 503);
  });

  const api = new Hono<Env>();

  api.get("/runtime", (c) => {
    const info: RuntimeInfo = {
      provider: provider.id, modelId: provider.modelId, simulated: provider.simulated,
      externalInferenceEnabled: config.allowExternalInference && !provider.simulated, promptVersion,
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

  api.post("/analyses",
    // A forwarded address is client-supplied unless a trusted proxy sets it, so it is ignored by default.
    rateLimit(config.rateLimitPerMinute, (header) => (config.trustProxy && header("x-forwarded-for")?.split(",")[0]?.trim()) || "local"),
    bodyLimit({
      maxSize: config.maxUploadBytes + MULTIPART_OVERHEAD,
      onError: () => { throw new AppError("file_too_large", "The uploaded file is too large."); },
    }),
    async (c) => {
      if (active >= config.maxConcurrentAnalyses) {
        throw new AppError("rate_limited", "The service is busy. Try again shortly.", 5);
      }
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
      active += 1;
      try {
        const image = await processUpload(Buffer.from(await file.arrayBuffer()), {
          maxBytes: config.maxUploadBytes, maxPixels: config.maxImagePixels, maxEdge: config.maxModelImageEdge,
        });
        const result = await analysis.analyze(image, c.get("requestId"), demoScenario);
        return c.json(success(c.get("requestId"), result));
      } finally {
        active -= 1;
      }
    });

  app.route("/api/v1", api);
  return app;
}
