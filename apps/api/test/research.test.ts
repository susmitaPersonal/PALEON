import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ResearchCaseSchema, ResearchDatasetRecordSchema, ReviewRequestSchema, SignTokenSchema, type ResearchCase, type ResearchDatasetRecord, type SignToken } from "@scriptecho/contracts";
import { createApp } from "../src/app";
import { createLogger } from "../src/logger";
import { MockProvider } from "../src/providers/mock";
import { characterErrorRate, checkDataset, evaluate, wordErrorRate } from "../src/research/evaluation";
import { checkResearchKnowledge, loadInventories, loadLanguages, ResearchKnowledge } from "../src/research/knowledge";
import { CaseStore } from "../src/research/store";
import { buildHypothesis } from "../src/research/translation";
import { reverseTransliteration, transliterate } from "../src/research/transliteration";
import { decodeGray, featureSimilarity, looksLikeTexture, measureQuality, segmentSigns, signFeatures } from "../src/research/vision";
import { AnalysisService } from "../src/services/analysis";
import { loadPrompt } from "../src/services/prompt";
import { FIXTURES, KNOWLEDGE, PROMPT_PATH, references, testConfig } from "./helpers";

const scriptIds = ["brahmi", "greek", "kharosthi", "latin", "phoenician", "runic"];
const sourceIds = ["unicode-16-ucd"];
const inventories = loadInventories(KNOWLEDGE);
const languages = loadLanguages(KNOWLEDGE);
const knowledge = new ResearchKnowledge(inventories, languages, scriptIds, sourceIds);
const latin = knowledge.inventory("latin")!;
const brahmi = knowledge.inventory("brahmi")!;
const lang = knowledge.language("latin")!;
const person = { name: "Test Researcher", role: "researcher" as const };

const signId = (text: string) => latin.signs.find((sign) => sign.character === text)!.id;
const token = (id: string, signs: string[], overrides: Partial<SignToken> = {}): SignToken => ({
  id, box: null, readings: signs.map((sign) => ({ signIds: [...sign].map(signId), note: null })), status: signs.length > 1 ? "uncertain" : "certain",
  segmentationUncertain: false, wordBreakAfter: false, lineBreakAfter: false, origin: "human_corrected", note: null, ...overrides,
});
const word = (text: string, base = "t") => [...text].map((char, index) => token(`${base}${index}`, [char], { wordBreakAfter: index === text.length - 1 }));
const indic = (name: string) => brahmi.signs.find((sign) => sign.name === name)!.id;

