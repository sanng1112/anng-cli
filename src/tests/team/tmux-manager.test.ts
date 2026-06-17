import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Escape a command for safe use in a tmux send-keys shell command.
 * Uses single-quote wrapping: the command is wrapped in single quotes,
 * and any single quotes within the command are escaped using the
 * standard shell pattern: `'"'"'` (end-quote, double-quoted quote, resume-quote).
 */
function escapeCommand(command: string): string {
  return `'${command.replace(/'/g, "'\"'\"'")}'`;
}

describe("TmuxManager command escaping", () => {
  it("should wrap the command in single quotes", () => {
    const cmd = 'anng --worker -p "Fix the frontend bug"';
    const escaped = escapeCommand(cmd);
    assert.ok(escaped.startsWith("'"));
    assert.ok(escaped.endsWith("'"));
    assert.equal(escaped, `'anng --worker -p "Fix the frontend bug"'`);
  });

  it("should preserve internal double quotes inside single-quote wrapping", () => {
    const cmd = 'anng --worker -p "Fix the frontend bug"';
    const escaped = escapeCommand(cmd);
    // Double quotes are literal inside single quotes, so they remain unchanged
    assert.ok(escaped.includes('"'));
    assert.ok(escaped.includes("Fix the frontend bug"));
  });

  it("should escape single quotes within the command", () => {
    const cmd = 'anng --worker -p "It\'s a test"';
    const escaped = escapeCommand(cmd);
    // The single quote in "It's" should be escaped with the '"'"' pattern
    assert.ok(escaped.includes("'\"'\"'")); // contains the pattern: '\\''  (end-quote, double-quoted quote, resume-quote)
    // The original "It's" substring is broken up by the escaping; the ' is replaced with '"'"'
    assert.ok(!escaped.includes("It's"));
    // The characters are still present but the ' is replaced by the escape pattern
    assert.ok(escaped.includes("It")); // "It" before the escaped quote
    assert.ok(escaped.includes("s a test")); // "s a test" after the escaped quote
    // The entire string should be a valid single-quoted shell token
    assert.ok(escaped.startsWith("'"));
    assert.ok(escaped.endsWith("'"));
  });

  it("should not require escaping of semicolons inside single quotes", () => {
    const cmd = "echo hello; echo world";
    const escaped = escapeCommand(cmd);
    // Semicolons are literal inside single quotes
    assert.ok(escaped.includes(";"));
    assert.equal(escaped, `'echo hello; echo world'`);
  });

  it("should handle empty command", () => {
    const cmd = "";
    const escaped = escapeCommand(cmd);
    assert.equal(escaped, "''");
  });
});
