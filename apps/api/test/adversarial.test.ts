import { describe, expect, it } from "vitest";
import { ModelAnalysisSchema } from "@scriptecho/contracts";
import { directionCheck, evidenceStrength, MIN_SOURCED_MATCHES_FOR_STRONG, verifyAnalysis } from "../src/services/verify";
import { references } from "./helpers";

// Hand-written hostile output, kept as permanent tests. These check code behaviour, and they are not a rate of anything.
const reference = references();
const VISUAL = ["angular strokes", "evenly spaced rows", "straight vertical stems"];

const observations = (overrides = {}) => ({
  writingPresent: true, imageQuality: "good", visualFeatures: ["straight strokes"], characterShapes: [], direction: "left_to_right",
  directionBasis: null, limitations: [], ambiguities: [], ...overrides,
});
const candidate = (supportingEvidence: string[], scriptId = "brahmi", contradictingEvidence: string[] = []) =>
  ({ rank: 1, scriptId, supportingEvidence, contradictingEvidence });
const verify = (o: object, candidates: object[], status = "candidates", statusReason: string | null = null) =>
  verifyAnalysis(ModelAnalysisSchema.parse({ status, observations: observations(o), candidates, statusReason }), reference);

describe("the 13 adversarial cases from the competition audit", () => {
  it.each([
    "Mauryan-era letters from the reign of Ashoka",
    "Carved around 250 B.C. in Magadha",
    "c. 3rd cent. BCE lettering",
    "As Lüders 1963 shows, this is Bharhut",
    "Typical of the Ptolemaic dynasty",
    "Dated to the Han period, see Hultzsch p. 12",
  ])("1 to 6: removes a historical claim offered as evidence: %s", (text) => {
    const result = verify({}, [candidate([text])]);
    expect(result.candidates).toEqual([]);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.removedStatements).toBe(1);
  });

  it("7: control, a plain date is removed", () => {
    const result = verify({}, [candidate(["Cut in 250 BCE"])]);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.removedStatements).toBe(1);
  });

  it("8: bare assertions naming the script earn nothing", () => {
    const result = verify({}, [candidate(["it looks like Brahmi", "the script is clearly Brahmi", "obviously Brahmi letters"])]);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.candidates).toEqual([]);
    expect(result.recommendExpertReview).toBe(true);
  });

  it("9: candidates alongside writingPresent false is refused", () => {
    const result = verify({ writingPresent: false }, [candidate(VISUAL)]);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.candidates).toEqual([]);
    expect(result.statusReason).toContain("contradicts itself");
    expect(result.recommendExpertReview).toBe(true);
  });

  it("10: candidates on a poor image is refused", () => {
    const result = verify({ imageQuality: "poor" }, [candidate(VISUAL)]);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.candidates).toEqual([]);
    expect(result.statusReason).toContain("too poor");
  });

  it("11: an unclear direction cannot be checked and does not reach strong", () => {
    const result = verify({ direction: "unclear" }, [candidate(VISUAL, "greek")]);
    expect(result.candidates[0]).toMatchObject({ directionCheck: "not_checkable", evidenceStrength: "moderate" });
    expect(result.recommendExpertReview).toBe(true);
  });

  it("12: a direction against the sourced record is downgraded and never removed", () => {
    const result = verify({ direction: "right_to_left" }, [candidate(VISUAL, "latin")]);
    expect(result.candidates[0]).toMatchObject({ scriptId: "latin", directionCheck: "conflict", evidenceStrength: "weak" });
    expect(result.recommendExpertReview).toBe(true);
  });

  it("13: text in another language that names a ruler earns nothing", () => {
    const result = verify({}, [candidate(["Epoca del rey Ashoka, siglo tercero a. C.", "x", "y"])]);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.candidates).toEqual([]);
  });
});