/** Generated shapes only. Passing here shows the code runs, and says nothing about historical inscriptions. */
const SHAPES = {
  bar: '<rect x="15" y="5" width="10" height="50"/>',
  ell: '<path d="M8 5h10v40h22v10h-32z"/>',
  ring: '<path fill-rule="evenodd" d="M20 5a25 25 0 1 0 .1 0zM20 18a12 12 0 1 1-.1 0z"/>',
};
const page = (rows: (keyof typeof SHAPES)[][]) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${rows.length * 100 + 20}"><rect width="100%" height="100%" fill="#fff"/>${
  rows.flatMap((row, y) => row.map((shape, x) => `<g transform="translate(${30 + x * 90},${20 + y * 100})">${SHAPES[shape]}</g>`)).join("")}</svg>`)).png().toBuffer();

describe("sign inventories", () => {
  it("cover every script, and claim no expert review", () => {
    expect(inventories.map((item) => item.scriptId)).toEqual(scriptIds);
    expect(inventories.flatMap((item) => item.signs).every((sign) => sign.reviewStatus === "unreviewed")).toBe(true);
    expect(checkResearchKnowledge(inventories, languages, scriptIds, sourceIds)).toEqual([]);
  });

  it.each([
    ["a script with no record", (d: any) => { d.scripts = []; }, "no script record"],
    ["a wrong code point", (d: any) => { d.inv[3].signs[0].codePoint = "U+0000"; }, "does not match"],
    ["a false reversible claim", (d: any) => { d.inv[3].signs[1].schemes.unicode = d.inv[3].signs[0].schemes.unicode; }, "not"],
    ["a lexicon entry with no source", (d: any) => { d.langs[0].entries[0].sourceIds = ["ghost"]; }, "unknown source"],
  ])("refuses %s", (_name, mutate, fragment) => {
    const data = { inv: structuredClone(inventories), langs: structuredClone(languages), scripts: [...scriptIds] };
    mutate(data);
    expect(checkResearchKnowledge(data.inv, data.langs, data.scripts, sourceIds).join()).toContain(fragment);
  });

  it("lets a new script join by data, and refuses it without a record", () => {
    const ogham = { ...structuredClone(latin), scriptId: "ogham" };
    expect(checkResearchKnowledge([...inventories, ogham], languages, [...scriptIds, "ogham"], sourceIds)).toEqual([]);
    expect(() => new ResearchKnowledge([...inventories, ogham], languages, scriptIds, sourceIds)).toThrow("no script record");
  });
});

describe("transliteration", () => {
  it("keeps both readings of a sign with two values", () => {
    expect(transliterate(word("VIXIT"), latin).text).toBe("(u/v)(i/j)x(i/j)t");
  });

  it("traces every segment to its token", () => {
    const result = transliterate(word("AB"), latin);
    expect(result.words[0]!.segments.map((segment) => segment.tokenIds)).toEqual([["t0"], ["t1"]]);
    expect(result.method).toBe("rule_based");
  });

  it("marks damage, illegible signs, and gaps instead of filling them", () => {
    const tokens = [token("a", ["A"], { status: "damaged" }), token("b", [], { status: "illegible" }), token("c", [], { status: "lost" }), token("d", [], { status: "unread" })];
    const result = transliterate(tokens, latin);
    expect(result.text).toBe("ạ+[...]?");
    expect(result.unresolvedTokens).toBe(4);
  });

  it("joins a vowel sign to its consonant and keeps both tokens", () => {
    const ka = indic("BRAHMI LETTER KA");
    const vowel = indic("BRAHMI VOWEL SIGN I");
    const tokens = [{ ...token("k", []), status: "certain" as const, readings: [{ signIds: [ka], note: null }] }, { ...token("i", []), status: "certain" as const, readings: [{ signIds: [vowel], note: null }] }];
    const segments = transliterate(tokens, brahmi).words[0]!.segments;
    expect(segments).toHaveLength(1);
    expect(segments[0]!.alternatives).toEqual(["ki"]);
    expect(segments[0]!.tokenIds).toEqual(["k", "i"]);
  });

  it("treats a ligature as one token of several signs", () => {
    const result = transliterate([{ ...token("l", ["A"]), readings: [{ signIds: [signId("A"), signId("E")], note: null }] }], latin);
    expect(result.text).toBe("ae");
  });

  it("round-trips a reversible scheme, and refuses a non-reversible one", () => {
    const text = transliterate(word("ROMA"), latin, "unicode").text;
    expect(reverseTransliteration(text, latin, "unicode")).toEqual([..."ROMA"].map(signId));
    expect(reverseTransliteration(text, latin, "conventional")).toBeNull();
  });

  it("refuses an unknown scheme", () => {
    expect(() => transliterate([], latin, "ghost")).toThrow("unknown scheme");
  });
});

describe("translation hypotheses", () => {
  const hypothesis = (tokens: SignToken[], language = lang as typeof lang | null) => buildHypothesis(transliterate(tokens, latin), language, "not_reviewed");

  it("refuses to translate when no person has set a language", () => {
    const result = hypothesis(word("VIXIT"), null);
    expect(result.status).toBe("language_not_established");
    expect(result.words).toEqual([]);
  });

  it("finds a word through its alternative readings, with a source", () => {
    const [only] = hypothesis(word("VIXIT")).words;
    expect(only!.state).toBe("matched");
    expect(only!.matches[0]).toMatchObject({ form: "vixit", gloss: "to live", sourceIds: ["wiktionary-en"] });
  });

  it("keeps every lexical interpretation of an ambiguous word", () => {
    const [only] = hypothesis(word("SITVS")).words;
    expect(only!.state).toBe("ambiguous");
    expect(only!.matches.map((match) => match.entryId)).toEqual(["situs-participle", "situs-position", "situs-decay"]);
  });

  it("reports translated and untranslated words apart, with no sentence", () => {
    const result = hypothesis([...word("ANNOS", "a"), ...word("ZZZ", "b")]);
    expect(result).toMatchObject({ status: "partial", matchedWords: 1, unmatchedWords: 1 });
    expect(Object.keys(result)).not.toContain("translation");
  });

  it("never looks up a word with a missing sign", () => {
    const [only] = hypothesis([token("a", ["A"]), token("b", [], { status: "illegible" })]).words;
    expect(only!.state).toBe("unreadable");
    expect(only!.matches).toEqual([]);
  });

  it("limits the alternatives it expands", () => {
    const [only] = hypothesis(word("IIIIIIIII")).words;
    expect(only!.state).toBe("too_many_alternatives");
  });
});

describe("rule-based vision", () => {
  it("proposes boxes in reading order, by line", async () => {
    const image = await page([["bar", "ell"], ["ring"]]);
    const meta = await sharp(image).metadata();
    const tokens = await segmentSigns(image, { width: meta.width, height: meta.height }, false);
    expect(tokens).toHaveLength(3);
    expect(tokens[0]!.box!.x).toBeLessThan(tokens[1]!.box!.x);
    expect(tokens.map((item) => item.lineBreakAfter)).toEqual([false, true, true]);
    expect(tokens.every((item) => item.status === "unread" && item.origin === "rule_based" && item.readings.length === 0)).toBe(true);
  });

  it("reverses each line for a right-to-left script", async () => {
    const image = await page([["bar", "ell"]]);
    const meta = await sharp(image).metadata();
    const tokens = await segmentSigns(image, { width: meta.width, height: meta.height }, true);
    expect(tokens[0]!.box!.x).toBeGreaterThan(tokens[1]!.box!.x);
  });

  it("measures sharpness separately from contrast, and flags blur", async () => {
    const crisp = await page([["bar", "ell"], ["ring"]]);
    const soft = await sharp(crisp).blur(8).png().toBuffer();
    const first = await measureQuality(crisp);
    const second = await measureQuality(soft);
    expect(first.sharpness).not.toBe(first.contrast);
    expect(second.sharpness).toBeLessThan(first.sharpness / 2);
    expect(second.flags).toContain("blurred");
    expect(first.flags).not.toContain("blurred");
  });

  it("flags every box when a surface yields texture instead of signs", async () => {
    const pits = Array.from({ length: 500 }, (_, index) => `<circle cx="${(index % 25) * 24 + 12}" cy="${Math.floor(index / 25) * 29 + 12}" r="4"/>`).join("");
    const noise = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="#fff"/>${pits}</svg>`)).png().toBuffer();
    const tokens = await segmentSigns(noise, { width: 600, height: 600 }, false);
    expect(tokens.length).toBeGreaterThan(0);
    expect(looksLikeTexture(tokens)).toBe(true);
    expect(looksLikeTexture(await segmentSigns(await page([["bar", "ell", "bar"]]), { width: 400, height: 120 }, false))).toBe(false);
  });

  it("finds nothing on a blank image", async () => {
    const blank = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ddd" } }).png().toBuffer();
    expect(await segmentSigns(blank, { width: 200, height: 200 }, false)).toEqual([]);
    expect((await measureQuality(blank)).flags).toContain("low_contrast");
  });

  it("scores a repeated shape above a different one", async () => {
    const image = await page([["ell", "bar", "ell"]]);
    const meta = await sharp(image).metadata();
    const size = { width: meta.width, height: meta.height };
    const [first, second, third] = await segmentSigns(image, size, false);
    const gray = await decodeGray(image);
    const features = [first, second, third].map((item) => signFeatures(gray, item!.box!, size));
    expect(featureSimilarity(features[0]!, features[2]!)).toBeGreaterThan(featureSimilarity(features[0]!, features[1]!));
  });
});

