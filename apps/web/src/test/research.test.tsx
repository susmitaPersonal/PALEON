import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchCase, SignInventory, SignToken } from "@scriptecho/contracts";
import { App } from "../App";
import { addBox, insertGap, mergeWithNext, moveToken, removeToken, splitToken } from "../research/tokens";
import { AppProvider } from "../state/AppContext";
import { runtime, scripts } from "./fixtures";

const token = (id: string, overrides: Partial<SignToken> = {}): SignToken => ({
  id, box: { x: 10, y: 10, width: 20, height: 20 }, readings: [{ signIds: ["u0041"], note: null }], status: "certain", segmentationUncertain: false,
  wordBreakAfter: false, lineBreakAfter: false, origin: "rule_based", note: null, ...overrides,
});

const inventory: SignInventory = {
  scriptId: "brahmi", version: "1", scope: "Test", inherentVowel: null, sourceIds: ["unicode-16-ucd"], limitations: ["Test limit."],
  schemes: [{ id: "conventional", label: "Conventional romanisation", reversible: false }],
  signs: [{ id: "u0041", character: "A", codePoint: "U+0041", name: "A", kind: "letter", values: ["a"], schemes: { unicode: "A" }, allographs: [], reviewStatus: "unreviewed" }],
};

const record = (overrides: Partial<ResearchCase> = {}): ResearchCase => ({
  id: "6f1d1c1e-8f3a-4b52-9d6e-111111111111", title: "Test stone", createdAt: "2026-11-02T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z", revision: 3,
  image: { sha256: "a".repeat(64), width: 100, height: 80, sourceFormat: "png", bytes: 10 }, provenance: { sourceDescription: "", rights: "Generated" },
  quality: null, scriptId: "brahmi", languageId: null, analysis: null, tokens: [token("t1")], notes: [], citations: [], reviewState: "not_reviewed",
  history: [{ revision: 1, at: "2026-11-02T00:00:00Z", action: "Case created", reviewer: null, evidence: null, tokens: null }], ...overrides,
});

const translation = { scriptId: "brahmi", languageId: null, status: "language_not_established", method: "lexicon_lookup", words: [], matchedWords: 0, unmatchedWords: 0, sources: [], reviewState: "not_reviewed", limitations: ["A script alone does not establish one."] };
const reading = { scriptId: "brahmi", scheme: "conventional", inventoryVersion: "1", method: "rule_based", words: [], text: "(u/v)ạ+", unresolvedTokens: 2, notation: "Leiden-style", limitations: [] };

let requests: { url: string; init?: RequestInit }[];
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data, meta: { requestId: "r" } }), { headers: { "content-type": "application/json" } });
const stub = (current: () => ResearchCase) => vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  requests.push({ url, init });
  if (url.endsWith("/runtime")) return ok(runtime);
  if (url.endsWith("/languages")) return ok([]);
  if (url.endsWith("/signs")) return ok(inventory);
  if (url.includes("/transliteration")) return ok(reading);
  if (url.endsWith("/translation")) return ok(translation);
  if (url.endsWith("/scripts")) return ok(scripts);
  if (url.endsWith("/cases") && !init) return ok([{ id: current().id, title: "Test stone", updatedAt: "x", scriptId: null, languageId: null, tokens: 4, reviewState: "not_reviewed" }]);
  return ok(current());
}));

const open = (path: string) => render(<AppProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AppProvider>);

beforeEach(() => { requests = []; });

