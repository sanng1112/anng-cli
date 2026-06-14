import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* global console, process */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "dist");
const bundledSkillsSrc = join(root, "templates", "skills", "bundled");
const bundledSkillsDest = join(distDir, "bundled");

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

if (!existsSync(bundledSkillsSrc)) {
  console.warn(`Bundled skills directory not found at ${bundledSkillsSrc}`);
  process.exit(0);
}

rmSync(bundledSkillsDest, { recursive: true, force: true });
cpSync(bundledSkillsSrc, bundledSkillsDest, {
  recursive: true,
  dereference: true,
});
console.log("Copied bundled built-in skills to dist/bundled/");
