import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalysisResultSchema, ModelAnalysisSchema, RuntimeInfoSchema } from "@scriptecho/contracts";
import { buildApp, FIXTURES, jpeg, png, upload } from "./helpers";

const body = (res: Response) => res.json() as Promise<any>;

describe("health and runtime", () => {
  it("reports liveness and readiness without calling a model", async () => {
    const app = buildApp();
    expect((await body(await app.request("/health"))).data.status).toBe("ok");
    expect((await body(await app.request("/ready"))).data).toMatchObject({ status: "ready", scripts: 6, simulated: true });
  });

  it("declares simulation and no external inference by default", async () => {
    const json = await body(await buildApp().request("/api/v1/runtime"));
    expect(RuntimeInfoSchema.safeParse(json.data).success).toBe(true);
    expect(json.data).toMatchObject({ simulated: true, externalInferenceEnabled: false });
    expect(JSON.stringify(json)).not.toMatch(/key/i);
  });
});

describe("envelopes and headers", () => {
  it("wraps success and failure consistently", async () => {
    const app = buildApp();
    const good = await body(await app.request("/api/v1/scripts"));
    const bad = await body(await app.request("/api/v1/scripts/ghost"));
    expect(good).toMatchObject({ ok: true, meta: { requestId: expect.any(String) } });
    expect(bad).toMatchObject({ ok: false, error: { code: "not_found", retryable: false }, meta: { requestId: expect.any(String) } });
  });

  it("keeps a safe request ID and replaces an unsafe one", async () => {
    const app = buildApp();
    expect((await app.request("/health", { headers: { "x-request-id": "abc12345" } })).headers.get("x-request-id")).toBe("abc12345");
    expect((await app.request("/health", { headers: { "x-request-id": "bad id\n" } })).headers.get("x-request-id")).not.toContain("bad");
  });

  it("sends security headers", async () => {
    const res = await buildApp().request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("content-security-policy")).toContain("style-src 'self'");
    expect(res.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns a typed 404 for unknown API routes", async () => {
    expect((await body(await buildApp().request("/api/v1/nothing"))).error.code).toBe("not_found");
  });
});

describe("reference routes", () => {
  it("lists scripts and returns details", async () => {
    const app = buildApp();
    expect((await body(await app.request("/api/v1/scripts"))).data).toHaveLength(6);
    expect((await body(await app.request("/api/v1/scripts/runic"))).data.script.name).toBe("Runic");
  });

  it("validates comparison input", async () => {
    const app = buildApp();
    expect((await app.request("/api/v1/comparisons?a=greek")).status).toBe(400);
    expect((await app.request("/api/v1/comparisons?a=greek&b=greek")).status).toBe(400);
    expect((await app.request("/api/v1/comparisons?a=greek&b=ghost")).status).toBe(404);
    expect((await body(await app.request("/api/v1/comparisons?a=greek&b=latin"))).data.first.id).toBe("greek");
  });
});

