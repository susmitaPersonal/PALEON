import { describe, expect, it } from "vitest";
import { ModelAnalysisSchema, AnalysisResultSchema } from "@scriptecho/contracts";
import { ProviderError } from "../src/providers/types";
import { evidenceStrength, verifyAnalysis } from "../src/services/verify";
import { buildApp, png, references, response, ScriptedProvider, upload, validOutput } from "./helpers";

const send = async (provider: ScriptedProvider, env = {}, sleeps: number[] = []) => {
  const app = buildApp(provider, env, async (ms) => { sleeps.push(ms); });
  return app.fetch(upload(await png()));
};
const body = (res: Response) => res.json() as Promise<any>;
const reference = references();

describe("schema validation of model output", () => {
  it("accepts valid output", () => {
    expect(ModelAnalysisSchema.safeParse(validOutput()).success).toBe(true);
  });

  it.each([
    ["extra fields", validOutput({ date: "300 BCE" })],
    ["a confidence field", validOutput({ confidence: 0.9 })],
    ["four candidates", validOutput({ candidates: [1, 2, 3, 4].map((rank) => ({ rank, scriptId: `s${rank}x`, supportingEvidence: ["a"], contradictingEvidence: [] })) })],
    ["duplicate scripts", validOutput({ candidates: [1, 2].map((rank) => ({ rank, scriptId: "greek", supportingEvidence: ["a"], contradictingEvidence: [] })) })],
    ["rank gaps", validOutput({ candidates: [{ rank: 2, scriptId: "greek", supportingEvidence: ["a"], contradictingEvidence: [] }] })],
    ["missing evidence", validOutput({ candidates: [{ rank: 1, scriptId: "greek", supportingEvidence: [], contradictingEvidence: [] }] })],
    ["no candidates", validOutput({ candidates: [] })],
    ["abstaining with a candidate", validOutput({ status: "out_of_scope", statusReason: "x" })],
    ["abstaining with no reason", validOutput({ status: "out_of_scope", candidates: [] })],
    ["no_writing with writing", validOutput({ status: "no_writing", statusReason: "x", candidates: [] })],
    ["an unknown status", validOutput({ status: "maybe" })],
  ])("rejects %s", (_name, value) => {
    expect(ModelAnalysisSchema.safeParse(value).success).toBe(false);
  });
});

describe("verification", () => {
  const parsed = (overrides = {}) => ModelAnalysisSchema.parse(validOutput(overrides));
  const VISUAL = ["angular strokes", "evenly spaced rows", "straight stems"];

  it.each(["Dates to 300 BCE", "from the third century", "see https://x.org", "according to Smith", "90% likely"])(
    "removes history or numeric confidence: %s", (text) => {
      const result = verifyAnalysis(parsed({ candidates: [{ rank: 1, scriptId: "greek", supportingEvidence: ["angular strokes", text], contradictingEvidence: [] }] }), reference);
      expect(result.candidates[0]!.supportingEvidence).toEqual(["angular strokes"]);
      expect(result.removedStatements).toBe(1);
    });

  it("drops a candidate whose evidence is all removed", () => {
    const result = verifyAnalysis(parsed({ candidates: [{ rank: 1, scriptId: "greek", supportingEvidence: ["from 300 BCE"], contradictingEvidence: [] }] }), reference);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.recommendExpertReview).toBe(true);
  });

  it("moves unsupported scripts aside and renumbers", () => {
    const result = verifyAnalysis(parsed({ candidates: [
      { rank: 1, scriptId: "ogham", supportingEvidence: VISUAL, contradictingEvidence: [] },
      { rank: 2, scriptId: "latin", supportingEvidence: VISUAL, contradictingEvidence: [] },
    ] }), reference);
    expect(result.unsupportedScriptIds).toEqual(["ogham"]);
    expect(result.candidates.map((candidate) => [candidate.rank, candidate.scriptId])).toEqual([[1, "latin"]]);
  });

  it("reports out of scope when only unsupported scripts remain", () => {
    const result = verifyAnalysis(parsed({ candidates: [{ rank: 1, scriptId: "ogham", supportingEvidence: VISUAL, contradictingEvidence: [] }] }), reference);
    expect(result.status).toBe("out_of_scope");
    expect(result.candidates).toEqual([]);
  });

  it.each([
    [["a", "b", "c"], [], "good", "consistent", 2, "strong"],
    [["a", "b", "c"], [], "good", "consistent", 1, "moderate"],
    [["a", "b", "c"], [], "good", "not_checkable", 0, "moderate"],
    [["a", "b", "c"], [], "fair", "consistent", 2, "moderate"],
    [["a", "b"], [], "good", "consistent", 2, "moderate"],
    [["a", "b"], ["x"], "good", "not_checkable", 0, "moderate"],
    [["a"], [], "good", "not_checkable", 0, "weak"],
    [["a", "b"], ["x", "y"], "good", "not_checkable", 0, "weak"],
    [["a", "b", "c"], [], "good", "conflict", 2, "weak"],
    [["a", "b", "c"], [], "poor", "consistent", 2, "weak"],
  ] as const)("computes strength %#", (supporting, contradicting, quality, direction, matches, expected) => {
    expect(evidenceStrength({ supportingEvidence: [...supporting], contradictingEvidence: [...contradicting] }, quality, direction, matches)).toBe(expected);
  });
});

