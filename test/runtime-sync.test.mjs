import assert from "node:assert/strict";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { globalLinks, projectLinks } from "../scripts/lib/link-targets.mjs";
import {
  parseLocalOptions,
  parseProjectOptions,
} from "../scripts/lib/sync-options.mjs";
import { syncLocal } from "../scripts/sync-local.mjs";
import { syncProject } from "../scripts/sync-project.mjs";
import { fixture, writeAgent, writeSkill } from "./helpers.mjs";

const mappedSkill = { name: "show-me", directory: "/catalog/show-me" };
const mappedAgents = new Map([
  ["claude-code", [{ name: "reviewer", file: "/generated/reviewer.md" }]],
  ["codex", [{ name: "reviewer", file: "/generated/reviewer.toml" }]],
  ["pi", [{ name: "reviewer", file: "/generated/pi-reviewer.md" }]],
]);

test("globalLinks maps every supported user runtime", () => {
  const links = globalLinks({
    targetRoot: "/home/user",
    skills: [mappedSkill],
    generated: mappedAgents,
  });
  assert.deepEqual(
    links.map(({ path: linkPath }) => linkPath),
    [
      "/home/user/.claude/skills/show-me",
      "/home/user/.codex/skills/show-me",
      "/home/user/.agents/skills/show-me",
      "/home/user/.claude/agents/reviewer.md",
      "/home/user/.codex/agents/reviewer.toml",
      "/home/user/.pi/agent/agents/reviewer.md",
    ],
  );
});

test("projectLinks omits global Codex skills and Pi agents", () => {
  const links = projectLinks({
    targetRoot: "/workspace/project",
    skills: [mappedSkill],
    generated: mappedAgents,
  });
  assert.deepEqual(
    links.map(({ path: linkPath }) => linkPath),
    [
      "/workspace/project/.claude/skills/show-me",
      "/workspace/project/.agents/skills/show-me",
      "/workspace/project/.claude/agents/reviewer.md",
      "/workspace/project/.codex/agents/reviewer.toml",
    ],
  );
});

test("sync option parsers accept their supported flags", () => {
  assert.deepEqual(parseLocalOptions(["--profile", "rust"]), {
    profile: "rust",
  });
  assert.deepEqual(
    parseProjectOptions([
      "--profile",
      "rust",
      "--target",
      "./project",
    ]),
    { profile: "rust", target: "./project" },
  );
});

test("sync option parsers reject missing, duplicate, and unknown flags", () => {
  assert.throws(() => parseLocalOptions(["--profile"]), /argument missing/);
  assert.throws(
    () => parseLocalOptions(["--profile", "one", "--profile", "two"]),
    /--profile can only be set once/,
  );
  assert.throws(
    () => parseLocalOptions(["--unknown", "value"]),
    /Unknown option '--unknown'/,
  );
  assert.throws(
    () => parseProjectOptions(["--profile", "rust"]),
    /--target is required/,
  );
  assert.throws(
    () => parseProjectOptions(["--target", "./project"]),
    /--profile is required/,
  );
  assert.throws(
    () => parseLocalOptions(["--target", "./project"]),
    /--target is only supported by sync:project/,
  );
});

test("syncProject installs selected project skills and translated agents", async () => {
  const root = await fixture();
  const project = await fixture("skills-project-");
  await writeSkill(path.join(root, "skills", "show-me"), "show-me");
  await writeAgent(path.join(root, "agents", "reviewer.md"), "reviewer");
  await mkdir(path.join(root, "profiles"), { recursive: true });
  await writeFile(
    path.join(root, "profiles", "review.json"),
    JSON.stringify({
      skills: { include: ["show-me"] },
      agents: { include: ["reviewer"] },
    }),
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({ skills: [], agents: [] }),
  );

  await syncProject(root, project, "review");

  assert.equal(
    (
      await lstat(path.join(project, ".agents", "skills", "show-me"))
    ).isSymbolicLink(),
    true,
  );
  assert.equal(
    (
      await lstat(path.join(project, ".claude", "skills", "show-me"))
    ).isSymbolicLink(),
    true,
  );
  assert.match(
    await readFile(
      path.join(project, ".codex", "agents", "reviewer.toml"),
      "utf8",
    ),
    /developer_instructions/,
  );
  await assert.rejects(
    lstat(path.join(project, ".pi", "agent", "agents", "reviewer.md")),
    /ENOENT/,
  );
});

test("a project profile does not invalidate global agents from another profile", async () => {
  const root = await fixture();
  const home = await fixture("skills-home-");
  const project = await fixture("skills-project-");
  await writeAgent(path.join(root, "agents", "reviewer.md"), "reviewer");
  await writeAgent(path.join(root, "agents", "researcher.md"), "researcher");
  await mkdir(path.join(root, "profiles"), { recursive: true });
  await writeFile(
    path.join(root, "profiles", "review.json"),
    JSON.stringify({ agents: { include: ["reviewer"] } }),
  );
  await writeFile(
    path.join(root, "profiles", "research.json"),
    JSON.stringify({ agents: { include: ["researcher"] } }),
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({ skills: [], agents: [] }),
  );

  await syncLocal(root, home, "review");
  await syncProject(root, project, "research");

  assert.match(
    await readFile(
      path.join(home, ".codex", "agents", "reviewer.toml"),
      "utf8",
    ),
    /name = "reviewer"/,
  );
});
