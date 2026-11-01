import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkResearchKnowledge, loadInventories, loadLanguages } from "./research/knowledge";
import { checkCollection, loadCollection } from "./services/references";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../knowledge");
const collection = loadCollection(directory);
const inventories = loadInventories(directory);
const languages = loadLanguages(directory);
const problems = [...checkCollection(collection), ...checkResearchKnowledge(inventories, languages, collection.scripts.map((script) => script.id), collection.sources.map((source) => source.id))];
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Reference collection valid: ${collection.scripts.length} scripts, ${collection.sources.length} sources, ${inventories.length} sign inventories, ${languages.length} language packs.`);
