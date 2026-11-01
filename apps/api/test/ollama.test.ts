import { createServer } from "node:net";
import { serve } from "@hono/node-server";
import sharp from "sharp";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AnalysisResultSchema, RuntimeInfoSchema } from "@scriptecho/contracts";
import { loadConfig } from "../src/config";
import { createLogger } from "../src/logger";
import { AnalysisService } from "../src/services/analysis";
import { createProvider } from "../src/providers";
import { MockProvider } from "../src/providers/mock";
import { OllamaProvider } from "../src/providers/ollama";
import type { LocalTransport } from "../src/providers/localHttp";
import { ProviderError, type ModelProvider, type ProviderRequest, type ProviderResponse } from "../src/providers/types";
import { loadPrompt } from "../src/services/prompt";
import { makeImages, runCheck } from "../../../scripts/local-image-check.mjs";
import { buildApp, FIXTURES, png, PROMPT_PATH, references, ScriptedProvider, upload, validOutput } from "./helpers";

// MOCKED HTTP. No Ollama server or model runs in this file, so nothing here shows that image recognition works.
const SHOW = { capabilities: ["completion", "vision"], details: { family: "qwen25vl", parameter_size: "3.0B", quantization_level: "Q4_K_M" } };
const json = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const chatReply = (content: unknown, extra = {}) => json({ model: "qwen2.5vl:3b", done: true, done_reason: "stop",
  prompt_eval_count: 900, eval_count: 120, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, ...extra });
const body = (res: Response) => res.json() as Promise<any>;

type Route = (init: RequestInit) => Response | Promise<Response>;
const replyOf = async (response: Response) => {
  const text = await response.text();
  return { status: response.status, lines: (async function* () { for (const line of text.split("\n")) if (line.trim()) yield line; })() };
};
function fakeOllama(chat: Route | Route[], show: Route = () => json(SHOW)) {
  const calls: { path: string; body: any; init: RequestInit }[] = [];
  const chats = Array.isArray(chat) ? [...chat] : null;
  const transport: LocalTransport = async (url, payload, signal) => {
    const path = new URL(url).pathname;
    const init: RequestInit = { signal };
    calls.push({ path, body: payload, init });
    const route = path === "/api/show" ? show : chats ? chats.shift() : chat as Route;
    if (!route) throw new Error("no scripted chat reply left");
    return replyOf(await route(init));
  };
  const provider = new OllamaProvider({ baseUrl: "http://127.0.0.1:11434/", modelId: "qwen2.5vl:3b", numCtx: 8192, numPredict: 1500, keepAlive: "10m", seed: 7, transport });
  return { provider, calls, chats: () => calls.filter((call) => call.path === "/api/chat") };
}
const request = (overrides: Partial<ProviderRequest> = {}): ProviderRequest => ({
  system: "s", userText: "u", image: { mimeType: "image/jpeg", bytes: Buffer.from("real image bytes") }, jsonSchema: { type: "object" },
  signal: new AbortController().signal, ...overrides,
});
const kind = (promise: Promise<unknown>) => promise.then(() => "ok", (error: ProviderError) => error.kind);
const send = async (provider: ModelProvider, env = {}, fields = {}) => buildApp(provider, env).fetch(upload(await png(), fields));

