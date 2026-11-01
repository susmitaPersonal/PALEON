import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, RuntimeInfo } from "@scriptecho/contracts";
import { App } from "../App";
import { Results } from "../components/Results";
import { AppProvider } from "../state/AppContext";
import { analysis, comparison, detail, runtime, scripts } from "./fixtures";

type Reply = { status?: number; body: unknown };
let analyses: Reply;
let runtimeInfo: RuntimeInfo;
let failing: RegExp | null;

const ok = (data: unknown): Reply => ({ body: { ok: true, data, meta: { requestId: "r" } } });
const failed = (code: string, message: string, retryable: boolean, status: number): Reply =>
  ({ status, body: { ok: false, error: { code, message, retryable }, meta: { requestId: "r" } } });

beforeEach(() => {
  analyses = ok(analysis());
  runtimeInfo = runtime;
  failing = null;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (failing?.test(input)) throw new TypeError("offline");
    const route = (): Reply => {
      if (input.endsWith("/runtime")) return ok(runtimeInfo);
      if (input.endsWith("/analyses")) return analyses;
      if (input.includes("/comparisons")) return ok(comparison);
      if (input.endsWith("/scripts")) return ok(scripts);
      if (input.endsWith("/scripts/ghost")) return failed("not_found", "That script is not in the reference collection.", false, 404);
      return ok(detail);
    };
    const reply = route();
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }));
});

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><AppProvider><App /></AppProvider></MemoryRouter>);
const image = (name = "stone.png", type = "image/png", size = 10) => new File([new Uint8Array(size)], name, { type });
const accessibility = async (container: Element) => {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);
};

describe("demo mode", () => {
  it("is visible on every page", async () => {
    open("/");
    expect(await screen.findByRole("note")).toHaveTextContent("Results are simulated fixtures, not AI inference");
  });

  it("is hidden for a real provider, which warns about third parties instead", async () => {
    runtimeInfo = { ...runtime, simulated: false, inferenceMode: "external", provider: "x", externalInferenceEnabled: true };
    open("/investigate");
    expect(await screen.findByText(/sent to a third-party model provider/)).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Simulated scenario/)).not.toBeInTheDocument();
  });
});

describe("local model mode (mocked API, no model runs)", () => {
  const local: RuntimeInfo = { ...runtime, simulated: false, inferenceMode: "local", provider: "ollama", modelId: "qwen2.5vl:3b", modelStatus: "ready",
    modelDetails: { family: "qwen25vl", parameterSize: "3.0B", quantization: "Q4_K_M" } };

  it("says the image stays on this computer, with no demo or third-party notice", async () => {
    runtimeInfo = local;
    open("/investigate");
    expect(await screen.findByRole("note")).toHaveTextContent("analysed on this computer by qwen2.5vl:3b");
    expect(screen.queryByText(/third-party/)).not.toBeInTheDocument();
    expect(screen.queryByText(/simulated fixtures/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Simulated scenario/)).not.toBeInTheDocument();
  });

  it.each([
    ["server_unreachable", /not running/], ["model_not_installed", /not installed/], ["no_vision_support", /does not report image input/], ["not_local", /runs remotely/],
  ] as const)("blocks analysis when the model status is %s", async (modelStatus, message) => {
    runtimeInfo = { ...local, modelStatus };
    open("/investigate");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Analyse image" })).toBeDisabled();
  });

  it("shows genuine local provenance on results", async () => {
    runtimeInfo = local;
    const result = { ...analysis(), provenance: { ...analysis().provenance, simulated: false, inferenceMode: "local" as const, provider: "ollama", modelId: "qwen2.5vl:3b" } };
    render(<MemoryRouter><AppProvider><Results result={result} previewUrl="blob:x" fileName="stone.png" /></AppProvider></MemoryRouter>);
    expect(await screen.findByText("Local model result")).toBeInTheDocument();
    expect(screen.getByText("Genuine local model inference, on this computer")).toBeInTheDocument();
    expect(screen.queryByText("Simulated result")).not.toBeInTheDocument();
  });

  it("states the mode and model details on the transparency page", async () => {
    runtimeInfo = local;
    open("/transparency");
    expect(await screen.findByText("Genuine inference by a local model on this computer")).toBeInTheDocument();
    expect(screen.getByText("qwen25vl, 3.0B, Q4_K_M")).toBeInTheDocument();
  });
});

