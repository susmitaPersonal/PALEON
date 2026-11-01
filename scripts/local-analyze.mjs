// Sends one image to a running local-model server and records the result under experiments/local_vlm/records.
// It refuses anything but genuine local inference, so a mock result can never be recorded as a model result.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { basename, resolve } from "node:path";

const MIN_FREE_GB = 4;
const [imagePath] = process.argv.slice(2);
const server = process.env.PALEON_URL ?? "http://127.0.0.1:8787";
const ollama = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const stop = (message) => { console.error(message); process.exit(1); };
if (!imagePath) stop("Usage: node scripts/local-analyze.mjs <image>");

const json = async (url, init) => (await fetch(url, init)).json();
const runtime = (await json(`${server}/api/v1/runtime`).catch(() => stop(`No server at ${server}`))).data;
if (runtime.inferenceMode !== "local") stop(`Refused: the server is in ${runtime.inferenceMode} mode, not local inference.`);
if (runtime.modelStatus !== "ready") stop(`Refused: the local model is not ready (${runtime.modelStatus}).`);

// Inference on a small machine grows swap, which takes disk space, so a low disk stops the run before it starts.
const freeGb = (({ bavail, bsize }) => (bavail * bsize) / 2 ** 30)(statfsSync(import.meta.dirname));
if (freeGb < MIN_FREE_GB) stop(`Refused: only ${freeGb.toFixed(1)} GiB of disk is free, and this needs ${MIN_FREE_GB}.`);

const bytes = readFileSync(imagePath);
const form = new FormData();
form.set("image", new File([bytes], basename(imagePath)));
const started = performance.now();
const response = await fetch(`${server}/api/v1/analyses`, { method: "POST", body: form, headers: { Accept: "application/x-ndjson" } });
let reply = null;
let pending = "";
for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
  pending += chunk;
  const lines = pending.split("\n");
  pending = lines.pop();
  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.type === "result") reply = event.body;
    if (event.type === "progress" && event.progress.stage !== "generating") console.log(`${Math.round((performance.now() - started) / 1000)} s: ${event.progress.stage}`);
  }
}
const wallMs = Math.round(performance.now() - started);
if (!reply) stop(`The stream ended with no result after ${wallMs} ms.`);
if (!reply.ok) stop(`Analysis failed after ${wallMs} ms: ${reply.error.code}: ${reply.error.message}`);
if (reply.data.provenance.simulated) stop("Refused: the result is simulated.");

const tags = await json(`${ollama}/api/tags`);
const installed = tags.models?.find((model) => model.name === runtime.modelId);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const record = {
  experiment: "local_vlm", notM0: "This is a separate local run. It is not part of the M0 experiment.",
  image: { name: basename(imagePath), sha256, datasetRow: process.env.DATASET_ROW ?? null }, wallMs,
  model: { id: runtime.modelId, digest: installed?.digest ?? null, details: runtime.modelDetails },
  runtime: { ollama: (await json(`${ollama}/api/version`)).version, promptVersion: runtime.promptVersion },
  hardware: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, memoryBytes: totalmem() },
  parameters: Object.fromEntries(["OLLAMA_NUM_CTX", "OLLAMA_NUM_PREDICT", "MAX_MODEL_IMAGE_EDGE"].map((name) => [name, process.env[name] ?? null])),
  result: reply.data,
};
const directory = resolve(import.meta.dirname, "../experiments/local_vlm/records");
mkdirSync(directory, { recursive: true });
const file = resolve(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}-${sha256.slice(0, 12)}.json`);
writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
console.log(`${reply.data.status} in ${wallMs} ms. Recorded: ${file}`);