describe("MOCKED HTTP: Ollama failures", () => {
  it("reports Ollama unavailable, and never falls back to the mock", async () => {
    const transport: LocalTransport = async () => { throw new Error("connect ECONNREFUSED"); };
    const provider = new OllamaProvider({ baseUrl: "http://127.0.0.1:11434", modelId: "m", numCtx: 1, numPredict: 1, keepAlive: "0", seed: 1, transport });
    const res = await send(provider);
    expect(res.status).toBe(503);
    const text = JSON.stringify(await body(res));
    expect(text).toContain("provider_unavailable");
    expect(text).not.toMatch(/Simulated|fixture/i);
  });

  it("stops before sending the image when the model is not installed", async () => {
    const ollama = fakeOllama(() => chatReply(validOutput()), () => json({ error: "model 'x' not found" }, 404));
    const res = await send(ollama.provider);
    const failure = await body(res);
    expect(res.status).toBe(503);
    expect(failure.error).toMatchObject({ code: "provider_unavailable", retryable: false });
    expect(failure.error.message).toContain("not installed");
    expect(ollama.chats()).toEqual([]);
  });

  it("reports a model removed between the check and the call", async () => {
    expect(await kind(fakeOllama(() => json({ error: "model 'x' not found" }, 404)).provider.analyze(request()))).toBe("model_not_installed");
  });

  it("reports a model loading failure, once, without echoing the error text", async () => {
    const ollama = fakeOllama(() => json({ error: "llama runner process has terminated: out of memory at /private/path" }, 500));
    const res = await send(ollama.provider, { MODEL_MAX_RETRIES: "3" });
    const failure = await body(res);
    expect(res.status).toBe(503);
    expect(failure.error).toMatchObject({ retryable: false });
    expect(failure.error.message).toContain("could not be loaded");
    expect(JSON.stringify(failure)).not.toContain("/private/path");
    expect(ollama.chats()).toHaveLength(1);
  });

  it.each([["invalid JSON", "not json at all"], ["an empty response", ""], ["fenced JSON", "```json\n{}\n```"]])(
    "gets one repair attempt, then returns 502 for %s", async (_name, content) => {
      const ollama = fakeOllama(() => chatReply(content));
      const res = await send(ollama.provider);
      expect(res.status).toBe(502);
      expect((await body(res)).error.code).toBe("model_output_invalid");
      expect(ollama.chats()).toHaveLength(2);
      expect(ollama.chats()[1]!.body.messages[1].content).toContain("failed validation");
    });

  it("rejects output that fails the shared Zod contract", async () => {
    const res = await send(fakeOllama(() => chatReply({ status: "certain", confidence: 0.99 })).provider);
    expect(res.status).toBe(502);
  });

  it("rejects extra fields, such as an invented date field", async () => {
    expect((await send(fakeOllama(() => chatReply({ ...validOutput(), dated: "250 BCE" })).provider)).status).toBe(502);
  });

  it("maps a timeout during inference to 504", async () => {
    const hang: Route = (init) => new Promise((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const res = await send(fakeOllama(hang).provider, { MODEL_TIMEOUT_MS: "20", ANALYSIS_DEADLINE_MS: "60", MODEL_MAX_RETRIES: "0" });
    expect(res.status).toBe(504);
  });

  it("keeps the raw error text out of the provider error", async () => {
    const error = await fakeOllama(() => json({ error: "llama runner failed: /private/path" }, 500)).provider.analyze(request()).catch((caught) => caught);
    expect(error.kind).toBe("model_load_failed");
    expect(error.message).not.toContain("/private/path");
  });

  it("fails a truncated reply at once, with no repair call", async () => {
    const ollama = fakeOllama(() => chatReply('{\n  "status":', { done_reason: "length" }));
    const res = await send(ollama.provider);
    const failure = await body(res);
    expect(res.status).toBe(502);
    expect(failure.error).toMatchObject({ code: "model_output_invalid", retryable: false });
    expect(failure.error.message).toContain("cut off");
    expect(ollama.chats()).toHaveLength(1);
  });

  it("reports an image refused by the runtime as a bad request", async () => {
    const refused = JSON.stringify({ error: { code: 400, message: "Multimodal data provided, but model does not support multimodal requests." } });
    expect(await kind(fakeOllama(() => json({ error: refused }, 400)).provider.analyze(request()))).toBe("bad_request");
  });

  it("treats an unreadable success reply as a bad response", async () => {
    expect(await kind(fakeOllama(() => json("<html>")).provider.analyze(request()))).toBe("bad_response");
  });

  it("treats a redirect as a failure, because one could leave this machine", async () => {
    expect(await kind(fakeOllama(() => json("", 302)).provider.analyze(request()))).toBe("unavailable");
  });

  it("never turns an interrupted stream into a result", async () => {
    const partial = JSON.stringify({ message: { content: JSON.stringify(validOutput()) }, done: false });
    expect(await kind(fakeOllama(() => json(partial)).provider.analyze(request()))).toBe("bad_response");
  });

  it("joins streamed chunks into one reply, and reports progress", async () => {
    const whole = JSON.stringify(validOutput());
    const lines = [whole.slice(0, 20), whole.slice(20)].map((content) => JSON.stringify({ message: { content }, done: false }));
    const end = JSON.stringify({ model: "m", done: true, done_reason: "stop", message: { content: "" } });
    const tokens: (number | undefined)[] = [];
    const reply = await fakeOllama(() => json([...lines, end].join("\n"))).provider.analyze(request({ onProgress: (progress) => tokens.push(progress.tokens) }));
    expect(reply.content).toBe(whole);
    expect(tokens).toEqual([1, 2, 3]);
  });
});

describe("MOCKED HTTP: the actual image reaches the model request", () => {
  it("sends the uploaded image bytes, re-encoded, and different images differ", async () => {
    const ollama = fakeOllama(() => chatReply(validOutput()));
    const app = buildApp(ollama.provider);
    const solid = (r: number) => sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 10, b: 10 } } }).png().toBuffer();
    await app.fetch(upload(await solid(10)));
    await app.fetch(upload(await solid(240)));
    const [first, second] = ollama.chats().map((call) => call.body.messages[1].images);
    expect(first).toHaveLength(1);
    expect(first).not.toEqual(second);
    const decoded = await sharp(Buffer.from(first[0], "base64")).metadata();
    expect(decoded).toMatchObject({ format: "jpeg", width: 40, height: 30 });
  });

  it("sends the schema and local parameters, and no key or external setting", async () => {
    const ollama = fakeOllama(() => chatReply(validOutput()));
    await ollama.provider.analyze(request({ jsonSchema: { type: "object", title: "t" } }));
    const [call] = ollama.chats();
    expect(call!.body).toMatchObject({ model: "qwen2.5vl:3b", stream: true, keep_alive: "10m", format: { title: "t" },
      options: { temperature: 0, seed: 7, num_ctx: 8192, num_predict: 1500 } });
    expect(new Headers(call!.init.headers).has("authorization")).toBe(false);
  });

  it("turns thinking off only for a model that reports it", async () => {
    const thinking = fakeOllama(() => chatReply(validOutput()), () => json({ ...SHOW, capabilities: ["completion", "vision", "thinking"] }));
    await thinking.provider.analyze(request());
    expect(thinking.chats()[0]!.body.think).toBe(false);
    const plain = fakeOllama(() => chatReply(validOutput()));
    await plain.provider.analyze(request());
    expect(plain.chats()[0]!.body).not.toHaveProperty("think");
  });

  it("reports token counts from Ollama, and leaves them unknown when absent", async () => {
    expect((await fakeOllama(() => chatReply(validOutput())).provider.analyze(request())).usage).toEqual({ inputTokens: 900, outputTokens: 120 });
    const bare = fakeOllama(() => json({ model: "m", done: true, message: { content: "{}" } }));
    expect((await bare.provider.analyze(request())).usage).toBeNull();
  });
});

