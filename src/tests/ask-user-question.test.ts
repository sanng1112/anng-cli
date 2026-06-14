import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findPendingAskUserQuestion, formatAskUserQuestionAnswers, formatAskUserQuestionDecline } from "../ui";
import type { SessionMessage } from "../session";
import { handleAskUserQuestionTool } from "../tools/ask-user-question-handler";
import type { ToolExecutionContext } from "../tools/executor";

function message(content: unknown): SessionMessage {
  const now = "2026-04-29T00:00:00.000Z";
  return {
    id: "tool-message",
    sessionId: "session-id",
    role: "tool",
    content: JSON.stringify(content),
    contentParams: null,
    messageParams: { tool_call_id: "call-id" },
    compacted: false,
    visible: true,
    createTime: now,
    updateTime: now,
  };
}

test("findPendingAskUserQuestion returns latest pending AskUserQuestion tool message", () => {
  const pending = findPendingAskUserQuestion(
    [
      message({ ok: true, name: "read" }),
      message({
        ok: true,
        name: "AskUserQuestion",
        awaitUserResponse: true,
        metadata: {
          kind: "ask_user_question",
          questions: [
            {
              question: "Which package manager should we use?",
              options: [{ label: "npm", description: "Use package-lock.json." }, { label: "yarn" }],
            },
          ],
        },
      }),
    ],
    "waiting_for_user"
  );

  assert.equal(pending?.messageId, "tool-message");
  assert.equal(pending?.questions[0]?.question, "Which package manager should we use?");
  assert.equal(pending?.questions[0]?.options[0]?.description, "Use package-lock.json.");
});

test("findPendingAskUserQuestion preserves multiple pending questions in order", () => {
  const pending = findPendingAskUserQuestion(
    [
      message({
        ok: true,
        name: "AskUserQuestion",
        awaitUserResponse: true,
        metadata: {
          kind: "ask_user_question",
          questions: [
            {
              question: "Use default description?",
              options: [{ label: "Yes" }, { label: "Custom" }],
            },
            {
              question: "Where should the project be created?",
              options: [{ label: "Current directory" }, { label: "Custom path" }],
            },
          ],
        },
      }),
    ],
    "waiting_for_user"
  );

  assert.deepEqual(
    pending?.questions.map((question) => question.question),
    ["Use default description?", "Where should the project be created?"]
  );
});

test("findPendingAskUserQuestion ignores questions unless session waits for user", () => {
  const pending = findPendingAskUserQuestion(
    [
      message({
        ok: true,
        name: "AskUserQuestion",
        awaitUserResponse: true,
        metadata: {
          kind: "ask_user_question",
          questions: [{ question: "Continue?", options: [{ label: "Yes" }] }],
        },
      }),
    ],
    "processing"
  );

  assert.equal(pending, null);
});

test("formatAskUserQuestionAnswers creates model-readable answer text", () => {
  assert.equal(
    formatAskUserQuestionAnswers({
      "Which package manager?": "yarn",
      "Any notes?": "Use the existing lockfile",
    }),
    'User has answered your questions: "Which package manager?"="yarn", "Any notes?"="Use the existing lockfile". You can now continue with the user\'s answers in mind.'
  );
});

test("formatAskUserQuestionDecline creates decline text", () => {
  assert.match(formatAskUserQuestionDecline(), /declined to answer/);
});

const noopContext: ToolExecutionContext = {
  sessionId: "test-ask",
  projectRoot: "/tmp",
  toolCall: {
    id: "call-1",
    type: "function",
    function: { name: "AskUserQuestion", arguments: JSON.stringify({}) },
  },
};

describe("handleAskUserQuestionTool", () => {
  test("returns error when questions is not an array", async () => {
    const result = await handleAskUserQuestionTool({ questions: "invalid" }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be a non-empty array"));
  });

  test("returns error when questions is empty array", async () => {
    const result = await handleAskUserQuestionTool({ questions: [] }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be a non-empty array"));
  });

  test("returns error when question is missing", async () => {
    const result = await handleAskUserQuestionTool({ questions: [{ options: [{ label: "Yes" }] }] }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("missing"));
  });

  test("returns error when options is missing", async () => {
    const result = await handleAskUserQuestionTool({ questions: [{ question: "What?" }] }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("options"));
  });

  test("returns ok with awaitUserResponse for valid single question", async () => {
    const result = await handleAskUserQuestionTool(
      { questions: [{ question: "Pick one", options: [{ label: "A" }, { label: "B" }] }] },
      noopContext
    );
    assert.equal(result.ok, true);
    assert.equal(result.name, "AskUserQuestion");
    assert.equal(result.awaitUserResponse, true);
    assert.ok(result.output?.includes("Waiting for user input"));
  });

  test("handles multiSelect flag", async () => {
    const result = await handleAskUserQuestionTool(
      {
        questions: [
          { question: "Pick many", multiSelect: true, options: [{ label: "A", description: "Option A desc" }] },
        ],
      },
      noopContext
    );
    assert.equal(result.ok, true);
    assert.ok(result.output?.includes("multi-select"));
  });

  test("includes option descriptions in output", async () => {
    const result = await handleAskUserQuestionTool(
      { questions: [{ question: "Q1", options: [{ label: "A", description: "desc A" }, { label: "B" }] }] },
      noopContext
    );
    assert.equal(result.ok, true);
    assert.ok(result.output?.includes("desc A"));
  });

  test("returns error for non-object question item", async () => {
    const result = await handleAskUserQuestionTool({ questions: ["not an object"] }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be an object"));
  });

  test("returns error for non-object option item", async () => {
    const result = await handleAskUserQuestionTool(
      { questions: [{ question: "Q", options: ["not an object"] }] },
      noopContext
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be an object"));
  });

  test("handles multiple questions", async () => {
    const result = await handleAskUserQuestionTool(
      {
        questions: [
          { question: "Q1", options: [{ label: "A1" }] },
          { question: "Q2", options: [{ label: "A2" }] },
        ],
      },
      noopContext
    );
    assert.equal(result.ok, true);
    assert.ok(result.output?.includes("1. Q1"));
    assert.ok(result.output?.includes("2. Q2"));
  });
});
