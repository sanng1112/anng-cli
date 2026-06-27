// scripts/release-check.mjs
import { execSync } from "node:child_process";

const commands = ["npm run typecheck", "npm run bundle", "npx vitest run src/tests/v2"];

for (const command of commands) {
  execSync(command, { stdio: "inherit" });
}
