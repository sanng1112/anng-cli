/**
 * Built-in Goal Definitions
 *
 * Pre-defined goals that ship with ANNG CLI.
 * These are hard-coded YAML/JSON-like definitions in TypeScript.
 */

import type { GoalDef } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// 1. code-review – Run linter, type-checker and then tests
// ─────────────────────────────────────────────────────────────────────────────
const codeReviewGoal: GoalDef = {
  id: "code-review",
  name: "Code Review",
  description: "Run linter, type-check, and test suite to verify code quality",
  version: "1.0.0",
  startStepId: "lint",
  tags: ["quality", "review"],
  steps: [
    {
      id: "lint",
      type: "bash",
      description: "Run ESLint on source files",
      command: "npx eslint src/ --max-warnings=0",
      maxRetries: 1,
      nextOnSuccess: "type-check",
      nextOnFailure: "lint-fix",
    },
    {
      id: "lint-fix",
      type: "bash",
      description: "Attempt to auto-fix lint issues",
      command: "npx eslint src/ --fix --max-warnings=0",
      maxRetries: 1,
      nextOnSuccess: "type-check",
      nextOnFailure: "report-lint-failure",
    },
    {
      id: "report-lint-failure",
      type: "bash",
      description: "Report lint failure summary",
      command: "echo 'Lint check failed. Please fix issues manually and re-run.'",
      nextOnSuccess: "type-check",
    },
    {
      id: "type-check",
      type: "bash",
      description: "Run TypeScript type checker",
      command: "npx tsc --noEmit",
      maxRetries: 1,
      nextOnSuccess: "test",
      nextOnFailure: "test",
    },
    {
      id: "test",
      type: "bash",
      description: "Run test suite",
      command: "npm test",
      maxRetries: 1,
      nextOnSuccess: "review-done",
      nextOnFailure: "review-done",
    },
    {
      id: "review-done",
      type: "bash",
      description: "Print final review summary",
      command: "echo 'Code review completed.'",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. full-test – Run all tests with reporting
// ─────────────────────────────────────────────────────────────────────────────
const fullTestGoal: GoalDef = {
  id: "full-test",
  name: "Full Test Suite",
  description: "Run the complete test suite with coverage reporting",
  version: "1.0.0",
  startStepId: "run-tests",
  tags: ["test", "coverage"],
  steps: [
    {
      id: "run-tests",
      type: "bash",
      description: "Run all tests with coverage",
      command: "npm run test:coverage",
      maxRetries: 1,
      timeoutMs: 300_000,
      nextOnSuccess: "check-coverage",
      nextOnFailure: "report-test-failure",
    },
    {
      id: "report-test-failure",
      type: "bash",
      description: "Report test failures",
      command: "echo 'Tests failed. Review output above for details.'",
      nextOnSuccess: "test-done",
    },
    {
      id: "check-coverage",
      type: "bash",
      description: "Check if coverage output exists",
      command: "ls -la .coverage 2>/dev/null || echo 'No coverage report generated'",
      nextOnSuccess: "test-done",
    },
    {
      id: "test-done",
      type: "bash",
      description: "Print test completion message",
      command: "echo 'Full test suite run completed.'",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. health-check – Verify project compiles, tests pass, key files exist
// ─────────────────────────────────────────────────────────────────────────────
const healthCheckGoal: GoalDef = {
  id: "health-check",
  name: "Project Health Check",
  description: "Verify the project compiles, tests pass, and essential files exist",
  version: "1.0.0",
  startStepId: "compile-check",
  tags: ["health", "verify"],
  steps: [
    {
      id: "compile-check",
      type: "bash",
      description: "Check that the project compiles without errors",
      command: "npx tsc --noEmit",
      maxRetries: 1,
      timeoutMs: 120_000,
      nextOnSuccess: "check-key-files",
      nextOnFailure: "compile-failed",
    },
    {
      id: "compile-failed",
      type: "bash",
      description: "Report compilation failure",
      command: "echo 'Project has TypeScript compilation errors.'",
      nextOnSuccess: "health-done",
    },
    {
      id: "check-key-files",
      type: "parallel",
      description: "Check that key project files exist",
      parallel: [
        {
          id: "check-package-json",
          type: "bash",
          command: "test -f package.json && echo 'package.json ✓' || (echo 'package.json ✗' && exit 1)",
          description: "Check package.json exists",
        },
        {
          id: "check-tsconfig",
          type: "bash",
          command: "test -f tsconfig.json && echo 'tsconfig.json ✓' || (echo 'tsconfig.json ✗' && exit 1)",
          description: "Check tsconfig.json exists",
        },
        {
          id: "check-src-dir",
          type: "bash",
          command: "test -d src && echo 'src/ ✓' || (echo 'src/ ✗' && exit 1)",
          description: "Check src/ directory exists",
        },
      ],
      nextOnSuccess: "run-tests",
      nextOnFailure: "key-files-missing",
    },
    {
      id: "key-files-missing",
      type: "bash",
      description: "Report missing key files",
      command: "echo 'Some essential project files are missing. Check the parallel step output above.'",
      nextOnSuccess: "health-done",
    },
    {
      id: "run-tests",
      type: "bash",
      description: "Run the test suite for a quick health check",
      command: "npm test",
      maxRetries: 1,
      timeoutMs: 180_000,
      nextOnSuccess: "health-done",
      nextOnFailure: "test-failed",
    },
    {
      id: "test-failed",
      type: "bash",
      description: "Report test failure",
      command: "echo 'Tests failed during health check.'",
      nextOnSuccess: "health-done",
    },
    {
      id: "health-done",
      type: "bash",
      description: "Print health check summary",
      command: "echo 'Health check completed.'",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/** Map of built-in goal ID → GoalDef */
export const BUILTIN_GOALS: Record<string, GoalDef> = {
  "code-review": codeReviewGoal,
  "full-test": fullTestGoal,
  "health-check": healthCheckGoal,
};

/** Ordered list of built-in goal IDs for discovery */
export const BUILTIN_GOAL_IDS: string[] = Object.keys(BUILTIN_GOALS);
