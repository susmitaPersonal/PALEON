// Shows that a local model reads the image it is sent. Valid JSON alone cannot show that.
// Each run generates images with a digit and colour chosen at random, so a fixed or cached answer fails.
// Generated images only. This says nothing about historical scripts, and it is not part of M0.
import { randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const COLOURS = { red: "#d0021b", blue: "#0a3fd6", green: "#0a8a2f", orange: "#f08000", black: "#000000" };
const SCHEMA = { type: "object", additionalProperties: false, required: ["digit", "colour"], properties: {
  digit: { type: "integer", minimum: 0, maximum: 9 }, colour: { type: "string", enum: Object.keys(COLOURS) } } };
const QUESTION = "The image shows one large digit in one colour on a white background. Reply with the digit and the colour.";

const shuffled = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

export async function makeImages(count = 3) {
  const digits = shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const colours = shuffled(Object.keys(COLOURS));
  return Promise.all(Array.from({ length: count }, async (_, index) => {
    const truth = { digit: digits[index], colour: colours[index] };
    const svg = `<svg width="512" height="512"><rect width="512" height="512" fill="#fff"/><text x="256" y="400" font-family="Helvetica, Arial, sans-serif" font-size="420" font-weight="700" text-anchor="middle" fill="${COLOURS[truth.colour]}">${truth.digit}</text></svg>`;
    return { truth, base64: (await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer()).toString("base64") };
  }));
}

export async function runCheck({ baseUrl, model, images, fetchImpl = fetch, numCtx = 8192 }) {
  const url = new URL(baseUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Refused: not a loopback address.");
  const post = async (path, body) => (await fetchImpl(`${baseUrl}${path}`, { method: "POST", redirect: "error",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  const show = await post("/api/show", { model });
  if (show.remote_host || show.remote_model) throw new Error("Refused: this model runs remotely.");
  if (!show.capabilities?.includes("vision")) throw new Error("Refused: this model does not report image input.");
  const results = [];
  for (const { truth, base64 } of images) {
    const started = performance.now();
    const reply = await post("/api/chat", { model, stream: false, format: SCHEMA, options: { temperature: 0, num_ctx: numCtx, num_predict: 60 },
      ...(show.capabilities.includes("thinking") ? { think: false } : {}),
      messages: [{ role: "user", content: QUESTION, images: [base64] }] });
    let answer = null;
    try {
      answer = JSON.parse(reply.message?.content ?? "");
    } catch {
      answer = null;
    }
    results.push({ truth, answer, correct: answer?.digit === truth.digit && answer?.colour === truth.colour,
      ms: Math.round(performance.now() - started) });
  }
  return { passed: results.length > 0 && results.every((result) => result.correct), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL;
  if (!model) {
    console.error("Set OLLAMA_MODEL first.");
    process.exit(2);
  }
  const outcome = await runCheck({ baseUrl, model, images: await makeImages() }).catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
  for (const { truth, answer, correct, ms } of outcome.results) {
    console.log(`${correct ? "PASS" : "FAIL"} shown ${truth.digit} ${truth.colour}, answered ${answer?.digit} ${answer?.colour}, ${ms} ms`);
  }
  console.log(outcome.passed ? "The model read every generated image." : "FAILED: the model did not read every image.");
  process.exit(outcome.passed ? 0 : 1);
}