describe("the wider rules behind those cases", () => {
  it("cannot reach strong from any free text, however much is listed", () => {
    const six = [...VISUAL, "thin curved loops", "dotted baseline", "forked tails"];
    for (const scriptId of ["brahmi", "kharosthi", "phoenician", "greek", "latin", "runic"]) {
      for (const direction of ["left_to_right", "right_to_left", "unclear"]) {
        const [first] = verify({ direction }, [candidate(six, scriptId)]).candidates;
        expect(first!.evidenceStrength).not.toBe("strong");
      }
    }
  });

  it("keeps the expert notice on for every outcome the model can choose", () => {
    expect(verify({}, [candidate(VISUAL, "greek")]).recommendExpertReview).toBe(true);
    expect(verify({ writingPresent: false }, [], "no_writing", "Bare stone.").recommendExpertReview).toBe(true);
    expect(verify({}, [], "out_of_scope", "Another script.").recommendExpertReview).toBe(true);
    expect(verify({}, [], "insufficient_evidence", "Worn.").recommendExpertReview).toBe(true);
  });

  it("counts repeated evidence once, however it is punctuated", () => {
    const result = verify({}, [candidate(["Angular strokes.", "angular strokes", "ANGULAR STROKES!"], "greek")]);
    expect(result.candidates[0]).toMatchObject({ supportingEvidence: ["ANGULAR STROKES!"], evidenceStrength: "weak" });
    expect(result.removedStatements).toBe(2);
  });

  it.each([["The language is Prakrit"], ["The text reads ΑΘΗΝΑ"], ["Translation: dedicated to Athena"], ["Mauryan empire under Ashoka"]])(
    "does not accept language, reading, or history as visual evidence: %s", (text) => {
      expect(verify({}, [candidate([text, ...VISUAL])]).candidates[0]!.supportingEvidence).toEqual(VISUAL);
    });

  it("treats a stored alternative name as restating the conclusion", () => {
    const [name] = reference.facts("kharosthi")!.alternativeNames;
    const result = verify({ direction: "right_to_left" }, [candidate([`angular ${name} strokes`, ...VISUAL], "kharosthi")]);
    expect(result.candidates[0]!.supportingEvidence).toEqual(VISUAL);
  });

  it("does not treat another script's name as restating the conclusion", () => {
    const result = verify({}, [candidate(["angular strokes like Greek", "evenly spaced rows"], "latin")]);
    expect(result.candidates[0]!.supportingEvidence).toHaveLength(2);
  });

  it("keeps evidence against a candidate that a filter would drop as evidence for it", () => {
    const result = verify({}, [candidate(VISUAL, "greek", ["this does not look like Greek"])]);
    expect(result.candidates[0]!.contradictingEvidence).toEqual(["this does not look like Greek"]);
  });

  it("removes non-visual claims from the visual observation lists", () => {
    const result = verify({ visualFeatures: ["Typical of the Ptolemaic dynasty", "angular strokes"] }, [candidate(VISUAL, "greek")]);
    expect(result.observations.visualFeatures).toEqual(["angular strokes"]);
  });

  it("refuses out_of_scope alongside writingPresent false", () => {
    expect(verify({ writingPresent: false }, [], "out_of_scope", "Cuneiform.").status).toBe("insufficient_evidence");
  });

  it("does not let no_writing stand on a poor image", () => {
    const result = verify({ writingPresent: false, imageQuality: "poor" }, [], "no_writing", "Blank.");
    expect(result.status).toBe("insufficient_evidence");
    expect(result.statusReason).toContain("too poor to show");
  });

  it("keeps an explicit no_writing on a usable image, with expert review", () => {
    const result = verify({ writingPresent: false }, [], "no_writing", "Bare stone.");
    expect(result).toMatchObject({ status: "no_writing", statusReason: "Bare stone.", recommendExpertReview: true });
  });

  it("rejects no_writing with writingPresent true at the schema", () => {
    expect(() => verify({ writingPresent: true }, [], "no_writing", "Blank.")).toThrow();
  });

  it("drops only the refused candidates' evidence, and keeps scripts outside the collection visible", () => {
    const result = verify({ imageQuality: "poor" }, [candidate(VISUAL, "ogham")]);
    expect(result).toMatchObject({ status: "insufficient_evidence", unsupportedScriptIds: ["ogham"] });
  });

  it("uses the stored trait, and treats a missing trait as not checkable", () => {
    expect(reference.facts("brahmi")!.direction).toBeNull();
    expect(reference.facts("phoenician")!.direction).toBe("right_to_left");
    expect(verify({ direction: "left_to_right" }, [candidate(VISUAL, "phoenician")]).candidates[0]!.directionCheck).toBe("conflict");
    expect(verify({ direction: "right_to_left" }, [candidate(VISUAL, "phoenician")]).candidates[0]!.directionCheck).toBe("consistent");
    expect(verify({ direction: "right_to_left" }, [candidate(VISUAL, "brahmi")]).candidates[0]!.directionCheck).toBe("not_checkable");
  });

  it.each(["boustrophedon", "vertical", "unclear"] as const)("never calls %s a conflict, since early inscriptions vary", (observed) => {
    expect(directionCheck(observed, "left_to_right")).toBe("not_checkable");
  });

  it("reserves strong for sourced matches the current records cannot supply", () => {
    const evidence = { supportingEvidence: VISUAL, contradictingEvidence: [] };
    expect(evidenceStrength(evidence, "good", "consistent", MIN_SOURCED_MATCHES_FOR_STRONG - 1)).toBe("moderate");
    expect(evidenceStrength(evidence, "good", "consistent", MIN_SOURCED_MATCHES_FOR_STRONG)).toBe("strong");
    expect(evidenceStrength(evidence, "fair", "consistent", MIN_SOURCED_MATCHES_FOR_STRONG)).toBe("moderate");
    expect(evidenceStrength(evidence, "good", "conflict", MIN_SOURCED_MATCHES_FOR_STRONG)).toBe("weak");
  });
});

describe("known limits, pinned so nobody assumes more", () => {
  it("a false statement in visual words still passes, and stays below strong", () => {
    const invented = ["perfectly straight strokes that are not in the image", "circular loops that are not in the image"];
    const result = verify({}, [candidate(invented, "greek")]);
    expect(result.candidates[0]).toMatchObject({ evidenceStrength: "moderate" });
    expect(result.recommendExpertReview).toBe(true);
  });

  it("history mixed with a visual word can survive, and stays below strong", () => {
    const result = verify({}, [candidate(["Mauryan-era angular strokes", "straight lines"])]);
    expect(result.candidates[0]!.supportingEvidence).toContain("Mauryan-era angular strokes");
    expect(result.candidates[0]!.evidenceStrength).toBe("moderate");
  });

  it("free-form limitations are filtered only by written form", () => {
    expect(verify({ limitations: ["Typical of the Ptolemaic dynasty"] }, [candidate(VISUAL, "greek")]).observations.limitations).toHaveLength(1);
  });
});