describe("analysis route", () => {
  it("is deterministic, simulated, and contract-valid in demo mode", async () => {
    const app = buildApp();
    const bytes = await png();
    const first = await body(await app.fetch(upload(bytes)));
    const second = await body(await app.fetch(upload(bytes)));
    expect(AnalysisResultSchema.safeParse(first.data).success).toBe(true);
    expect(first.data.status).toBe(second.data.status);
    expect(first.data.provenance).toMatchObject({ simulated: true, provider: "mock", promptVersion: "script_analysis_v1" });
    expect(first.data.candidates).toEqual(second.data.candidates);
  });

  it.each([
    ["clear_candidate", "candidates", 1], ["ambiguous_candidates", "candidates", 3], ["out_of_scope", "out_of_scope", 0],
    ["no_writing", "no_writing", 0], ["insufficient_evidence", "insufficient_evidence", 0],
  ])("handles demo scenario %s", async (demoScenario, status, count) => {
    const json = await body(await buildApp().fetch(upload(await png(), { demoScenario })));
    expect(json.data.status).toBe(status);
    expect(json.data.candidates).toHaveLength(count);
  });

  it("surfaces a simulated provider failure", async () => {
    const res = await buildApp().fetch(upload(await png(), { demoScenario: "provider_failure" }));
    expect(res.status).toBe(503);
    expect((await body(res)).error.retryable).toBe(true);
  });

  it("rejects an unknown demo scenario", async () => {
    expect((await buildApp().fetch(upload(await png(), { demoScenario: "nope" }))).status).toBe(400);
  });

  it("reports every unavailable capability", async () => {
    const json = await body(await buildApp().fetch(upload(await png())));
    expect(json.data.capabilities).toMatchObject({ transcription: "unavailable", translation: "unavailable", languageIdentification: "unavailable" });
  });

  it("never returns numeric confidence", async () => {
    const json = await body(await buildApp().fetch(upload(await png(), { demoScenario: "ambiguous_candidates" })));
    expect(JSON.stringify(json.data.candidates)).not.toMatch(/confidence|probability|\d%/i);
  });

  it("does not echo the upload", async () => {
    const text = JSON.stringify(await body(await buildApp().fetch(upload(await png(), {}, "secret-name.png"))));
    expect(text).not.toContain("secret-name");
  });

  it("does not trust the file name or declared type", async () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect((await buildApp().fetch(upload(svg, {}, "photo.png", "image/png"))).status).toBe(415);
    expect((await buildApp().fetch(upload(await jpeg(), {}, "notes.txt", "text/plain"))).status).toBe(200);
  });

  it.each([
    ["an empty file", Buffer.alloc(0), 400],
    ["random bytes", Buffer.from("just some text"), 415],
  ])("rejects %s", async (_name, data, status) => {
    expect((await buildApp().fetch(upload(data))).status).toBe(status);
  });

  it("rejects a missing or repeated image field", async () => {
    const app = buildApp();
    expect((await app.request("/api/v1/analyses", { method: "POST", body: new FormData() })).status).toBe(400);
    const form = new FormData();
    const bytes = new Uint8Array(await png());
    form.append("image", new File([bytes], "a.png"));
    form.append("image", new File([bytes], "b.png"));
    expect((await app.request("/api/v1/analyses", { method: "POST", body: form })).status).toBe(400);
  });

  it("rejects a non-multipart body", async () => {
    const res = await buildApp().request("/api/v1/analyses", { method: "POST", body: "x", headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });

  it("rejects an oversized upload", async () => {
    const res = await buildApp(undefined, { MAX_UPLOAD_BYTES: "100" }).fetch(upload(await png(400, 400)));
    expect(res.status).toBe(413);
    expect((await body(res)).error.code).toBe("file_too_large");
  });

  it("rejects a request far over the limit by its declared size", async () => {
    const res = await buildApp(undefined, { MAX_UPLOAD_BYTES: "100" }).request("/api/v1/analyses", {
      method: "POST", headers: { "content-length": String(50 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" }, body: "x",
    });
    expect(res.status).toBe(413);
  });

  it("rate limits by client", async () => {
    const app = buildApp(undefined, { RATE_LIMIT_PER_MINUTE: "1" });
    const bytes = await png();
    expect((await app.fetch(upload(bytes))).status).toBe(200);
    const limited = await app.fetch(upload(bytes));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("ignores forwarded addresses unless a trusted proxy is configured", async () => {
    const send = (app: ReturnType<typeof buildApp>, bytes: Uint8Array, client: string) => {
      const request = upload(bytes);
      request.headers.set("x-forwarded-for", client);
      return app.fetch(request);
    };
    const bytes = await png();
    const direct = buildApp(undefined, { RATE_LIMIT_PER_MINUTE: "1" });
    expect((await send(direct, bytes, "10.0.0.1")).status).toBe(200);
    expect((await send(direct, bytes, "10.0.0.2")).status).toBe(429);

    const proxied = buildApp(undefined, { RATE_LIMIT_PER_MINUTE: "1", TRUST_PROXY: "true" });
    expect((await send(proxied, bytes, "10.0.0.1")).status).toBe(200);
    expect((await send(proxied, bytes, "10.0.0.2")).status).toBe(200);
    expect((await send(proxied, bytes, "10.0.0.1")).status).toBe(429);
  });

  it("caps concurrent analyses", async () => {
    const app = buildApp(undefined, { MAX_CONCURRENT_ANALYSES: "1", RATE_LIMIT_PER_MINUTE: "100" });
    const bytes = await png(1500, 1500);
    const statuses = (await Promise.all([1, 2, 3].map(() => app.fetch(upload(bytes))))).map((res) => res.status);
    expect(statuses).toContain(200);
    expect(statuses).toContain(429);
  });
});

describe("mock fixtures", () => {
  const files = readdirSync(FIXTURES);

  it("are all valid and marked simulated", () => {
    expect(files).toHaveLength(5);
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
      expect(fixture.simulated).toBe(true);
      expect(ModelAnalysisSchema.safeParse(fixture.response).success, file).toBe(true);
    }
  });

  it("contain no history or confidence", () => {
    for (const file of files) {
      const text = readFileSync(join(FIXTURES, file), "utf8");
      expect(text).not.toMatch(/\d+\s*(BCE|CE)\b|https?:|%/);
    }
  });
});
