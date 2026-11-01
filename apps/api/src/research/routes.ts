import { randomUUID } from "node:crypto";
import { statfsSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  AddCitationSchema, AddExemplarSchema, AddNoteSchema, CreateCaseFieldsSchema, DemoScenarioSchema, ReviewRequestSchema, SaveTokensSchema, SegmentRequestSchema, UpdateCaseSchema,
  type AnalysisProgress, type AnalysisResult, type ResearchCase, type SignToken,
} from "@scriptecho/contracts";
import type { z } from "zod";
import type { AppEnv } from "../app";
import type { Config } from "../config";
import { AppError } from "../errors";
import { rateLimit } from "../middleware/rateLimit";
import type { AnalysisService } from "../services/analysis";
import { processUpload } from "../services/intake";
import type { ReferenceService } from "../services/references";
import type { ResearchKnowledge } from "./knowledge";
import { buildReport, reportMarkdown } from "./report";
import type { CaseStore } from "./store";
import { suggestReadings } from "./suggestions";
import { buildHypothesis } from "./translation";
import { transliterate } from "./transliteration";
import { decodeGray, encodeFeatures, looksLikeTexture, measureQuality, segmentSigns, signFeatures } from "./vision";

const RESEARCH_MAX_EDGE = 4096;
const MULTIPART_OVERHEAD = 64 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MIN_VISION_RAM_GB = 8;

export type ResearchDependencies = { store: CaseStore; knowledge: ResearchKnowledge };
type Run = (signal: AbortSignal, onProgress?: (progress: AnalysisProgress) => void) => Promise<AnalysisResult>;
type RouteDependencies = ResearchDependencies & {
  config: Config;
  references: ReferenceService;
  analysis: AnalysisService;
  /** Answers as JSON or a progress stream, whichever the client asked for. */
  respond: (c: Context<AppEnv>, run: Run) => Promise<Response> | Response;
  withSlot: <T>(work: () => Promise<T>) => Promise<T>;
  success: <T>(requestId: string, data: T) => unknown;
};

const sameReading = (first: SignToken, second: SignToken) => {
  const { origin: _a, ...left } = first;
  const { origin: _b, ...right } = second;
  return JSON.stringify(left) === JSON.stringify(right);
};

