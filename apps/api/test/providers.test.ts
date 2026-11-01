import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { createLogger } from "../src/logger";
import { createProvider } from "../src/providers";
import { MockProvider } from "../src/providers/mock";
import { OpenAICompatibleProvider } from "../src/providers/openaiCompatible";
import { ProviderError, type ProviderRequest } from "../src/providers/types";
import { FIXTURES, testConfig } from "./helpers";

const SECRET = "test-key-not-real";
const request = (overrides: Partial<ProviderRequest> = {}): ProviderRequest => ({
  system: "s", userText: "u", image: { mimeType: "image/jpeg", bytes: Buffer.from("img") }, jsonSchema: { type: "object" },
  signal: new AbortController().signal, ...overrides,
});
const adapter = (fetchImpl: typeof fetch) => new OpenAICompatibleProvider({ id: "x", baseUrl: "https://gateway.invalid/v1/", modelId: "m",
  apiKey: SECRET, inputUsdPerMtok: null, outputUsdPerMtok: null, fetchImpl });
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers })) as unknown as typeof fetch;
const kind = (promise: Promise<unknown>) => promise.then(() => "ok", (error: ProviderError) => error.kind);

describe("configuration", () => {
  it("defaults to the mock provider with no external inference", () => {
    const config = loadConfig({});
    expect(config.provider).toBe("mock");
    expect(config.allowExternalInference).toBe(false);
    expect(createProvider(config, FIXTURES).simulated).toBe(true);
  });

  it("refuses a real provider without the explicit switch", () => {
    expect(() => loadConfig({ MODEL_PROVIDER: "openai-compatible", MODEL_BASE_URL: "u", MODEL_ID: "m", MODEL_API_KEY: "k" }))
      .toThrow(/ALLOW_EXTERNAL_INFERENCE/);
  });

  it("names missing settings without printing secrets", () => {
    expect(() => loadConfig({ MODEL_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_INFERENCE: "true", MODEL_API_KEY: SECRET }))
      .toThrow(/MODEL_BASE_URL, MODEL_ID$/);
  });

  it("builds the adapter only when fully enabled", () => {
    const config = loadConfig({ MODEL_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_INFERENCE: "true", MODEL_BASE_URL: "https://g.invalid", MODEL_ID: "m", MODEL_API_KEY: "k" });
    expect(createProvider(config, FIXTURES).simulated).toBe(false);
  });
});

describe("mock provider", () => {
  const mock = new MockProvider(FIXTURES);

  it("is deterministic for the same image", async () => {
    expect((await mock.analyze(request())).content).toBe((await mock.analyze(request())).content);
  });

  it.each(["clear_candidate", "ambiguous_candidates", "out_of_scope", "no_writing", "insufficient_evidence"])(
    "marks scenario %s as simulated", async (demoScenario) => {
      expect((await mock.analyze(request({ demoScenario }))).content).toContain("Simulated");
    });

  it("can simulate a failure", async () => {
    expect(await kind(mock.analyze(request({ demoScenario: "provider_failure" })))).toBe("unavailable");
  });

  it("reports no invented usage", async () => {
    expect((await mock.analyze(request())).usage).toBeNull();
  });
});

describe("OpenAI-compatible adapter", () => {
  it("sends the image as a data URL with a strict schema", async () => {
    let sent: any;
    const fake = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ model: "m-2", choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }));
    }) as unknown as typeof fetch;
    const result = await adapter(fake).analyze(request({ repairNote: "fix" }));
    expect(sent.messages[1].content[1].image_url.url).toBe(`data:image/jpeg;base64,${Buffer.from("img").toString("base64")}`);
    expect(sent.messages[1].content[0].text).toBe("u\n\nfix");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(result).toEqual({ content: "{}", modelVersion: "m-2", usage: { inputTokens: 3, outputTokens: 4 } });
  });

  it.each([[401, "auth"], [403, "auth"], [402, "credit_exhausted"], [408, "timeout"], [429, "rate_limited"], [500, "unavailable"], [504, "timeout"], [400, "bad_request"]])(
    "maps status %i", async (status, expected) => {
      expect(await kind(adapter(reply(status, "x")).analyze(request()))).toBe(expected);
    });

  it("reads retry-after", async () => {
    await expect(adapter(reply(429, "x", { "retry-after": "9" })).analyze(request())).rejects.toMatchObject({ retryAfterSeconds: 9 });
  });

  it("does not repeat provider error bodies", async () => {
    await expect(adapter(reply(500, "contains user data")).analyze(request())).rejects.not.toThrow(/user data/);
  });

  it("treats an error inside a 200 as unavailable", async () => {
    expect(await kind(adapter(reply(200, { error: { message: "x" } })).analyze(request()))).toBe("unavailable");
  });

  it("rejects non-JSON and empty choices", async () => {
    expect(await kind(adapter(reply(200, "<html>")).analyze(request()))).toBe("bad_response");
    expect(await kind(adapter(reply(200, { choices: [] })).analyze(request()))).toBe("bad_response");
  });

  it("keeps usage unknown when absent", async () => {
    expect((await adapter(reply(200, { choices: [{ message: { content: "{}" } }] })).analyze(request())).usage).toBeNull();
  });

  it("maps an aborted request to a timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = (async () => { throw new Error("aborted"); }) as unknown as typeof fetch;
    expect(await kind(adapter(fake).analyze(request({ signal: controller.signal })))).toBe("timeout");
  });

  it("maps a network failure to unavailable", async () => {
    const fake = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await kind(adapter(fake).analyze(request()))).toBe("unavailable");
  });
});

describe("logger", () => {
  it("drops sensitive fields", () => {
    const lines: string[] = [];
    createLogger("info", (line) => lines.push(line)).info("event", { requestId: "r", apiKey: SECRET, Authorization: SECRET, imageBytes: "x", content: "model text" });
    expect(lines[0]).toContain("requestId");
    expect(lines[0]).not.toContain(SECRET);
    expect(lines[0]).not.toContain("model text");
  });

  it("respects its level", () => {
    const lines: string[] = [];
    createLogger("error", (line) => lines.push(line)).info("event");
    expect(lines).toEqual([]);
  });

  it("uses a test config that logs nothing", () => {
    expect(testConfig().logLevel).toBe("silent");
  });
});