describe("token editing", () => {
  const tokens = [token("t1", { box: { x: 0, y: 0, width: 10, height: 10 } }), token("t2", { box: { x: 20, y: 5, width: 10, height: 10 }, lineBreakAfter: true })];

  it("merges a broken sign into one box and clears its reading", () => {
    const [merged] = mergeWithNext(tokens, 0);
    expect(merged).toMatchObject({ box: { x: 0, y: 0, width: 30, height: 15 }, readings: [], status: "unread", segmentationUncertain: true, lineBreakAfter: true });
  });

  it("splits touching signs with unique IDs, and keeps original coordinates", () => {
    const split = splitToken(tokens, 1);
    expect(split).toHaveLength(3);
    expect(new Set(split.map((item) => item.id)).size).toBe(3);
    expect(split[1]!.box!.width + split[2]!.box!.width).toBe(10);
    expect(split[1]!.lineBreakAfter).toBe(false);
    expect(split[2]!.lineBreakAfter).toBe(true);
  });

  it("records a gap with no box", () => {
    expect(insertGap(tokens, 0)[1]).toMatchObject({ box: null, status: "lost", readings: [] });
  });

  it("adds a drawn box in either direction, inside the image, and ignores a stray click", () => {
    const image = { width: 100, height: 80 };
    const added = addBox(tokens, [90.4, 70], [50, 200], image).at(-1)!;
    expect(added).toMatchObject({ box: { x: 50, y: 70, width: 40, height: 10 }, status: "unread", origin: "human_corrected" });
    expect(addBox(tokens, [5, 5], [6, 6], image)).toBe(tokens);
  });

  it("moves and removes", () => {
    expect(moveToken(tokens, 0, 1).map((item) => item.id)).toEqual(["t2", "t1"]);
    expect(moveToken(tokens, 0, -1)).toBe(tokens);
    expect(removeToken(tokens, 0).map((item) => item.id)).toEqual(["t2"]);
  });
});

describe("research pages", () => {
  it("lists cases and offers a new one", async () => {
    stub(() => record());
    open("/cases");
    expect(await screen.findByRole("link", { name: /Test stone/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Rights and licence")).toBeInTheDocument();
  });

  it("shows the reading with its uncertainty, and states that no language means no translation", async () => {
    stub(() => record());
    open(`/cases/${record().id}`);
    expect(await screen.findByText("(u/v)ạ+")).toBeInTheDocument();
    expect(await screen.findByText("No language is set, so nothing is translated.")).toBeInTheDocument();
  });

  it("will not save a correction without a name", async () => {
    const user = userEvent.setup();
    stub(() => record());
    open(`/cases/${record().id}`);
    await user.selectOptions(await screen.findByLabelText("Status"), "illegible");
    expect(screen.getByRole("button", { name: "Save readings" })).toBeDisabled();
    await user.type(screen.getByLabelText("Your name"), "R");
    const save = screen.getByRole("button", { name: "Save readings" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(requests.some((item) => item.init?.method === "PUT")).toBe(true));
    const body = JSON.parse(String(requests.find((item) => item.init?.method === "PUT")!.init!.body));
    expect(body).toMatchObject({ expectedRevision: 3, reviewer: { name: "R", role: "researcher" } });
    expect(body.tokens[0]).toMatchObject({ status: "illegible", readings: [] });
  });

  it("keeps expert approval closed to a researcher", async () => {
    const user = userEvent.setup();
    stub(() => record());
    open(`/cases/${record().id}`);
    await user.type(await screen.findByLabelText("Your name"), "R");
    await user.selectOptions(screen.getByLabelText("Set review state"), "approved_by_expert");
    expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Your role"), "qualified_expert");
    expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
    await user.click(screen.getByLabelText(/I am qualified/));
    expect(screen.getByRole("button", { name: "Record review" })).toBeEnabled();
  });

  it("labels simulated output, and says a candidate does not set the script", async () => {
    const analysis = { candidates: [{ scriptId: "greek", scriptName: "Greek", evidenceStrength: "weak" }], statusReason: null, provenance: { simulated: true } } as unknown as ResearchCase["analysis"];
    stub(() => record({ analysis }));
    open(`/cases/${record().id}`);
    expect(await screen.findByText("Simulated demo output")).toBeInTheDocument();
    expect(screen.getByText(/A candidate never sets the script/)).toBeInTheDocument();
  });

  it("has no automatic accessibility violations", async () => {
    stub(() => record());
    const { container } = open(`/cases/${record().id}`);
    await screen.findByText("(u/v)ạ+");
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((item) => item.id)).toEqual([]);
  });
});
