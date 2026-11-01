import { describe, expect, it } from "vitest";
import { ComparisonSchema, ReferenceCollectionSchema, ScriptDetailSchema } from "@scriptecho/contracts";
import { checkCollection, loadCollection, ReferenceService } from "../src/services/references";
import { KNOWLEDGE, references } from "./helpers";

const collection = () => structuredClone(loadCollection(KNOWLEDGE));

describe("reference collection", () => {
  it("is valid", () => {
    expect(ReferenceCollectionSchema.safeParse(collection()).success).toBe(true);
    expect(checkCollection(collection())).toEqual([]);
  });

  it("covers the research scope and can grow by data alone", () => {
    expect(references().scriptIds().sort()).toEqual(["brahmi", "greek", "kharosthi", "latin", "phoenician", "runic"]);
    const extended = collection();
    extended.scripts.push({ ...extended.scripts[0]!, id: "ogham", name: "Ogham", historicalPeriod: null, geographicDistribution: null, directionality: null, characteristics: [], relationships: [], traits: [] });
    expect(new ReferenceService(extended).name("ogham")).toBe("Ogham");
  });

  it("gives every claim a resolvable source", () => {
    const data = collection();
    const ids = new Set(data.sources.map((source) => source.id));
    for (const script of data.scripts) {
      for (const claim of [script.historicalPeriod, script.geographicDistribution, script.directionality, ...script.characteristics, ...script.relationships]) {
        if (claim) expect(claim.sourceIds.every((id) => ids.has(id)), claim.id).toBe(true);
      }
    }
  });

  it("uses only directly read sources", () => {
    expect(collection().sources.every((source) => source.accessMethod === "read_directly")).toBe(true);
  });

  it("does not claim expert review", () => {
    expect(collection().scripts.every((script) => script.verificationStatus === "source_checked_not_expert_reviewed")).toBe(true);
  });

  it("states a limitation for every script", () => {
    expect(collection().scripts.every((script) => script.limitations.length > 0)).toBe(true);
  });

  it("keeps unknown fields empty rather than filled", () => {
    expect(references().detail("brahmi")!.incompleteFields).toEqual(["Directionality"]);
    expect(references().detail("greek")!.incompleteFields).toEqual(["Historical period", "Geographic distribution"]);
  });

  it.each([
    ["an unknown source", (d: any) => { d.scripts[0].characteristics[0].sourceIds = ["ghost"]; }, "unknown source"],
    ["a broken trait", (d: any) => { d.scripts[0].traits[0].claimId = "ghost"; }, "unknown claim"],
    ["a wrong code point", (d: any) => { d.scripts[0].referenceCharacters[0].codePoint = "U+0041"; }, "does not match"],
    ["a duplicate script", (d: any) => { d.scripts.push(structuredClone(d.scripts[0])); }, "duplicate script"],
    ["a duplicate source", (d: any) => { d.sources.push(d.sources[0]); }, "duplicate source"],
    ["an unused source", (d: any) => { d.sources.push({ ...d.sources[0], id: "orphan" }); }, "unused"],
  ])("catches %s", (_name, mutate, fragment) => {
    const data = collection();
    mutate(data);
    expect(checkCollection(data).join()).toContain(fragment);
  });

  it("refuses to start on a bad collection", () => {
    const data = collection();
    data.scripts[0]!.characteristics[0]!.sourceIds = ["ghost"];
    expect(() => new ReferenceService(data)).toThrow(/unknown source/);
  });

  it("rejects a non-https source", () => {
    const data = collection();
    data.sources[0]!.url = "http://example.org";
    expect(ReferenceCollectionSchema.safeParse(data).success).toBe(false);
  });
});

describe("script detail", () => {
  it("returns only sources it cites, plus character data", () => {
    const detail = references().detail("kharosthi")!;
    expect(ScriptDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail.sources.map((source) => source.id).sort()).toEqual(["baums-2012", "hultzsch-1925", "unicode-16-ch14", "unicode-16-ucd"]);
    expect(detail.characterNote).toContain("not attested");
  });

  it("returns null for unknown scripts", () => {
    expect(references().detail("ghost")).toBeNull();
  });
});

describe("comparison", () => {
  it("finds shared and differing sourced traits", () => {
    const comparison = references().compare("brahmi", "kharosthi")!;
    expect(ComparisonSchema.safeParse(comparison).success).toBe(true);
    expect(comparison.shared.map((point) => point.topic)).toEqual(["Writing system type"]);
    expect(comparison.differences.map((point) => point.topic)).toContain("Historical period");
  });

  it("reports direction as missing for Brahmi instead of inferring it", () => {
    expect(references().compare("brahmi", "kharosthi")!.missingEvidence).toContain("Writing direction: no stored claim for Brahmi");
  });

  it("distinguishes differing direction", () => {
    const comparison = references().compare("phoenician", "greek")!;
    expect(comparison.differences.map((point) => point.topic)).toContain("Writing direction");
  });

  it("states missing history for both scripts", () => {
    expect(references().compare("greek", "latin")!.missingEvidence.join()).toContain("Greek and Latin");
  });

  it("always carries the descent caveat and resolved sources", () => {
    const comparison = references().compare("greek", "latin")!;
    expect(comparison.caveat).toContain("does not establish");
    expect(comparison.sources.length).toBeGreaterThan(0);
  });

  it("returns null for unknown scripts", () => {
    expect(references().compare("greek", "ghost")).toBeNull();
  });
});
