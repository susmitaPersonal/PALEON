import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCollection, loadCollection } from "./services/references";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../knowledge");
const collection = loadCollection(directory);
const problems = checkCollection(collection);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Reference collection valid: ${collection.scripts.length} scripts, ${collection.sources.length} sources.`);