describe("analysis controls", () => {
  const upload = async () => {
    open("/investigate");
    await screen.findByRole("heading", { name: "New investigation" });
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "stone.png", { type: "image/png" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Analyse image" }));
  };

  it("shows real streamed progress, and a stream with no result is an error", async () => {
    const lines = [{ type: "progress", progress: { stage: "analysing" } }, { type: "progress", progress: { stage: "generating", tokens: 7 } }];
    let finish = () => {};
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.map((line) => `${JSON.stringify(line)}\n`).join("")));
      finish = () => controller.close();
    } });
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => init?.method === "POST"
      ? new Response(stream, { headers: { "content-type": "application/x-ndjson" } }) : original(input, init)));
    await upload();
    expect(await screen.findByRole("status")).toHaveTextContent("7 tokens so far");
    expect(screen.getByRole("button", { name: "Cancel analysis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analysing" })).toBeDisabled();
    finish();
    expect(await screen.findByText(/could not reach its server/)).toBeInTheDocument();
  });

  it("cancels a running analysis, and aborts its request", async () => {
    let seen: AbortSignal | undefined;
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => {
      if (init?.method !== "POST") return original(input, init);
      seen = init.signal ?? undefined;
      return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    await upload();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel analysis" }));
    expect(await screen.findByText("The analysis was cancelled.")).toBeInTheDocument();
    expect(seen?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Analyse image" })).toBeEnabled();
  });
});

describe("when runtime information cannot be read", () => {
  it("blocks analysis, so a privacy warning cannot silently disappear", async () => {
    failing = /runtime/;
    open("/investigate");
    expect(await screen.findByRole("alert")).toHaveTextContent(/configuration can be read/);
    expect(screen.getByRole("button", { name: "Analyse image" })).toBeDisabled();
  });
});

