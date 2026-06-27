// scripts/run-benchmarks.mjs
import fs from "node:fs";
import process from "node:process";

const scenarios = ["benchmarks/scenarios/headless-contract.json", "benchmarks/scenarios/repo-automation.json"];

for (const file of scenarios) {
  const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(`scenario=${scenario.name}\n`);
}
