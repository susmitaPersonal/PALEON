// Runs the complete offline test suite. No API key, paid service, or external inference is used.
// End-to-end tests need Chrome. Pass --skip-e2e where it is not installed.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const python = ".venv/bin/python";
const experiment = "experiments/m0_feasibility";
const steps = [
  ["Typecheck", "npm", ["run", "typecheck"]],
  ["Reference collection", "npm", ["run", "validate:knowledge"]],
  ["Unit and integration tests", "npm", ["run", "test:unit"]],
];
if (!process.argv.includes("--skip-e2e")) steps.push(["End-to-end tests", "npm", ["run", "test:e2e"]]);
if (existsSync(python)) {
  steps.push(["Feasibility experiment tests", `${process.cwd()}/${python}`, ["-m", "pytest", "-q"], experiment]);
} else {
  console.log("Skipping experiment tests: no .venv. See experiments/m0_feasibility/README.md.");
}

const results = [];
for (const [name, command, args, cwd] of steps) {
  console.log(`\n=== ${name}`);
  const { status } = spawnSync(command, args, { stdio: "inherit", cwd });
  results.push([name, status === 0]);
  if (status !== 0) break;
}

console.log("\n=== Summary");
for (const [name, passed] of results) console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
const skipped = steps.length - results.length;
if (skipped > 0) console.log(`${skipped} step(s) not run after the failure.`);
process.exit(results.every(([, passed]) => passed) && skipped === 0 ? 0 : 1);
