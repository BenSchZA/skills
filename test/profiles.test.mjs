import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { resolveProfile } from "../scripts/lib/profiles.mjs";
import { fixture } from "./helpers.mjs";

async function writeProfile(root, name, value, { privateProfile = false } = {}) {
  const directory = privateProfile
    ? path.join(root, ".private", "profiles")
    : path.join(root, "profiles");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${name}.json`), JSON.stringify(value));
}

const available = {
  skillNames: new Set(["brainstorming", "rust-review", "show-me"]),
  agentNames: new Set(["reviewer", "researcher"]),
};

test("resolveProfile selects the full catalog when the name is absent", async () => {
  const root = await fixture();
  const selected = await resolveProfile({ root, name: undefined, ...available });

  assert.deepEqual([...selected.skillNames].sort(), [
    "brainstorming",
    "rust-review",
    "show-me",
  ]);
  assert.deepEqual([...selected.agentNames].sort(), ["researcher", "reviewer"]);
});

test("resolveProfile applies one parent before child changes", async () => {
  const root = await fixture();
  await writeProfile(root, "base", {
    skills: { include: ["brainstorming", "show-me"] },
    agents: { include: ["reviewer"] },
  });
  await writeProfile(root, "rust", {
    extends: "base",
    skills: { include: ["rust-review"], exclude: ["show-me"] },
    agents: { exclude: ["reviewer"], include: ["researcher"] },
  });

  const selected = await resolveProfile({ root, name: "rust", ...available });

  assert.deepEqual([...selected.skillNames].sort(), [
    "brainstorming",
    "rust-review",
  ]);
  assert.deepEqual([...selected.agentNames], ["researcher"]);
});

test("a child can include a name excluded by its parent", async () => {
  const root = await fixture();
  await writeProfile(root, "base", {
    skills: { include: ["show-me"], exclude: ["show-me"] },
  });
  await writeProfile(root, "visual", {
    extends: "base",
    skills: { include: ["show-me"] },
  });

  const selected = await resolveProfile({ root, name: "visual", ...available });
  assert.deepEqual([...selected.skillNames], ["show-me"]);
});

test("resolveProfile loads ignored private profiles", async () => {
  const root = await fixture();
  await writeProfile(
    root,
    "client",
    { agents: { include: ["researcher"] } },
    { privateProfile: true },
  );

  const selected = await resolveProfile({ root, name: "client", ...available });
  assert.deepEqual([...selected.agentNames], ["researcher"]);
});

test("resolveProfile rejects missing profiles and parents", async () => {
  const root = await fixture();
  await assert.rejects(
    resolveProfile({ root, name: "missing", ...available }),
    /profile not found: missing/,
  );
  await writeProfile(root, "child", { extends: "missing" });
  await assert.rejects(
    resolveProfile({ root, name: "child", ...available }),
    /profile child extends missing profile missing/,
  );
});

test("resolveProfile rejects inheritance cycles", async () => {
  const root = await fixture();
  await writeProfile(root, "one", { extends: "two" });
  await writeProfile(root, "two", { extends: "one" });

  await assert.rejects(
    resolveProfile({ root, name: "one", ...available }),
    /profile inheritance cycle: one -> two -> one/,
  );
});

test("resolveProfile rejects duplicate public and private profile names", async () => {
  const root = await fixture();
  await writeProfile(root, "work", {});
  await writeProfile(root, "work", {}, { privateProfile: true });

  await assert.rejects(
    resolveProfile({ root, name: "work", ...available }),
    /duplicate profile name work/,
  );
});

test("resolveProfile rejects an unknown included name", async () => {
  const root = await fixture();
  await writeProfile(root, "invalid", {
    skills: { include: ["unknown-skill"] },
  });

  await assert.rejects(
    resolveProfile({ root, name: "invalid", ...available }),
    /profile invalid references unknown skill unknown-skill/,
  );
});

test("resolveProfile rejects an unknown excluded name", async () => {
  const root = await fixture();
  await writeProfile(root, "invalid", {
    agents: { exclude: ["unknown-agent"] },
  });

  await assert.rejects(
    resolveProfile({ root, name: "invalid", ...available }),
    /profile invalid references unknown agent unknown-agent/,
  );
});

test("resolveProfile rejects malformed profile fields", async () => {
  const root = await fixture();
  await writeProfile(root, "invalid", {
    extends: ["base"],
    skills: { include: "show-me" },
  });

  await assert.rejects(
    resolveProfile({ root, name: "invalid", ...available }),
    /profile invalid: extends must be a string/,
  );
});

test("resolveProfile identifies invalid JSON files", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "profiles"), { recursive: true });
  await writeFile(path.join(root, "profiles", "invalid.json"), "{");

  await assert.rejects(
    resolveProfile({ root, name: "invalid", ...available }),
    /invalid profile JSON: .*invalid\.json/,
  );
});
