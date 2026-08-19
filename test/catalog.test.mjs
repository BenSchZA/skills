import assert from "node:assert/strict";
import { symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  discoverAgents,
  discoverSkills,
} from "../scripts/lib/catalog.mjs";
import { fixture, writeAgent, writeSkill } from "./helpers.mjs";

test("grouped discovery returns unique skills and agents", async () => {
  const root = await fixture();
  await writeSkill(
    path.join(root, "skills", "owner", "bookmark"),
    "bookmark",
    "Save a link.",
  );
  await writeAgent(
    path.join(root, "agents", "owner", "reviewer.md"),
    "reviewer",
    "Review code.",
  );

  assert.deepEqual(
    (await discoverSkills(path.join(root, "skills"))).map(({ name }) => name),
    ["bookmark"],
  );
  assert.deepEqual(
    (await discoverAgents(path.join(root, "agents"))).map(({ name }) => name),
    ["reviewer"],
  );
});

test("skill discovery rejects symbolic links", async () => {
  const root = await fixture();
  const linked = path.join(root, "skills", "owner", "linked");
  await writeSkill(linked, "linked", "Linked skill.");
  await writeFile(path.join(root, "outside.md"), "secret");
  await symlink(
    path.join(root, "outside.md"),
    path.join(linked, "outside.md"),
  );

  await assert.rejects(
    discoverSkills(path.join(root, "skills")),
    /symbolic link/,
  );
});