describe("MOCKED HTTP: abstaining outcomes", () => {
  const abstain = (status: string, overrides = {}) => chatReply(validOutput({ status, candidates: [], statusReason: "A reason.", ...overrides }));
  const observations = (overrides: object) => ({ observations: { ...validOutput().observations, ...overrides } });

  it("keeps insufficient evidence", async () => {
    const result = (await body(await send(fakeOllama(() => abstain("insufficient_evidence")).provider))).data;
    expect(result).toMatchObject({ status: "insufficient_evidence", candidates: [], recommendExpertReview: true });
  });

  it("keeps no writing, with expert review", async () => {
    const reply = abstain("no_writing", observations({ writingPresent: false }));
    const result = (await body(await send(fakeOllama(() => reply).provider))).data;
    expect(result).toMatchObject({ status: "no_writing", recommendExpertReview: true });
  });

  it.each(["se039", "noise"])("MOCKED HTTP, real reply: a no_writing answer survives its leftover candidates (%s)", async (name) => {
    const raw = readFileSync(new URL(`./fixtures/${name}_real_model_output.json`, import.meta.url), "utf8");
    const res = await send(fakeOllama(() => chatReply(raw)).provider);
    const { data } = await body(res);
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: expect.stringMatching(/no_writing|insufficient_evidence/), candidates: [], recommendExpertReview: true });
    expect(data.observations.writingPresent).toBe(false);
  });

  it("drops leftover candidates from any abstention, and adds nothing", async () => {
    const reply = abstain("out_of_scope", { candidates: [{ rank: 1, scriptId: "greek", supportingEvidence: ["angular strokes"], contradictingEvidence: [] }] });
    expect((await body(await send(fakeOllama(() => reply).provider))).data).toMatchObject({ status: "out_of_scope", candidates: [] });
  });

  it("does not apply this to a reply that names candidates", async () => {
    const reply = chatReply(validOutput({ observations: { ...validOutput().observations, writingPresent: false } }));
    expect((await body(await send(fakeOllama(() => reply).provider))).data.status).toBe("insufficient_evidence");
  });

  it("keeps an out-of-scope answer", async () => {
    const result = (await body(await send(fakeOllama(() => abstain("out_of_scope")).provider))).data;
    expect(result).toMatchObject({ status: "out_of_scope", candidates: [] });
  });

  it("moves a script outside the collection aside, with no history attached", async () => {
    const reply = chatReply(validOutput({ candidates: [{ rank: 1, scriptId: "cuneiform", supportingEvidence: ["wedge shaped strokes", "straight rows"], contradictingEvidence: [] }] }));
    const result = (await body(await send(fakeOllama(() => reply).provider))).data;
    expect(result).toMatchObject({ status: "out_of_scope", unsupportedScriptIds: ["cuneiform"], candidates: [] });
  });

  it("applies the verifier, so history in real output is removed", async () => {
    const reply = chatReply(validOutput({ candidates: [{ rank: 1, scriptId: "greek", supportingEvidence: ["angular strokes", "straight stems", "Carved around 250 B.C."], contradictingEvidence: [] }] }));
    const result = (await body(await send(fakeOllama(() => reply).provider))).data;
    expect(result.removedStatements).toBe(1);
    expect(JSON.stringify(result.candidates)).not.toContain("250");
  });
});