describe("provider handling", () => {
  it("returns a contract-valid result with no simulated flag for a non-mock provider", async () => {
    const res = await send(new ScriptedProvider([response(validOutput(), { inputTokens: 1000, outputTokens: 500 })], 1, 2));
    const json = await body(res);
    expect(res.status).toBe(200);
    expect(AnalysisResultSchema.safeParse(json.data).success).toBe(true);
    expect(json.data.provenance).toMatchObject({ simulated: false, inputTokens: 1000, outputTokens: 500, attempts: 1 });
    expect(json.data.provenance.estimatedCostUsd).toBeCloseTo(0.002);
  });

  it("keeps usage and cost unknown when not reported", async () => {
    const json = await body(await send(new ScriptedProvider([response(validOutput())], 1, 2)));
    expect(json.data.provenance).toMatchObject({ inputTokens: null, outputTokens: null, estimatedCostUsd: null });
  });

  it("never sends the frozen experiment prompt", async () => {
    const provider = new ScriptedProvider([response(validOutput())]);
    await send(provider);
    expect(provider.calls[0]!.userText).toContain("brahmi, greek, kharosthi, latin, phoenician, runic");
    expect(provider.calls[0]!.jsonSchema).toHaveProperty("properties");
  });

  it("retries malformed output once with a repair note", async () => {
    const provider = new ScriptedProvider([response("not json"), response(validOutput())]);
    const res = await send(provider);
    expect(res.status).toBe(200);
    expect(provider.calls[0]!.repairNote).toBeUndefined();
    expect(provider.calls[1]!.repairNote).toContain("failed validation");
  });

  it("does not accept Markdown fences", async () => {
    const provider = new ScriptedProvider([response("```json\n{}\n```"), response("```json\n{}\n```")]);
    expect((await send(provider)).status).toBe(502);
  });

  it("returns 502 after the repair retry fails", async () => {
    const provider = new ScriptedProvider([response("bad"), response({ wrong: true })]);
    const res = await send(provider);
    expect(res.status).toBe(502);
    expect((await body(res)).error).toMatchObject({ code: "model_output_invalid", retryable: true });
    expect(provider.calls).toHaveLength(2);
  });

  it("retries a rate limit once and honours retry-after", async () => {
    const sleeps: number[] = [];
    const res = await send(new ScriptedProvider([new ProviderError("rate_limited", "x", 7), response(validOutput())]), {}, sleeps);
    expect(res.status).toBe(200);
    expect(sleeps).toEqual([7000]);
    expect((await body(res)).data.provenance.attempts).toBe(2);
  });

  it("stops after retries run out", async () => {
    const provider = new ScriptedProvider([new ProviderError("unavailable", "x"), new ProviderError("unavailable", "x"), response(validOutput())]);
    const res = await send(provider);
    expect(res.status).toBe(503);
    expect(provider.calls).toHaveLength(2);
  });

  it.each(["credit_exhausted", "auth", "bad_request"] as const)("does not retry %s", async (kind) => {
    const provider = new ScriptedProvider([new ProviderError(kind, "x"), response(validOutput())]);
    expect((await send(provider)).status).toBe(503);
    expect(provider.calls).toHaveLength(1);
  });

  it("maps a provider timeout to 504", async () => {
    const res = await send(new ScriptedProvider([new ProviderError("timeout", "x"), new ProviderError("timeout", "x")]));
    expect(res.status).toBe(504);
    expect((await body(res)).error.code).toBe("analysis_timeout");
  });

  it("stops when the overall deadline passes", async () => {
    const hang = (request: { signal: AbortSignal }) => new Promise<never>((_, reject) => {
      request.signal.addEventListener("abort", () => reject(new ProviderError("timeout", "aborted")));
    });
    const provider = new ScriptedProvider([hang]);
    const res = await send(provider, { ANALYSIS_DEADLINE_MS: "30" });
    expect(res.status).toBe(504);
    expect(provider.calls).toHaveLength(1);
  });

  it("enforces a timeout on each attempt", async () => {
    const seen: boolean[] = [];
    const hang = (request: { signal: AbortSignal }) => new Promise<never>((_, reject) => {
      request.signal.addEventListener("abort", () => { seen.push(true); reject(new ProviderError("timeout", "aborted")); });
    });
    await send(new ScriptedProvider([hang, hang]), { MODEL_TIMEOUT_MS: "20" });
    expect(seen).toEqual([true, true]);
  });

  it("does not leak unexpected errors", async () => {
    const res = await send(new ScriptedProvider([new Error("secret internal detail")]));
    const json = await body(res);
    expect(res.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("secret internal detail");
  });
});
