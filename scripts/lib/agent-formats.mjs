import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWithin } from "./content.mjs";

const RUNTIMES = ["claude-code", "codex", "pi"];
const REASONING = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);

function access(parsed) {
  const value = parsed.attributes.access;
  if (value === "read-only" || value === "workspace-write") return value;

  const tools = parsed.attributes.tools?.toLowerCase() ?? "";
  if (tools && !/(bash|write|edit)/.test(tools)) return "read-only";
  return undefined;
}

function markdownAgent(parsed, runtime) {
  const lines = [
    "---",
    `name: ${parsed.name}`,
    `description: ${JSON.stringify(parsed.description)}`,
  ];
  if (access(parsed) === "read-only") {
    lines.push(
      runtime === "pi"
        ? "tools: read, grep, find, ls"
        : "tools: Read, Grep, Glob",
    );
  }
  if (runtime === "claude-code" && parsed.attributes.model) {
    lines.push(`model: ${parsed.attributes.model}`);
  }
  lines.push("---", "", parsed.body.trimEnd(), "");
  return lines.join("\n");
}

function codexAgent(parsed) {
  const lines = [
    `name = ${JSON.stringify(parsed.name)}`,
    `description = ${JSON.stringify(parsed.description)}`,
  ];
  const sandbox = access(parsed);
  if (sandbox) lines.push(`sandbox_mode = ${JSON.stringify(sandbox)}`);
  const reasoning = parsed.attributes.reasoning;
  if (reasoning && REASONING.has(reasoning)) {
    lines.push(`model_reasoning_effort = ${JSON.stringify(reasoning)}`);
  }
  lines.push(
    `developer_instructions = ${JSON.stringify(parsed.body.trim())}`,
    "",
  );
  return lines.join("\n");
}

export function renderAgent(parsed, runtime) {
  if (!RUNTIMES.includes(runtime)) {
    throw new Error(`unsupported agent runtime: ${runtime}`);
  }
  return runtime === "codex"
    ? codexAgent(parsed)
    : markdownAgent(parsed, runtime);
}

export async function generateAgents({ root, agents }) {
  const generatedRoot = assertWithin(
    root,
    path.join(root, ".generated", "agents"),
    "generated agents",
  );
  await rm(generatedRoot, { recursive: true, force: true });

  const outputs = new Map(RUNTIMES.map((runtime) => [runtime, []]));
  for (const runtime of RUNTIMES) {
    const runtimeRoot = path.join(generatedRoot, runtime);
    await mkdir(runtimeRoot, { recursive: true });
    for (const agent of agents) {
      const extension = runtime === "codex" ? ".toml" : ".md";
      const file = path.join(runtimeRoot, `${agent.name}${extension}`);
      await writeFile(file, renderAgent(agent.parsed, runtime));
      outputs.get(runtime).push({ name: agent.name, file });
    }
  }
  return outputs;
}