export function createResearchRoutes({ store, knowledge, config, references, analysis, respond, withSlot, success }: RouteDependencies) {
  const routes = new Hono<AppEnv>();
  const ok = (c: Context<AppEnv>, data: unknown) => c.json(success(c.get("requestId"), data) as object);
  const json = bodyLimit({ maxSize: MAX_JSON_BYTES, onError: () => { throw new AppError("file_too_large", "The request is too large."); } });

  const parse = async <S extends z.ZodType>(c: Context<AppEnv>, schema: S): Promise<z.infer<S>> => {
    const body = await c.req.json().catch(() => { throw new AppError("invalid_request", "Send a JSON body."); });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new AppError("invalid_request", parsed.error.issues[0]?.message ?? "The request is not valid.");
    return parsed.data;
  };

  const inventoryOf = (record: ResearchCase) => (record.scriptId ? knowledge.inventory(record.scriptId) : null);
  const readingOf = (record: ResearchCase, scheme?: string) => {
    const inventory = inventoryOf(record);
    return inventory ? transliterate(record.tokens, inventory, scheme) : null;
  };
  const hypothesisOf = (record: ResearchCase) => {
    const reading = readingOf(record);
    return reading ? buildHypothesis(reading, record.languageId ? knowledge.language(record.languageId) : null, record.reviewState) : null;
  };

  routes.get("/system", (c) => {
    const disk = statfsSync(config.dataDir);
    const totalMemoryGb = Math.round(totalmem() / 2 ** 30);
    return ok(c, { totalMemoryGb, freeDiskGb: Math.round((Number(disk.bavail) * Number(disk.bsize)) / 2 ** 30), cpuCores: cpus().length,
      localVisionFeasible: totalMemoryGb >= MIN_VISION_RAM_GB,
      note: "A rule of thumb from this project's observed runs. Analysis is slow near the minimum, and no download is ever started from here." });
  });

  routes.get("/scripts/:id/signs", (c) => {
    const inventory = knowledge.inventory(c.req.param("id"));
    if (!inventory) throw new AppError("not_found", "That script has no sign inventory.");
    return ok(c, inventory);
  });

  routes.get("/languages", (c) => ok(c, knowledge.languageList()));
  routes.get("/cases", (c) => ok(c, store.list()));

  routes.post("/cases",
    rateLimit(config.rateLimitPerMinute, () => "local"),
    bodyLimit({ maxSize: config.maxUploadBytes + MULTIPART_OVERHEAD, onError: () => { throw new AppError("file_too_large", "The uploaded file is too large."); } }),
    async (c) => {
      const form = await c.req.parseBody({ all: true }).catch(() => { throw new AppError("invalid_request", "Send the image as multipart form data."); });
      const file = form.image;
      if (Array.isArray(file) || !(file instanceof File)) throw new AppError("invalid_request", "Send exactly one file in the image field.");
      const fields = CreateCaseFieldsSchema.safeParse({ title: form.title, sourceDescription: form.sourceDescription ?? "", rights: form.rights ?? "" });
      if (!fields.success) throw new AppError("invalid_request", "Give the case a title.");
      const image = await processUpload(Buffer.from(await file.arrayBuffer()), { maxBytes: config.maxUploadBytes, maxPixels: config.maxImagePixels, maxEdge: RESEARCH_MAX_EDGE });
      const created = store.create({ title: fields.data.title, provenance: { sourceDescription: fields.data.sourceDescription, rights: fields.data.rights },
        image: image.bytes, width: image.width, height: image.height, sourceFormat: image.sourceFormat });
      const quality = await measureQuality(image.bytes);
      return ok(c, store.update(created.id, created.revision, { action: "Image quality measured" }, (record) => { record.quality = quality; }));
    });

  routes.get("/cases/:id", (c) => ok(c, store.get(c.req.param("id"))));

  routes.delete("/cases/:id", (c) => {
    store.delete(c.req.param("id"));
    return ok(c, { deleted: true });
  });

  routes.get("/cases/:id/image", (c) => {
    const bytes = store.image(c.req.param("id"));
    return c.body(new Uint8Array(bytes), 200, { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" });
  });

  routes.patch("/cases/:id", json, async (c) => {
    const change = await parse(c, UpdateCaseSchema);
    return ok(c, store.update(c.req.param("id"), change.expectedRevision, { action: "Case details changed" }, (record) => {
      if (change.title !== undefined) record.title = change.title;
      if (change.scriptId !== undefined && change.scriptId !== record.scriptId) {
        if (change.scriptId && !knowledge.inventory(change.scriptId)) throw new AppError("invalid_request", "That script has no sign inventory.");
        // Readings are sign IDs of one inventory, so changing script would silently change their meaning.
        if (record.tokens.some((token) => token.readings.length > 0)) throw new AppError("conflict", "Clear the readings before changing the script.");
        record.scriptId = change.scriptId;
      }
      if (change.languageId !== undefined) {
        if (change.languageId) {
          const language = knowledge.language(change.languageId);
          if (!language) throw new AppError("invalid_request", "That language is not available.");
          if (!record.scriptId || !language.scriptIds.includes(record.scriptId)) throw new AppError("invalid_request", "That language has no pack for this script.");
        }
        record.languageId = change.languageId;
      }
    }));
  });

  routes.post("/cases/:id/analysis", (c) => respond(c, (signal, onProgress) => withSlot(async () => {
    const id = c.req.param("id")!;
    const image = await processUpload(store.image(id), { maxBytes: Number.MAX_SAFE_INTEGER, maxPixels: config.maxImagePixels, maxEdge: config.maxModelImageEdge });
    onProgress?.({ stage: "analysing" });
    const scenario = c.req.query("demoScenario");
    const demoScenario = scenario === undefined ? undefined : DemoScenarioSchema.safeParse(scenario).data;
    const result = await analysis.analyze(image, c.get("requestId"), demoScenario, { signal, onProgress });
    const record = store.get(id);
    store.update(id, record.revision, { action: `Script identification run (${result.provenance.inferenceMode})` }, (draft) => { draft.analysis = result; });
    return result;
  })));

  routes.post("/cases/:id/segment", json, async (c) => {
    const { expectedRevision } = await parse(c, SegmentRequestSchema);
    const id = c.req.param("id");
    const record = store.get(id);
    if (record.tokens.some((token) => token.origin !== "rule_based" || token.status !== "unread")) {
      throw new AppError("conflict", "This case holds readings, and proposing boxes again would replace them.");
    }
    const direction = record.scriptId ? references.facts(record.scriptId)?.direction : null;
    const tokens = await segmentSigns(store.image(id), record.image, direction === "right_to_left");
    return ok(c, store.update(id, expectedRevision, { action: `Sign boxes proposed by rule (${tokens.length}${looksLikeTexture(tokens) ? ", likely surface texture" : ""})`, recordTokens: true }, (draft) => { draft.tokens = tokens; }));
  });

  routes.put("/cases/:id/tokens", json, async (c) => {
    const { expectedRevision, tokens, reviewer, evidence } = await parse(c, SaveTokensSchema);
    const id = c.req.param("id");
    const record = store.get(id);
    const inventory = inventoryOf(record);
    if (new Set(tokens.map((token) => token.id)).size !== tokens.length) throw new AppError("invalid_request", "Token IDs must be unique.");
    for (const token of tokens) {
      if (token.box && (token.box.x + token.box.width > record.image.width || token.box.y + token.box.height > record.image.height)) {
        throw new AppError("invalid_request", `Token ${token.id} falls outside the image.`);
      }
      const unknown = token.readings.flatMap((reading) => reading.signIds).find((signId) => !inventory?.signs.some((sign) => sign.id === signId));
      if (unknown) throw new AppError("invalid_request", inventory ? `Sign ${unknown} is not in this script's inventory.` : "Set a script before entering readings.");
    }
    const stored = new Map(record.tokens.map((token) => [token.id, token]));
    // Origin is decided here, so no client can label its own text as reviewed.
    const labelled = tokens.map((token) => {
      const previous = stored.get(token.id);
      return previous && sameReading(previous, token) ? previous : { ...token, origin: "human_corrected" as const };
    });
    const changed = labelled.some((token, index) => token !== stored.get(token.id) || record.tokens[index]?.id !== token.id) || labelled.length !== record.tokens.length;
    return ok(c, store.update(id, expectedRevision, { action: "Sign readings corrected", reviewer, evidence, recordTokens: true }, (draft) => {
      draft.tokens = labelled;
      // An approval covers the reading that was approved, so changing that reading withdraws it.
      if (changed && draft.reviewState === "approved_by_expert") draft.reviewState = "in_review";
    }));
  });

  routes.get("/cases/:id/transliteration", (c) => {
    const record = store.get(c.req.param("id"));
    const scheme = c.req.query("scheme");
    const inventory = inventoryOf(record);
    if (scheme && inventory && !inventory.schemes.some((item) => item.id === scheme)) throw new AppError("invalid_request", "That transliteration scheme is not available.");
    return ok(c, readingOf(record, scheme));
  });

  routes.get("/cases/:id/translation", (c) => ok(c, hypothesisOf(store.get(c.req.param("id")))));

  routes.get("/cases/:id/suggestions", async (c) => {
    const id = c.req.param("id");
    const record = store.get(id);
    const inventory = inventoryOf(record);
    if (!inventory) throw new AppError("invalid_request", "Set a script before asking for suggestions.");
    return ok(c, suggestReadings(record, await decodeGray(store.image(id)), inventory, store.exemplars(inventory.scriptId)));
  });

  routes.post("/cases/:id/exemplars", json, async (c) => {
    const { tokenId, approvedBy } = await parse(c, AddExemplarSchema);
    const id = c.req.param("id");
    const record = store.get(id);
    const token = record.tokens.find((item) => item.id === tokenId);
    if (!token || !record.scriptId) throw new AppError("not_found", "That sign does not exist in this case.");
    const signIds = token.readings[0]?.signIds ?? [];
    const person = token.origin === "human_corrected" || token.origin === "expert_reviewed";
    if (!token.box || token.status !== "certain" || signIds.length !== 1 || !person) {
      throw new AppError("invalid_request", "Only one clearly read sign, confirmed by a person, can teach PALEON.");
    }
    const features = signFeatures(await decodeGray(store.image(id)), token.box, record.image);
    return ok(c, store.addExemplar({ scriptId: record.scriptId, signId: signIds[0]!, caseId: id, tokenId, approvedBy, features: encodeFeatures(features) }));
  });

  routes.post("/cases/:id/notes", json, async (c) => {
    const { expectedRevision, author, text } = await parse(c, AddNoteSchema);
    return ok(c, store.update(c.req.param("id"), expectedRevision, { action: "Research note added" }, (record) => {
      record.notes.push({ id: randomUUID(), at: new Date().toISOString(), author, text });
    }));
  });

  routes.post("/cases/:id/citations", json, async (c) => {
    const { expectedRevision, text, url } = await parse(c, AddCitationSchema);
    return ok(c, store.update(c.req.param("id"), expectedRevision, { action: "Citation added" }, (record) => {
      record.citations.push({ id: randomUUID(), at: new Date().toISOString(), text, url });
    }));
  });

  routes.post("/cases/:id/review", json, async (c) => {
    const { expectedRevision, state, reviewer, evidence } = await parse(c, ReviewRequestSchema);
    return ok(c, store.update(c.req.param("id"), expectedRevision, { action: `Review state set to ${state}`, reviewer, evidence, recordTokens: true }, (record) => {
      record.reviewState = state;
      if (state === "approved_by_expert") {
        record.tokens = record.tokens.map((token) => (token.readings.length > 0 ? { ...token, origin: "expert_reviewed" as const } : token));
      }
    }));
  });

  routes.get("/cases/:id/report", (c) => {
    const record = store.get(c.req.param("id"));
    const format = c.req.query("format") ?? "markdown";
    if (format !== "markdown" && format !== "json") throw new AppError("invalid_request", "Choose markdown or json.");
    const report = buildReport(record, inventoryOf(record), readingOf(record), hypothesisOf(record));
    c.header("content-disposition", `attachment; filename="paleon-${record.id}.${format === "json" ? "json" : "md"}"`);
    if (format === "json") return c.json(report);
    return c.body(reportMarkdown(report), 200, { "content-type": "text/markdown; charset=utf-8" });
  });

  return routes;
}
