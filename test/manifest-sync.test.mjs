import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { syncAgents } from "../scripts/sync-agents.mjs";
import { syncSkills } from "../scripts/sync-skills.mjs";
import { fixture, writeAgent, writeSkill } from "./helpers.mjs";

test("syncSkills dereferences bounded compatibility links", async () => {
  const root = await fixture();
  const source = path.join(root, "upstream", "linked-skill");
  await mkdir(path.join(source, "compat"), { recursive: true });
  await writeSkill(source, "linked-skill", "Linked skill.");
  await symlink("../SKILL.md", path.join(source, "compat", "SKILL.md"));
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [
        {
          source: "upstream/linked-skill",
          group: "linked",
          include: ["."],
        },
      ],
      agents: [],
    }),
  );

  await syncSkills(root);

  const copied = path.join(
    root,
    "skills",
    "linked",
    "linked-skill",
    "compat",
    "SKILL.md",
  );
  assert.equal((await lstat(copied)).isSymbolicLink(), false);
  assert.match(await readFile(copied, "utf8"), /name: linked-skill/);
});

test("syncSkills materializes selected grouped skills only", async () => {
  const root = await fixture();
  await writeSkill(path.join(root, "upstream", "skills", "chosen"), "chosen");
  await writeSkill(
    path.join(root, "upstream", "skills", "excluded"),
    "excluded",
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [
        {
          source: "upstream/skills",
          group: "owner",
          include: ["chosen"],
        },
      ],
      agents: [],
    }),
  );

  await syncSkills(root);

  assert.match(
    await readFile(
      path.join(root, "skills", "owner", "chosen", "SKILL.md"),
      "utf8",
    ),
    /name: chosen/,
  );
  await assert.rejects(
    readFile(
      path.join(root, "skills", "owner", "excluded", "SKILL.md"),
    ),
    /ENOENT/,
  );
});

test("syncSkills includes all nested skills by default and applies exclusions", async () => {
  const root = await fixture();
  for (const relative of ["engineering/chosen", "in-progress/excluded"]) {
    const directory = path.join(root, "upstream", "skills", relative);
    await writeSkill(directory, path.basename(relative), "Test skill.");
  }
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [
        {
          source: "upstream/skills",
          group: "catalog",
          exclude: ["in-progress/excluded"],
        },
      ],
      agents: [],
    }),
  );

  await syncSkills(root);

  assert.match(
    await readFile(
      path.join(root, "skills", "catalog", "chosen", "SKILL.md"),
      "utf8",
    ),
    /name: chosen/,
  );
  await assert.rejects(
    readFile(
      path.join(root, "skills", "catalog", "excluded", "SKILL.md"),
    ),
    /ENOENT/,
  );
});

test("syncSkills rejects empty and wildcard include lists", async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [{ source: "upstream/skills", include: [] }],
      agents: [],
    }),
  );

  await assert.rejects(syncSkills(root), /include must not be empty/);

  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [{ source: "upstream/skills", include: ["*"] }],
      agents: [],
    }),
  );
  await assert.rejects(syncSkills(root), /include does not support wildcards/);
});

test("syncSkills materializes an ungrouped skill at the catalog root", async () => {
  const root = await fixture();
  const source = path.join(root, "upstream", "skills", "show-me");
  await writeSkill(source, "show-me", "Show the result.");
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [{ source: "upstream/skills", include: ["show-me"] }],
      agents: [],
    }),
  );

  await syncSkills(root);

  assert.match(
    await readFile(path.join(root, "skills", "show-me", "SKILL.md"), "utf8"),
    /name: show-me/,
  );
});

test("syncSkills merges definitions that target the same group", async () => {
  const root = await fixture();
  for (const name of ["first", "second"]) {
    await writeSkill(path.join(root, "upstream", name), name);
  }
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [
        { source: "upstream/first", group: "shared", include: ["."] },
        { source: "upstream/second", group: "shared", include: ["."] },
      ],
      agents: [],
    }),
  );

  await syncSkills(root);

  for (const name of ["first", "second"]) {
    assert.match(
      await readFile(
        path.join(root, "skills", "shared", name, "SKILL.md"),
        "utf8",
      ),
      new RegExp(`name: ${name}`),
    );
  }
});

test("syncSkills removes a disabled selection and preserves its group", async () => {
  const root = await fixture();
  for (const name of ["first", "second"]) {
    await writeSkill(path.join(root, "upstream", name), name);
  }
  const manifestFile = path.join(root, "manifest.json");
  const definitions = [
    { source: "upstream/first", group: "shared", include: ["."] },
    { source: "upstream/second", group: "shared", include: ["."] },
  ];
  await writeFile(
    manifestFile,
    JSON.stringify({ skills: definitions, agents: [] }),
  );

  await syncSkills(root);
  await rm(path.join(root, "upstream", "second"), { recursive: true });
  definitions[1].enabled = false;
  await writeFile(
    manifestFile,
    JSON.stringify({ skills: definitions, agents: [] }),
  );
  await syncSkills(root);

  assert.match(
    await readFile(
      path.join(root, "skills", "shared", "first", "SKILL.md"),
      "utf8",
    ),
    /name: first/,
  );
  await assert.rejects(
    readFile(path.join(root, "skills", "shared", "second", "SKILL.md")),
    /ENOENT/,
  );
});