describe("home", () => {
  it("states scope and limits honestly", async () => {
    open("/");
    expect(await screen.findByRole("link", { name: "Brahmi" })).toBeInTheDocument();
    expect(screen.getByText(/no accuracy is claimed/)).toBeInTheDocument();
    expect(screen.getByText(/quick analysis does not transcribe, transliterate, or translate/)).toBeInTheDocument();
    expect(await screen.findByText(/Planned evaluation also checks/)).toBeInTheDocument();
  });

  it("recovers from a failed load", async () => {
    failing = /scripts/;
    open("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("could not reach its server");
    failing = null;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Brahmi" })).toBeInTheDocument();
  });
});

describe("investigation", () => {
  const choose = async (file: File) => {
    await screen.findByLabelText(/Simulated scenario/);
    await userEvent.upload(screen.getByLabelText(/Choose an image/), file);
  };

  it("needs an image before analysing", async () => {
    open("/investigate");
    expect(await screen.findByRole("button", { name: "Analyse image" })).toBeDisabled();
  });

  it("previews, submits, and shows results", async () => {
    open("/investigate");
    await choose(image());
    expect(screen.getByAltText("Preview of stone.png")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Analyse image" }));
    expect(await screen.findByRole("heading", { name: "Candidate scripts found" })).toBeInTheDocument();
    expect(screen.getByText("Simulated result")).toBeInTheDocument();
  });

  it("sends the chosen demo scenario", async () => {
    open("/investigate");
    await choose(image());
    await userEvent.selectOptions(screen.getByLabelText(/Simulated scenario/), "no_writing");
    await userEvent.click(screen.getByRole("button", { name: "Analyse image" }));
    await screen.findByRole("heading", { name: "Candidate scripts found" });
    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/analyses"))!;
    expect((call[1]!.body as FormData).get("demoScenario")).toBe("no_writing");
  });

  it("rejects the wrong type and an oversized file before upload", async () => {
    open("/investigate");
    await screen.findByLabelText(/Simulated scenario/);
    await userEvent.upload(screen.getByLabelText(/Choose an image/), image("a.pdf", "application/pdf"), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("JPEG, PNG, or WebP");
    await userEvent.upload(screen.getByLabelText(/Choose an image/), image("big.png", "image/png", 2 * 1024 * 1024));
    expect(await screen.findByRole("alert")).toHaveTextContent("under 1 MB");
    expect(screen.getByRole("button", { name: "Analyse image" })).toBeDisabled();
  });

  it("shows a server rejection, with no retry when it would not help", async () => {
    analyses = failed("unsupported_media_type", "Upload a JPEG, PNG, or WebP image.", false, 415);
    open("/investigate");
    await choose(image());
    await userEvent.click(screen.getByRole("button", { name: "Analyse image" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload a JPEG");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("retries a provider failure, keeping the image", async () => {
    analyses = failed("provider_unavailable", "The analysis service is unavailable.", true, 503);
    open("/investigate");
    await choose(image());
    await userEvent.click(screen.getByRole("button", { name: "Analyse image" }));
    await screen.findByRole("alert");
    analyses = ok(analysis());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Candidate scripts found" })).toBeInTheDocument();
  });

  it("explains an empty results page", async () => {
    open("/results");
    expect(await screen.findByRole("heading", { name: "No result to show" })).toBeInTheDocument();
  });
});

describe("results", () => {
  const show = (overrides: Partial<AnalysisResult> = {}) =>
    render(<MemoryRouter><Results result={analysis(overrides)} previewUrl="blob:x" fileName="stone.png" /></MemoryRouter>);

  it("shows ranked evidence for and against, with no percentages", async () => {
    const { container } = show();
    expect(screen.getByRole("link", { name: "Brahmi" })).toBeInTheDocument();
    expect(screen.getByText("Upright strokes")).toBeInTheDocument();
    expect(screen.getByText("No line seen")).toBeInTheDocument();
    expect(screen.getByText("Moderate evidence")).toBeInTheDocument();
    await screen.findAllByText("Attested from the third century BCE.");
    expect(container.textContent).not.toMatch(/\d\s*%/);
  });

  it("separates AI observations from sourced facts", async () => {
    show();
    const observed = screen.getByRole("region", { name: "Seen in the image" });
    expect(within(observed).getByText("AI observation, not verified")).toBeInTheDocument();
    const sourced = await screen.findByRole("region", { name: "Brahmi: reference record" });
    expect(within(sourced).getByText("From the sources")).toBeInTheDocument();
    expect(await within(sourced).findByText("Attested from the third century BCE.")).toBeInTheDocument();
    expect(within(observed).queryByText(/third century/)).not.toBeInTheDocument();
  });

  it("links citations to stored sources", async () => {
    show();
    const sourced = await screen.findByRole("region", { name: "Brahmi: reference record" });
    const reference = await within(sourced).findByRole("link", { name: "Source 1" });
    expect(reference).toHaveAttribute("href", "#source-unicode-16-ch14");
    expect(within(sourced).getByRole("link", { name: /View source/ })).toHaveAttribute("href", "https://www.unicode.org/x/");
  });

  it("compares candidates and shows missing evidence", async () => {
    show();
    expect(await screen.findByText("Writing direction: no stored claim for Brahmi")).toBeInTheDocument();
    expect(screen.getByText(/does not establish historical descent/)).toBeInTheDocument();
  });

  it.each([
    ["out_of_scope", "Outside the supported scripts"],
    ["no_writing", "No writing detected"],
    ["insufficient_evidence", "Not enough evidence to identify a script"],
  ] as const)("shows %s with no candidates", (status, heading) => {
    show({ status, statusReason: "A reason.", candidates: [] });
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ranked candidates" })).not.toBeInTheDocument();
  });

  it("warns about quality, removed statements, and unsupported scripts", () => {
    show({ observations: { ...analysis().observations, imageQuality: "poor" }, removedStatements: 2, unsupportedScriptIds: ["ogham"] });
    expect(screen.getByText("Poor image quality.")).toBeInTheDocument();
    expect(screen.getByText(/2 statement\(s\) were removed/)).toBeInTheDocument();
    expect(screen.getByText(/ogham/)).toBeInTheDocument();
  });

  it("states what was not attempted and how the result was made", () => {
    show();
    expect(screen.getByText(/does not identify language, transcribe, transliterate, or translate/)).toBeInTheDocument();
    expect(screen.getByText("Simulated fixture, not AI inference")).toBeInTheDocument();
    expect(screen.getByText("script_analysis_v1")).toBeInTheDocument();
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = show();
    await screen.findByText("Writing direction: no stored claim for Brahmi");
    await accessibility(container);
  });
});

describe("reference pages", () => {
  it("marks incomplete records instead of filling them", async () => {
    open("/scripts/brahmi");
    expect(await screen.findByText(/Incomplete record/)).toBeInTheDocument();
    expect(screen.getAllByText("No sourced claim is stored.").length).toBe(2);
    expect(screen.getByText(/Not reviewed by an epigrapher/)).toBeInTheDocument();
    expect(screen.getByText(/not attested letter shapes/)).toBeInTheDocument();
  });

  it("handles an unknown script", async () => {
    open("/scripts/ghost");
    expect(await screen.findByRole("alert")).toHaveTextContent("not in the reference collection");
  });

  it("lists scripts with their completeness", async () => {
    open("/scripts");
    expect(await screen.findByText("Incomplete: directionality")).toBeInTheDocument();
    expect(screen.getByText("All core fields sourced")).toBeInTheDocument();
  });

  it("handles an empty collection", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => new Response(JSON.stringify(ok(input.endsWith("/runtime") ? runtime : []).body))));
    open("/scripts");
    expect(await screen.findByText(/No scripts are in the reference collection/)).toBeInTheDocument();
  });

  it("compares two chosen scripts and blocks a self-comparison", async () => {
    open("/compare");
    expect(await screen.findByText(/no stored claim for Brahmi/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Second script"), "brahmi");
    expect(screen.getByText("Choose two different scripts.")).toBeInTheDocument();
  });
});

describe("transparency and navigation", () => {
  it("makes no accuracy claim and explains demo mode", async () => {
    open("/transparency");
    expect(await screen.findByText(/No real model has been evaluated/)).toBeInTheDocument();
    expect(screen.getByText(/does not examine your image/)).toBeInTheDocument();
    expect(await screen.findByText(/No image leaves this machine/)).toBeInTheDocument();
    expect(screen.getByText(/not representative/)).toBeInTheDocument();
  });

  it("shows a not-found page", async () => {
    open("/nowhere");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("offers a skip link and named navigation", async () => {
    open("/");
    expect(await screen.findByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("moves focus to the content after navigating", async () => {
    open("/");
    await userEvent.click(await screen.findByRole("link", { name: "Scripts" }));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("main")));
  });

  it("works from the keyboard", async () => {
    open("/investigate");
    await screen.findByLabelText(/Simulated scenario/);
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus();
  });

  it("has no detectable accessibility violations on the main pages", async () => {
    for (const [path, text] of [["/", "Brahmi"], ["/scripts", "Brahmi"], ["/investigate", "New investigation"], ["/transparency", "Research transparency"]] as const) {
      const { container, unmount } = open(path);
      await screen.findAllByText(text);
      await accessibility(container);
      unmount();
    }
  });
});