describe("MOCKED HTTP: genuine inference is told apart from the mock", () => {
  it("labels a local result as local, and never simulated", async () => {
    const res = await send(fakeOllama(() => chatReply(validOutput())).provider);
    const { data } = await body(res);
    expect(AnalysisResultSchema.safeParse(data).success).toBe(true);
    expect(data.provenance).toMatchObject({ simulated: false, inferenceMode: "local", provider: "ollama", modelId: "qwen2.5vl:3b", inputTokens: 900 });
    expect(data.capabilities.scriptIdentification).toBe("available");
  });

  it("labels a mock result as simulated", async () => {
    const { data } = await body(await send(new MockProvider(FIXTURES)));
    expect(data.provenance).toMatchObject({ simulated: true, inferenceMode: "simulated" });
    expect(data.capabilities.scriptIdentification).toBe("simulated");
  });

  it("ignores demo scenarios, so a local run cannot return a fixture", async () => {
    const ollama = fakeOllama(() => chatReply(validOutput()));
    await send(ollama.provider, {}, { demoScenario: "no_writing" });
    expect(ollama.chats()).toHaveLength(1);
  });

  it("reports the three modes in runtime information", async () => {
    const read = async (provider: ModelProvider) => (await body(await buildApp(provider).request("/api/v1/runtime"))).data;
    const local = await read(fakeOllama(() => chatReply(validOutput())).provider);
    expect(RuntimeInfoSchema.safeParse(local).success).toBe(true);
    expect(local).toMatchObject({ inferenceMode: "local", simulated: false, externalInferenceEnabled: false, modelStatus: "ready",
      modelDetails: { family: "qwen25vl", parameterSize: "3.0B", quantization: "Q4_K_M" } });
    expect(await read(new MockProvider(FIXTURES))).toMatchObject({ inferenceMode: "simulated", modelStatus: "not_checked" });
    expect(await read(new ScriptedProvider([]))).toMatchObject({ inferenceMode: "external" });
  });
});

