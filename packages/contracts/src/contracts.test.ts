import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DEMO_SCENARIOS, ModelAnalysisSchema, ScriptIdSchema, SourceRecordSchema } from "./index";

describe("contracts", () => {
  it("treats script IDs as data, so new scripts need no code change", () => {
    expect(ScriptIdSchema.safeParse("ogham").success).toBe(true);
    expect(ScriptIdSchema.safeParse("Bad Id").success).toBe(false);
  });

  it("has no field where a model could supply history, sources, or confidence", () => {
    const text = JSON.stringify(z.toJSONSchema(ModelAnalysisSchema, { unrepresentable: "any" })).toLowerCase();
    for (const word of ["url", "citation", "source", "century", "date", "confidence", "probability"]) {
      expect(text).not.toContain(`"${word}"`);
    }
  });

  it("records how a source was read", () => {
    const source = { id: "a-1", title: "t", publisher: "p", year: 2000, url: "https://x.org", accessedOn: "2026-11-01", accessMethod: "guess", reuseNote: "n" };
    expect(SourceRecordSchema.safeParse(source).success).toBe(false);
    expect(SourceRecordSchema.safeParse({ ...source, accessMethod: "search_excerpt" }).success).toBe(true);
  });

  it("offers an automatic demo scenario", () => {
    expect(DEMO_SCENARIOS).toContain("auto");
  });
});
