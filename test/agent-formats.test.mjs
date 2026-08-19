import assert from "node:assert/strict";
import test from "node:test";

import { parseFrontmatter } from "../scripts/lib/content.mjs";
import { renderAgent } from "../scripts/lib/agent-formats.mjs";

const source = `---
name: reviewer
description: Review code.
access: read-only
reasoning: high
---

Inspect code.
Do not edit files.
`;
const parsed = {
  ...parseFrontmatter(source, "reviewer.md"),
  name: "reviewer",
  description: "Review code.",
};

test("renders Claude Code agent Markdown", () => {
  const output = renderAgent(parsed, "claude-code");

  assert.match(output, /name: reviewer/);
  assert.match(output, /tools: Read, Grep, Glob/);
  assert.match(output, /Inspect code/);
});

test("renders Codex agent TOML", () => {
  const output = renderAgent(parsed, "codex");

  assert.match(output, /name = "reviewer"/);
  assert.match(output, /sandbox_mode = "read-only"/);
  assert.match(output, /model_reasoning_effort = "high"/);
  assert.match(output, /developer_instructions = "Inspect code/);
});

test("renders Pi agent Markdown", () => {
  const output = renderAgent(parsed, "pi");

  assert.match(output, /tools: read, grep, find, ls/);
  assert.doesNotMatch(output, /reasoning:/);
});
