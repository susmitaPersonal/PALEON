// Regression check for the 300 s failure. A real local server holds its reply past that limit, and the real
// transport must still receive it. This takes over five minutes, so it is not part of `npm test`.
import { createServer } from "node:http";
import { OllamaProvider } from "../apps/api/src/providers/ollama";

const HOLD_MS = Number(process.env.HOLD_MS ?? 305_000);
const server = createServer((request, response) => {
  request.resume();
  request.on("end", () => {
    if (request.url === "/api/show") {
      response.end(JSON.stringify({ capabilities: ["completion", "vision"], details: {} }));
      return;
    }
    setTimeout(() => {
      response.end(`${JSON.stringify({ model: "held", done: true, done_reason: "stop", message: { content: "{\"held\":true}" } })}\n`);
    }, HOLD_MS);
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as { port: number };
const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, modelId: "held", numCtx: 1, numPredict: 1, keepAlive: "0", seed: 1 });
const started = performance.now();
const reply = await provider.analyze({ system: "s", userText: "u", image: { mimeType: "image/jpeg", bytes: Buffer.from("x") }, jsonSchema: {},
  signal: AbortSignal.timeout(HOLD_MS + 60_000) }).catch((error: Error) => ({ content: `FAILED: ${error.message}` }));
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`${reply.content} after ${seconds} s`);
server.close();
process.exit(reply.content === "{\"held\":true}" ? 0 : 1);
