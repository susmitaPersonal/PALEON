import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ResearchDatasetRecordSchema } from "@scriptecho/contracts";
import { z } from "zod";
import { checkDataset, evaluate, type Prediction } from "./evaluation";

const REJECTION_LABELS = ["cuneiform", "egyptian_hieroglyphs", "no_writing"];
const PredictionSchema: z.ZodType<Prediction> = z.object({
  recordId: z.string(), scripts: z.array(z.string()), strength: z.enum(["strong", "moderate", "weak"]).nullable().optional(),
  text: z.string().nullable().optional(), latencyMs: z.number().nullable().optional(),
});

// INIT_CWD is where `npm run` was started, so relative paths mean what the person typed.
const read = (path: string) => JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), path), "utf8"));
const [datasetPath, ...predictionPaths] = process.argv.slice(2);
if (!datasetPath) {
  console.error("Usage: npm run eval:research -- <dataset.json> [predictions.json ...]");
  process.exit(2);
}
const records = z.array(ResearchDatasetRecordSchema).parse(read(datasetPath));
const problems = checkDataset(records);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Dataset valid: ${records.length} records, no leakage between splits.`);
for (const path of predictionPaths) {
  console.log(`\n${path}`);
  console.log(JSON.stringify(evaluate(records, z.array(PredictionSchema).parse(read(path)), REJECTION_LABELS), null, 2));
}