describe("MOCKED HTTP: health check", () => {
  const health = (show: Route) => fakeOllama(() => json({}), show).provider.health(new AbortController().signal);

  it("is ready for a local model with vision", async () => {
    expect((await health(() => json(SHOW))).status).toBe("ready");
  });

  it.each([
    ["a text-only model", () => json({ capabilities: ["completion"] }), "no_vision_support"],
    ["no capability list", () => json({ details: {} }), "no_vision_support"],
    ["a missing model", () => json({ error: "not found" }, 404), "model_not_installed"],
    ["a server error", () => json({ error: "x" }, 500), "server_unreachable"],
    ["an unreadable reply", () => json("<html>"), "server_unreachable"],
    ["a cloud model with a host", () => json({ ...SHOW, remote_host: "https://ollama.com:443" }), "not_local"],
    ["a cloud model with a remote name", () => json({ ...SHOW, remote_model: "m" }), "not_local"],
  ] as [string, Route, string][])("handles %s", async (_name, show, status) => {
    expect((await health(show)).status).toBe(status);
  });

  it.each([
    ["a text-only model", { capabilities: ["completion"] }],
    ["a cloud model", { ...SHOW, remote_host: "https://ollama.com:443" }],
  ])("never sends an image to %s", async (_name, show) => {
    const ollama = fakeOllama(() => chatReply(validOutput()), () => json(show));
    const res = await send(ollama.provider);
    expect(res.status).toBe(503);
    expect(ollama.chats()).toEqual([]);
  });

  it("makes /ready report a missing model", async () => {
    const provider = fakeOllama(() => json({}), () => json({ error: "x" }, 404)).provider;
    const res = await buildApp(provider).request("/ready");
    expect(res.status).toBe(503);
    expect((await body(res)).data).toMatchObject({ status: "not_ready", modelStatus: "model_not_installed", inferenceMode: "local" });
  });
});

describe("local configuration", () => {
  const local = { MODEL_PROVIDER: "ollama", OLLAMA_MODEL: "qwen2.5vl:3b" };

  it("needs no key, external switch, or paid setting", () => {
    const config = loadConfig(local);
    expect(config).toMatchObject({ provider: "ollama", allowExternalInference: false, ollamaBaseUrl: "http://127.0.0.1:11434", ollamaNumCtx: 8192 });
    const provider = createProvider(config, FIXTURES);
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider).toMatchObject({ simulated: false, inferenceMode: "local", inputUsdPerMtok: null });
  });

  it("stays on the mock unless asked", () => {
    expect(createProvider(loadConfig({ OLLAMA_MODEL: "qwen2.5vl:3b" }), FIXTURES).simulated).toBe(true);
  });

  it("requires a model name, with no silent default", () => {
    expect(() => loadConfig({ MODEL_PROVIDER: "ollama" })).toThrow(/OLLAMA_MODEL/);
  });

  it.each(["http://192.168.1.20:11434", "https://ollama.com", "http://evil.example", "http://127.0.0.1.evil.example:11434", "not a url"])(
    "refuses a non-loopback address: %s", (url) => {
      expect(() => loadConfig({ ...local, OLLAMA_BASE_URL: url })).toThrow(/OLLAMA_BASE_URL/);
    });

  it.each(["http://localhost:11434", "http://127.0.0.1:9999", "http://[::1]:11434"])("accepts loopback: %s", (url) => {
    expect(loadConfig({ ...local, OLLAMA_BASE_URL: url }).ollamaBaseUrl).toBe(url);
  });

  it.each(["gemma4:cloud", "qwen3.8:27b-cloud", "x:CLOUD"])("refuses a cloud model name: %s", (model) => {
    expect(() => loadConfig({ ...local, OLLAMA_MODEL: model })).toThrow(/cloud/);
  });
});