describe("evaluation", () => {
  const record = (id: string, overrides: Partial<ResearchDatasetRecord> = {}): ResearchDatasetRecord => ({
    id, split: "held_out", objectGroup: id, imageSha256: id.padEnd(64, "0"), originalSource: "x", rights: "x", scriptLabel: "latin", languageLabel: null, period: null,
    region: null, imageQuality: "good", damaged: false, referenceText: null, referenceTranslation: null, references: [], annotationReviewer: null, qualityStatus: "unreviewed", ...overrides,
  });

  it("measures error rates against a reference", () => {
    expect(characterErrorRate("abcd", "abxd")).toBe(0.25);
    expect(wordErrorRate("a b", "a c")).toBe(0.5);
    expect(characterErrorRate("", "x")).toBeNull();
  });

  it("refuses leakage between splits", () => {
    const shared = checkDataset([record("a1", { objectGroup: "o" }), record("a2", { objectGroup: "o", split: "training" })]);
    expect(shared.join()).toContain("appears in both");
    expect(() => evaluate([record("a1", { objectGroup: "o" }), record("a2", { objectGroup: "o", split: "training" })], [], [])).toThrow("Dataset refused");
  });

  it("marks anything but held-out data as not reportable", () => {
    const dev = evaluate([record("a1", { split: "synthetic" })], [{ recordId: "a1", scripts: ["latin"] }], []);
    expect(dev.reportable).toBe(false);
    expect(dev.warning).toContain("must not be reported");
    expect(evaluate([record("a1")], [{ recordId: "a1", scripts: ["latin"] }], []).reportable).toBe(true);
  });

  it("reports fractions, separates rejection, and pools text error", () => {
    const records = [record("a1", { referenceText: "abcd" }), record("a2", { scriptLabel: "greek" }), record("a3", { scriptLabel: "cuneiform" })];
    const report = evaluate(records, [{ recordId: "a1", scripts: ["latin"], text: "abxd" }, { recordId: "a2", scripts: ["latin", "greek"] }, { recordId: "a3", scripts: [] }], ["cuneiform"]);
    expect(report.top1).toEqual({ correct: 1, total: 2 });
    expect(report.top3).toEqual({ correct: 2, total: 2 });
    expect(report.rejection).toEqual({ correct: 1, total: 1 });
    expect(report.characterErrorRate).toBe(0.25);
    expect(report.byScript.greek).toEqual({ correct: 0, total: 1 });
  });

  it("refuses an expert-reference record with no reviewer", () => {
    expect(ResearchDatasetRecordSchema.safeParse(record("a1", { split: "expert_reference" })).success).toBe(false);
    expect(ResearchDatasetRecordSchema.safeParse(record("a1", { qualityStatus: "expert_reviewed" })).success).toBe(false);
  });
});

