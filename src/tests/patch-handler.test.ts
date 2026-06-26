import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../harness/patch-handler";

const FILE = "src/math.ts";
const ALLOWED = [FILE];

describe("Patch Handler — Boundary & Occurrence Checks", () => {
  it("should apply patch successfully when matched exactly once", () => {
    const original = "const x = 1;\nconst y = 2;\n";
    const patch = { targetFile: FILE, targetContent: "const y = 2;", replacementContent: "const y = 3;" };
    const result = applyPatch(original, patch, ALLOWED, FILE);
    assert.equal(result, "const x = 1;\nconst y = 3;\n");
  });

  it("should throw if patch.targetFile !== filePath", () => {
    const patch = { targetFile: "src/other.ts", targetContent: "x", replacementContent: "y" };
    assert.throws(() => applyPatch("x", patch, ALLOWED, FILE), /Target file mismatch/);
  });

  it("should throw if targetFile is not in allowedWrites", () => {
    const patch = { targetFile: FILE, targetContent: "x", replacementContent: "y" };
    assert.throws(() => applyPatch("x", patch, ["src/other.ts"], FILE), /Permission denied/);
  });

  it("should throw if targetContent is not found", () => {
    const patch = { targetFile: FILE, targetContent: "const z = 99;", replacementContent: "const z = 100;" };
    assert.throws(() => applyPatch("const x = 1;\n", patch, ALLOWED, FILE), /Target content not found/);
  });

  it("should throw if targetContent appears more than once", () => {
    const original = "const x = 1;\nconst x = 1;\n";
    const patch = { targetFile: FILE, targetContent: "const x = 1;", replacementContent: "const x = 2;" };
    assert.throws(() => applyPatch(original, patch, ALLOWED, FILE), /matched multiple times/);
  });

  it("should correctly patch multi-line content", () => {
    const original = "function foo() {\n  return 1;\n}\n";
    const patch = {
      targetFile: FILE,
      targetContent: "  return 1;",
      replacementContent: "  return 42;",
    };
    const result = applyPatch(original, patch, ALLOWED, FILE);
    assert.equal(result, "function foo() {\n  return 42;\n}\n");
  });
});