describe("prompt versions", () => {
  const collection = references();

  it("takes its version from the file, and states the output shape in v2", () => {
    const prompt = loadPrompt(new URL("../prompts/script_analysis_v3.md", import.meta.url).pathname, collection.scriptIds());
    expect(prompt.version).toBe("script_analysis_v3");
    expect(`${prompt.system}${prompt.user}`).not.toMatch(/hooks|"writingPresent": true/);
    for (const field of ["statusReason", "writingPresent", "supportingEvidence", "contradictingEvidence"]) expect(prompt.user).toContain(field);
    expect(prompt.user).toContain("brahmi, greek");
    expect(`${prompt.system}${prompt.user}`).not.toMatch(/\{\{/);
  });
});

describe("protections that a real, slow model depends on", () => {
  const freePort = () => new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

  it("holds the concurrency cap over real sockets", async () => {
    let inFlight = 0;
    let peak = 0;
    const provider = new ScriptedProvider(Array.from({ length: 6 }, () => async (): Promise<ProviderResponse> => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 150));
      inFlight -= 1;
      return { content: JSON.stringify(validOutput()), modelVersion: "m", usage: null };
    }));
    const port = await freePort();
    const app = buildApp(provider, { MAX_CONCURRENT_ANALYSES: "1", RATE_LIMIT_PER_MINUTE: "100", PORT: String(port) });
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
    try {
      const big = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png({ compressionLevel: 0 }).toBuffer();
      const statuses = await Promise.all(Array.from({ length: 6 }, async () => {
        const form = new FormData();
        form.set("image", new File([new Uint8Array(big)], "a.png", { type: "image/png" }));
        return (await fetch(`http://127.0.0.1:${port}/api/v1/analyses`, { method: "POST", body: form })).status;
      }));
      expect(peak).toBe(1);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 429)).toHaveLength(5);
    } finally {
      server.close();
    }
  });

  it("stops the model request when a client disconnects over a real socket", async () => {
    let aborted = false;
    let started = () => {};
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const provider = new ScriptedProvider([(request) => new Promise((_, reject) => {
      started();
      request.signal.addEventListener("abort", () => { aborted = true; reject(new ProviderError("timeout", "stopped")); });
    })]);
    const port = await freePort();
    const server = serve({ fetch: buildApp(provider, { PORT: String(port) }).fetch, port, hostname: "127.0.0.1" });
    try {
      const form = new FormData();
      form.set("image", new File([new Uint8Array(await png())], "a.png", { type: "image/png" }));
      const client = new AbortController();
      const reply = await fetch(`http://127.0.0.1:${port}/api/v1/analyses`, { method: "POST", body: form, signal: client.signal,
        headers: { accept: "application/x-ndjson" } });
      await entered;
      client.abort();
      await reply.text().catch(() => undefined);
      await vi.waitFor(() => expect(aborted).toBe(true));
    } finally {
      server.close();
    }
  });

  it("ends a retry wait at the deadline", async () => {
    const provider = new ScriptedProvider([new ProviderError("rate_limited", "busy", 3)]);
    const app = buildApp(provider, { ANALYSIS_DEADLINE_MS: "200", MODEL_MAX_RETRIES: "1" }, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const started = performance.now();
    const res = await app.fetch(upload(await png()));
    expect(res.status).toBe(504);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("MOCKED HTTP: the image-reading check", () => {
  const route = (answers: (image: string) => unknown, show: unknown = SHOW) => (async (url: string, init: RequestInit) => {
    if (url.endsWith("/api/show")) return json(show);
    return chatReply(answers(JSON.parse(init.body as string).messages[0].images[0]));
  }) as unknown as typeof fetch;
  const check = (images: Awaited<ReturnType<typeof makeImages>>, fetchImpl: typeof fetch) =>
    runCheck({ baseUrl: "http://127.0.0.1:11434", model: "m", images, fetchImpl });

  it("makes distinct images with different answers", async () => {
    const images = await makeImages();
    expect(new Set(images.map((image) => image.base64)).size).toBe(3);
    expect(new Set(images.map((image) => image.truth.digit)).size).toBe(3);
    expect(new Set(images.map((image) => image.truth.colour)).size).toBe(3);
  });

  it("passes only when each image is answered by its own content", async () => {
    const images = await makeImages();
    const truth = (image: string) => images.find((item) => item.base64 === image)!.truth;
    expect((await check(images, route(truth))).passed).toBe(true);
  });

  it("fails a model that gives one fixed answer", async () => {
    const images = await makeImages();
    expect((await check(images, route(() => images[0]!.truth))).passed).toBe(false);
  });

  it("fails unreadable or wrong replies", async () => {
    const images = await makeImages();
    expect((await check(images, route(() => "not json"))).passed).toBe(false);
    expect((await check(images, route(() => ({ digit: 11, colour: "pink" })))).passed).toBe(false);
  });

  it("refuses a remote address, a cloud model, and a model without vision", async () => {
    const images = await makeImages(1);
    await expect(runCheck({ baseUrl: "https://ollama.com", model: "m", images, fetchImpl: route(() => ({})) })).rejects.toThrow(/loopback/);
    await expect(check(images, route(() => ({}), { ...SHOW, remote_host: "x" }))).rejects.toThrow(/remotely/);
    await expect(check(images, route(() => ({}), { capabilities: ["completion"] }))).rejects.toThrow(/image input/);
  });
});

describe("cross-origin and host protection", () => {
  const post = async (headers: Record<string, string>) => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array(await png())], "a.png", { type: "image/png" }));
    return buildApp().request("http://127.0.0.1:8787/api/v1/analyses", { method: "POST", body: form, headers });
  };

  it("allows the application's own origin, and tools that send no origin", async () => {
    expect((await post({ origin: "http://127.0.0.1:8787", host: "127.0.0.1:8787" })).status).toBe(200);
    expect((await post({})).status).toBe(200);
  });

  it.each([
    ["another website", { origin: "https://evil.example" }],
    ["another website with a spoofed host", { origin: "https://evil.example", host: "127.0.0.1:8787" }],
    ["a host matching the attacking origin", { origin: "https://evil.example", host: "evil.example" }],
    ["a sandboxed page", { origin: "null" }],
    ["an unreadable origin", { origin: "::::" }],
    ["a cross-site fetch with no origin", { "sec-fetch-site": "cross-site" }],
    ["a look-alike origin", { origin: "http://127.0.0.1.evil.example:8787" }],
    ["another local port", { origin: "http://127.0.0.1:9999" }],
  ])("rejects %s, with no analysis", async (_name, headers) => {
    const res = await post(headers);
    expect(res.status).toBe(403);
    expect((await body(res)).error.code).toBe("forbidden");
  });

  it("rejects a rebinding host on reads too", async () => {
    expect((await buildApp().request("http://127.0.0.1:8787/api/v1/runtime", { headers: { host: "evil.example" } })).status).toBe(403);
  });

  it("sends no permissive CORS header", async () => {
    const res = await post({ origin: "http://127.0.0.1:8787" });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("streamed analysis", () => {
  const events = async (res: Response) => (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
  const stream = async (provider: ModelProvider) => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array(await png())], "a.png", { type: "image/png" }));
    return buildApp(provider).request("/api/v1/analyses", { method: "POST", body: form, headers: { accept: "application/x-ndjson" } });
  };

  it("reports progress, then one valid result", async () => {
    const res = await stream(fakeOllama(() => chatReply(validOutput())).provider);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const sequence = await events(res);
    expect(sequence.filter((event) => event.type === "progress").map((event) => event.progress.stage)).toEqual(["received", "analysing", "generating"]);
    const last = sequence.at(-1);
    expect(last).toMatchObject({ type: "result", body: { ok: true } });
    expect(AnalysisResultSchema.safeParse(last.body.data).success).toBe(true);
  });

  it("delivers a failure as a final event, not a success", async () => {
    const sequence = await events(await stream(fakeOllama(() => chatReply("not json")).provider));
    expect(sequence.at(-1)).toMatchObject({ type: "result", body: { ok: false, error: { code: "model_output_invalid" } } });
  });
});

