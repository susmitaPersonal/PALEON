import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export type LocalReply = { status: number; lines: AsyncIterable<string> };
export type LocalTransport = (url: string, body: unknown, signal: AbortSignal) => Promise<LocalReply>;

/**
 * Posts JSON to a local server and yields the reply line by line.
 * Uses node:http because `fetch` gives up after 300 s without headers, and local vision models can take longer.
 * The caller's signal is the only time limit, and aborting it closes the socket, which stops the model.
 * Redirects are never followed, because one could leave this machine.
 */
export const postLocal: LocalTransport = (url, body, signal) => new Promise((resolve, reject) => {
  const target = new URL(url);
  const payload = Buffer.from(JSON.stringify(body));
  const request = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
    method: "POST", signal, headers: { "Content-Type": "application/json", "Content-Length": payload.length },
  }, (response) => {
    resolve({ status: response.statusCode ?? 0, lines: linesOf(response) });
  });
  request.on("error", reject);
  request.end(payload);
});

async function* linesOf(stream: AsyncIterable<Buffer>): AsyncIterable<string> {
  let pending = "";
  for await (const chunk of stream) {
    pending += chunk.toString("utf8");
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    for (const line of parts) if (line.trim()) yield line;
  }
  if (pending.trim()) yield pending;
}
