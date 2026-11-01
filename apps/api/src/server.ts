import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { createProvider } from "./providers";
import { loadInventories, loadLanguages, ResearchKnowledge } from "./research/knowledge";
import { CaseStore } from "./research/store";
import { AnalysisService } from "./services/analysis";
import { loadPrompt } from "./services/prompt";
import { loadCollection, ReferenceService } from "./services/references";

const here = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(here, "..");
const REPOSITORY_ROOT = resolve(API_ROOT, "../..");

// A local .env is optional. Demo mode needs none.
const envFile = resolve(REPOSITORY_ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const logger = createLogger(config.logLevel);
const knowledgeDirectory = resolve(REPOSITORY_ROOT, "knowledge");
const collection = loadCollection(knowledgeDirectory);
const references = new ReferenceService(collection);
const researchKnowledge = new ResearchKnowledge(loadInventories(knowledgeDirectory), loadLanguages(knowledgeDirectory), references.scriptIds(), collection.sources.map((source) => source.id));
// Real local inference uses v3. v1 never reached a model, and v2 led the model to copy its example words.
const promptFile = config.provider === "ollama" ? "script_analysis_v3.md" : "script_analysis_v1.md";
const prompt = loadPrompt(resolve(API_ROOT, "prompts", promptFile), references.scriptIds());
const provider = createProvider(config, resolve(API_ROOT, "fixtures/mock"));
const analysis = new AnalysisService(provider, references, prompt, logger, {
  deadlineMs: config.analysisDeadlineMs, attemptTimeoutMs: config.modelTimeoutMs, maxRetries: config.modelMaxRetries,
  experimentId: config.experimentId, rawOutputDir: config.rawOutputDir ? resolve(REPOSITORY_ROOT, config.rawOutputDir) : null,
});
const dataDirectory = resolve(REPOSITORY_ROOT, config.dataDir);
mkdirSync(dataDirectory, { recursive: true });
const app = createApp({ config: { ...config, dataDir: dataDirectory }, logger, provider, references, analysis, promptVersion: prompt.version,
  research: { store: new CaseStore(dataDirectory), knowledge: researchKnowledge } });

const webDist = resolve(REPOSITORY_ROOT, config.webDist || "apps/web/dist");
if (existsSync(webDist)) {
  const indexHtml = readFileSync(resolve(webDist, "index.html"), "utf8");
  app.use("/assets/*", serveStatic({ root: relative(process.cwd(), webDist) }));
  app.get("*", (c, next) => (c.req.path.startsWith("/api") ? next() : c.html(indexHtml)));
}

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, ({ port }) => {
  logger.info("server_started", { port, provider: provider.id, inferenceMode: provider.inferenceMode });
});