describe("cancellation", () => {
  it("stops the model request and repairs nothing when the client leaves", async () => {
    const ollama = fakeOllama((init) => new Promise((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const controller = new AbortController();
    const form = new FormData();
    form.set("image", new File([new Uint8Array(await png())], "a.png", { type: "image/png" }));
    const pending = buildApp(ollama.provider, { MODEL_MAX_RETRIES: "2" }).fetch(new Request("http://local/api/v1/analyses", { method: "POST", body: form, signal: controller.signal }));
    await vi.waitFor(() => expect(ollama.chats()).toHaveLength(1));
    controller.abort();
    const res = await pending;
    expect(res.status).toBe(499);
    expect(ollama.chats()).toHaveLength(1);
  });
});

describe("raw output record", () => {
  it("is off by default, and saves the exact reply when configured", async () => {
    const directory = mkdtempSync(join(tmpdir(), "paleon-raw-"));
    const service = new AnalysisService(fakeOllama(() => chatReply("not json")).provider, references(), loadPrompt(PROMPT_PATH, ["greek"]), createLogger("silent"),
      { deadlineMs: 1000, attemptTimeoutMs: 1000, maxRetries: 0, experimentId: null, rawOutputDir: directory });
    await service.analyze({ bytes: Buffer.from("x"), mimeType: "image/jpeg", width: 1, height: 1, sourceFormat: "png" }, "r1").catch(() => undefined);
    expect(readFileSync(join(directory, "r1-attempt1.txt"), "utf8")).toBe("not json");
  });
});

describe("hostile requests and error leakage", () => {
  it.each(["/api/v1/scripts/..%2f..%2fpackage.json", "/api/v1/scripts/../../etc/passwd", "/api/v1/scripts/%2e%2e%2f.env"])(
    "serves no file for a traversal path: %s", async (path) => {
      const res = await buildApp().request(path);
      expect([400, 404]).toContain(res.status);
      expect(await res.text()).not.toMatch(/root:|"workspaces"|API_KEY/);
    });

  it("refuses a file that claims to be an image, whatever its name or type", async () => {
    const script = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    expect((await buildApp().fetch(upload(script, {}, "photo.png", "image/png"))).status).toBe(415);
  });

  it("keeps the upload's name and internal paths out of every failure", async () => {
    const ollama = fakeOllama(() => json({ error: "runner failed at /Users/someone/secret/model.bin" }, 500));
    const text = await (await buildApp(ollama.provider).fetch(upload(await png(), {}, "private-find-location.png"))).text();
    expect(text).not.toMatch(/private-find-location|\/Users\/|secret/);
  });

  it("returns no API key, base URL, or environment value in runtime information", async () => {
    const provider = fakeOllama(() => json({})).provider;
    const text = await (await buildApp(provider, { MODEL_API_KEY: "test-key-not-real" }).request("/api/v1/runtime")).text();
    expect(text).not.toMatch(/test-key-not-real|11434/);
  });

  it("treats script text in model output as plain data", async () => {
    const reply = chatReply(validOutput({ candidates: [{ rank: 1, scriptId: "greek", supportingEvidence: ["<img src=x onerror=alert(1)>", "angular strokes", "straight stems"], contradictingEvidence: [] }] }));
    const { data } = await body(await send(fakeOllama(() => reply).provider));
    expect(JSON.stringify(data)).not.toContain("onerror");
  });
});

