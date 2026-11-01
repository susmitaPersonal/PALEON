import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export type Prompt = { version: string; sha256: string; system: string; user: string };

export function loadPrompt(path: string, scriptIds: string[]): Prompt {
  const text = readFileSync(path, "utf8");
  const [system, user] = text.split("\n---USER---\n");
  if (!system || !user) throw new Error(`${path} has no ---USER--- separator`);
  return {
    version: basename(path, ".md"),
    sha256: createHash("sha256").update(text).digest("hex"),
    system: system.trim(),
    user: user.trim().replace("{{SCRIPT_IDS}}", scriptIds.join(", ")),
  };
}