describe("token rules", () => {
  it.each([
    ["certain with no reading", { status: "certain", readings: [] }],
    ["certain with alternatives", { status: "certain", readings: [{ signIds: ["a1"], note: null }, { signIds: ["a2"], note: null }] }],
    ["lost with a reading", { status: "lost", readings: [{ signIds: ["a1"], note: null }] }],
  ])("refuses %s", (_name, overrides) => {
    expect(SignTokenSchema.safeParse({ ...token("t", []), ...overrides }).success).toBe(false);
  });

  it("refuses expert approval without the expert's own attestation", () => {
    const request = { expectedRevision: 1, state: "approved_by_expert", reviewer: person, evidence: "seen", attestsQualified: true };
    expect(ReviewRequestSchema.safeParse(request).success).toBe(false);
    expect(ReviewRequestSchema.safeParse({ ...request, reviewer: { name: "E", role: "qualified_expert" }, attestsQualified: false }).success).toBe(false);
    expect(ReviewRequestSchema.safeParse({ ...request, reviewer: { name: "E", role: "qualified_expert" } }).success).toBe(true);
  });
});

describe("research API", () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;
  const base = "http://local/api/v1";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paleon-"));
    const config = { ...testConfig(), dataDir: dir, rateLimitPerMinute: 1000 };
    const logger = createLogger("silent");
    const collection = references();
    const provider = new MockProvider(FIXTURES);
    const analysis = new AnalysisService(provider, collection, loadPrompt(PROMPT_PATH, collection.scriptIds()), logger, { deadlineMs: 1000, attemptTimeoutMs: 1000, maxRetries: 0, experimentId: null });
    app = createApp({ config, logger, provider, references: collection, analysis, promptVersion: "v", research: { store: new CaseStore(dir), knowledge } });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await app.request(`${base}${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
    return { status: response.status, body: await response.clone().json().catch(() => null), response };
  };
  const create = async (image?: Buffer): Promise<ResearchCase> => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array(image ?? await page([["bar", "ell", "bar"]]))], "x.png", { type: "image/png" }));
    form.set("title", "Test stone");
    form.set("rights", "Generated test image");
    const response = await app.request(`${base}/cases`, { method: "POST", body: form });
    return (await response.json()).data;
  };
  const withScript = async (id: string, revision: number) => (await call(`/cases/${id}`, "PATCH", { expectedRevision: revision, scriptId: "latin" })).body.data as ResearchCase;
  const save = (record: ResearchCase, tokens: SignToken[]) => call(`/cases/${record.id}/tokens`, "PUT", { expectedRevision: record.revision, tokens, reviewer: person, evidence: null });

  it("stores a case locally, with quality measured and a valid shape", async () => {
    const record = await create();
    expect(ResearchCaseSchema.safeParse(record).success).toBe(true);
    expect(record.quality?.method).toBe("rule_based_measurement");
    expect((await call("/cases")).body.data).toHaveLength(1);
    expect((await app.request(`${base}/cases/${record.id}/image`)).headers.get("content-type")).toBe("image/jpeg");
  });

  it("strips metadata before storing", async () => {
    const tagged = await sharp(await page([["bar"]])).jpeg().withExif({ IFD0: { Copyright: "secret-gps" } }).toBuffer();
    const record = await create(tagged);
    expect(readFileSync(join(dir, "cases", record.id, "image.jpg")).includes("secret-gps")).toBe(false);
  });

  it("refuses a path-traversal id", async () => {
    expect((await call("/cases/..%2F..%2Fetc")).status).toBe(404);
    expect((await app.request(`${base}/cases/not-a-uuid/image`)).status).toBe(404);
  });

  it("refuses a relative path that reaches a real case", async () => {
    const record = await create();
    const store = new CaseStore(dir);
    expect(store.get(record.id).id).toBe(record.id);
    expect(() => store.get(`../cases/${record.id}`)).toThrow("does not exist");
    expect(() => store.image(`../cases/${record.id}`)).toThrow("does not exist");
  });

  it("never suggests a sign from its own approved example", async () => {
    let record = await withScript((await create(await page([["ell"]]))).id, 2);
    record = (await call(`/cases/${record.id}/segment`, "POST", { expectedRevision: record.revision })).body.data;
    const read = { status: "certain" as const, readings: [{ signIds: [signId("L")], note: null }] };
    record = (await save(record, record.tokens.map((item) => ({ ...item, ...read })))).body.data;
    await call(`/cases/${record.id}/exemplars`, "POST", { tokenId: record.tokens[0]!.id, approvedBy: person });
    record = (await save(record, record.tokens.map((item) => ({ ...item, status: "uncertain" as const })))).body.data;
    const report = (await call(`/cases/${record.id}/suggestions`)).body.data;
    expect(report.exemplarCount).toBe(1);
    expect(report.tokens[0].suggestions).toEqual([]);
  });

  it("refuses a stale revision, so a correction cannot be lost", async () => {
    const record = await create();
    await withScript(record.id, record.revision);
    const stale = await call(`/cases/${record.id}`, "PATCH", { expectedRevision: record.revision, title: "Old page" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("conflict");
  });

  it("does not let an analysis candidate set the script", async () => {
    const record = await create();
    const analysed = await call(`/cases/${record.id}/analysis?demoScenario=clear_candidate`, "POST");
    expect(analysed.status).toBe(200);
    const stored = (await call(`/cases/${record.id}`)).body.data as ResearchCase;
    expect(stored.analysis?.provenance.simulated).toBe(true);
    expect(stored.scriptId).toBeNull();
  });

  it("segments, then refuses to replace human readings", async () => {
    let record = await withScript((await create()).id, 2);
    const segmented = await call(`/cases/${record.id}/segment`, "POST", { expectedRevision: record.revision });
    record = segmented.body.data;
    expect(record.tokens).toHaveLength(3);
    const read = record.tokens.map((item) => ({ ...item, status: "certain" as const, readings: [{ signIds: [signId("I")], note: null }] }));
    record = (await save(record, read)).body.data;
    expect((await call(`/cases/${record.id}/segment`, "POST", { expectedRevision: record.revision })).status).toBe(409);
  });

  it("decides origin itself, so a client cannot claim review", async () => {
    let record = await withScript((await create()).id, 2);
    record = (await call(`/cases/${record.id}/segment`, "POST", { expectedRevision: record.revision })).body.data;
    const forged = record.tokens.map((item, index) => (index === 0 ? { ...item, status: "certain" as const, origin: "expert_reviewed" as const, readings: [{ signIds: [signId("I")], note: null }] } : item));
    const saved = (await save(record, forged)).body.data as ResearchCase;
    expect(saved.tokens[0]!.origin).toBe("human_corrected");
    expect(saved.tokens[1]!.origin).toBe("rule_based");
  });

  it("refuses a sign from outside the inventory, a box outside the image, and readings with no script", async () => {
    const bare = await create();
    expect((await save(bare, [token("a", ["A"])])).status).toBe(400);
    const record = await withScript(bare.id, bare.revision);
    expect((await save(record, [{ ...token("a", ["A"]), readings: [{ signIds: ["u9999"], note: null }] }])).status).toBe(400);
    expect((await save(record, [token("a", ["A"], { box: { x: 390, y: 0, width: 50, height: 10 } })])).status).toBe(400);
  });

  it("refuses to change script while readings exist", async () => {
    let record = await withScript((await create()).id, 2);
    record = (await save(record, [token("a", ["A"])])).body.data;
    expect((await call(`/cases/${record.id}`, "PATCH", { expectedRevision: record.revision, scriptId: "greek" })).status).toBe(409);
  });

  it("offers no translation until a person sets the language, and refuses a mismatched pack", async () => {
    const start = await create();
    expect((await call(`/cases/${start.id}`, "PATCH", { expectedRevision: start.revision, languageId: "latin" })).status).toBe(400);
    let record = await withScript(start.id, start.revision);
    record = (await save(record, word("VIXIT"))).body.data;
    expect((await call(`/cases/${record.id}/translation`)).body.data.status).toBe("language_not_established");
    await call(`/cases/${record.id}`, "PATCH", { expectedRevision: record.revision, languageId: "latin" });
    expect((await call(`/cases/${record.id}/translation`)).body.data.status).toBe("all_words_matched");
  });

  it("learns from an approved sign and suggests it for a matching shape", async () => {
    let record = await withScript((await create(await page([["ell", "bar", "ell"]]))).id, 2);
    record = (await call(`/cases/${record.id}/segment`, "POST", { expectedRevision: record.revision })).body.data;
    const before = (await call(`/cases/${record.id}/suggestions`)).body.data;
    expect(before.exemplarCount).toBe(0);
    expect(before.tokens[0].suggestions).toEqual([]);
    const taught = record.tokens.map((item, index) => (index === 0 ? { ...item, status: "certain" as const, readings: [{ signIds: [signId("L")], note: null }] } : item));
    record = (await save(record, taught)).body.data;
    expect((await call(`/cases/${record.id}/exemplars`, "POST", { tokenId: record.tokens[0]!.id, approvedBy: person })).status).toBe(200);
    const after = (await call(`/cases/${record.id}/suggestions`)).body.data;
    const third = after.tokens.find((item: { tokenId: string }) => item.tokenId === record.tokens[2]!.id);
    expect(third.suggestions[0].signId).toBe(signId("L"));
    expect(after.note).toContain("not a probability");
  });

  it("refuses to learn from an unconfirmed sign", async () => {
    let record = await withScript((await create()).id, 2);
    record = (await call(`/cases/${record.id}/segment`, "POST", { expectedRevision: record.revision })).body.data;
    expect((await call(`/cases/${record.id}/exemplars`, "POST", { tokenId: record.tokens[0]!.id, approvedBy: person })).status).toBe(400);
  });

  it("records review history, and a later correction withdraws an approval", async () => {
    let record = await withScript((await create()).id, 2);
    record = (await save(record, [token("a", ["A"])])).body.data;
    const refused = await call(`/cases/${record.id}/review`, "POST", { expectedRevision: record.revision, state: "approved_by_expert", reviewer: person, evidence: "x", attestsQualified: false });
    expect(refused.status).toBe(400);
    record = (await call(`/cases/${record.id}/review`, "POST", { expectedRevision: record.revision, state: "approved_by_expert", reviewer: { name: "Dr E", role: "qualified_expert" }, evidence: "Checked against the edition", attestsQualified: true })).body.data;
    expect(record.tokens[0]!.origin).toBe("expert_reviewed");
    record = (await save(record, [token("a", ["B"])])).body.data;
    expect(record.reviewState).toBe("in_review");
    expect(record.tokens[0]!.origin).toBe("human_corrected");
    expect(record.history.filter((item) => item.tokens).map((item) => item.tokens![0]!.readings[0]!.signIds[0])).toEqual([signId("A"), signId("A"), signId("B")]);
  });

  it("exports a report that keeps uncertainty and gaps", async () => {
    let record = await withScript((await create()).id, 2);
    record = (await save(record, [...word("VIXIT"), token("z", [], { status: "illegible" })])).body.data;
    await call(`/cases/${record.id}`, "PATCH", { expectedRevision: record.revision, languageId: "latin" });
    const response = await app.request(`${base}/cases/${record.id}/report`);
    const text = await response.text();
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(text).toContain("(u/v)(i/j)x(i/j)t");
    expect(text).toContain("Glosses only, not a translation");
    expect(text).toContain("unreadable");
    expect(text).toContain("No recognition or translation method here has been validated");
    expect((await call(`/cases/${record.id}/report?format=json`)).body.transliteration.scheme).toBe("conventional");
    expect((await call(`/cases/${record.id}/report?format=pdf`)).status).toBe(400);
  });

  it("deletes a case, its image, and any examples taken from it", async () => {
    let record = await withScript((await create()).id, 2);
    record = (await save(record, [token("a", ["A"], { box: { x: 1, y: 1, width: 20, height: 20 } })])).body.data;
    await call(`/cases/${record.id}/exemplars`, "POST", { tokenId: "a", approvedBy: person });
    expect((await call(`/cases/${record.id}`, "DELETE")).status).toBe(200);
    expect((await call(`/cases/${record.id}`)).status).toBe(404);
    expect(readdirSync(join(dir, "cases"))).toEqual([]);
    expect(readFileSync(join(dir, "exemplars.json"), "utf8")).toBe("[]");
  });

  it("refuses a cross-site write", async () => {
    const response = await app.request(`${base}/cases/x`, { method: "DELETE", headers: { origin: "https://evil.example", host: "127.0.0.1:8787" } });
    expect(response.status).toBe(403);
  });

  it("reports hardware without starting anything", async () => {
    const { data } = (await call("/system")).body;
    expect(data.totalMemoryGb).toBeGreaterThan(0);
    expect(typeof data.localVisionFeasible).toBe("boolean");
  });

  it("serves inventories and language summaries", async () => {
    expect((await call("/scripts/runic/signs")).body.data.signs).toHaveLength(24);
    expect((await call("/scripts/ghost/signs")).status).toBe(404);
    expect((await call("/languages")).body.data[0]).toMatchObject({ id: "latin", entryCount: 12 });
  });
});