test("syncSkills removes stale managed root skills and preserves custom root skills", async () => {
  const root = await fixture();
  const source = path.join(root, "upstream", "retired");
  await writeSkill(source, "retired", "Retired skill.");
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [{ source: "upstream/retired", include: ["."] }],
      agents: [],
    }),
  );
  await syncSkills(root);
  assert.match(
    await readFile(path.join(root, "skills", "retired", "SKILL.md"), "utf8"),
    /name: retired/,
  );

  const custom = path.join(root, "skills", "custom");
  await writeSkill(custom, "custom", "Custom skill.");
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({ skills: [], agents: [] }),
  );
  await syncSkills(root);

  await assert.rejects(
    readFile(path.join(root, "skills", "retired", "SKILL.md")),
    /ENOENT/,
  );
  assert.match(await readFile(path.join(custom, "SKILL.md"), "utf8"), /custom/);
});

test("syncSkills rejects a root skill that collides with a group", async () => {
  const root = await fixture();
  for (const name of ["shared", "nested"]) {
    await writeSkill(path.join(root, "upstream", name), name);
  }
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [
        { source: "upstream/shared", include: ["."] },
        { source: "upstream/nested", group: "shared", include: ["."] },
      ],
      agents: [],
    }),
  );

  await assert.rejects(syncSkills(root), /root skill shared collides with group shared/);
});

test("syncAgents materializes grouped and ungrouped array definitions", async () => {
  const root = await fixture();
  await writeAgent(
    path.join(root, "upstream", "agents", "root.md"),
    "root-agent",
    "Root agent.",
  );
  await writeAgent(
    path.join(root, "upstream", "agents", "grouped.md"),
    "grouped-agent",
    "Grouped agent.",
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [],
      agents: [
        { source: "upstream/agents", include: ["root.md"] },
        {
          source: "upstream/agents",
          group: "reviewers",
          include: ["grouped.md"],
        },
      ],
    }),
  );

  await syncAgents(root);

  assert.match(
    await readFile(path.join(root, "agents", "root-agent.md"), "utf8"),
    /name: root-agent/,
  );
  assert.match(
    await readFile(
      path.join(root, "agents", "reviewers", "grouped-agent.md"),
      "utf8",
    ),
    /name: grouped-agent/,
  );
});

test("syncAgents includes all nested agents by default and applies exclusions", async () => {
  const root = await fixture();
  for (const relative of [
    "reviewer.md",
    "nested/researcher.md",
    "nested/excluded.md",
  ]) {
    const file = path.join(root, "upstream", "agents", relative);
    const name = path.basename(relative, ".md");
    await writeAgent(file, name);
  }
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      skills: [],
      agents: [
        {
          source: "upstream/agents",
          group: "reviewers",
          exclude: ["nested/excluded.md"],
        },
      ],
    }),
  );

  await syncAgents(root);

  for (const name of ["reviewer", "researcher"]) {
    assert.match(
      await readFile(
        path.join(root, "agents", "reviewers", `${name}.md`),
        "utf8",
      ),
      new RegExp(`name: ${name}`),
    );
  }
  await assert.rejects(
    readFile(path.join(root, "agents", "reviewers", "excluded.md")),
    /ENOENT/,
  );
});

test("syncAgents removes a disabled selection and preserves its group", async () => {
  const root = await fixture();
  const sourceRoot = path.join(root, "upstream", "agents");
  for (const name of ["first", "second"]) {
    await writeAgent(path.join(sourceRoot, `${name}.md`), name);
  }
  const manifestFile = path.join(root, "manifest.json");
  const definitions = [
    {
      source: "upstream/agents",
      group: "shared",
      include: ["first.md"],
    },
    {
      source: "upstream/agents",
      group: "shared",
      include: ["second.md"],
    },
  ];
  await writeFile(
    manifestFile,
    JSON.stringify({ skills: [], agents: definitions }),
  );

  await syncAgents(root);
  await rm(path.join(sourceRoot, "second.md"));
  definitions[1].enabled = false;
  await writeFile(
    manifestFile,
    JSON.stringify({ skills: [], agents: definitions }),
  );
  await syncAgents(root);

  assert.match(
    await readFile(path.join(root, "agents", "shared", "first.md"), "utf8"),
    /name: first/,
  );
  await assert.rejects(
    readFile(path.join(root, "agents", "shared", "second.md")),
    /ENOENT/,
  );
});

test("sync commands reject non-boolean enabled values", async () => {
  const root = await fixture();
  const manifestFile = path.join(root, "manifest.json");
  await writeFile(
    manifestFile,
    JSON.stringify({
      skills: [{ source: "upstream/skills", enabled: "false" }],
      agents: [],
    }),
  );
  await assert.rejects(syncSkills(root), /enabled must be a boolean/);

  await writeFile(
    manifestFile,
    JSON.stringify({
      skills: [],
      agents: [{ source: "upstream/agents", enabled: 0 }],
    }),
  );
  await assert.rejects(syncAgents(root), /enabled must be a boolean/);
});

test("syncSkills rejects the legacy object manifest schema", async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({ skills: {}, agents: [] }),
  );

  await assert.rejects(syncSkills(root), /manifest skills must be an array/);
});
