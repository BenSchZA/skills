import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { replaceManagedGroups } from "../scripts/lib/managed-catalog.mjs";
import { fixture, writeSkill } from "./helpers.mjs";

test("replaceManagedGroups preserves unmarked groups", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "skills", "benschza", "bookmark"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "skills", "benschza", "bookmark", "SKILL.md"),
    "custom",
  );
  const source = path.join(root, "source", "brainstorming");
  await writeSkill(source, "brainstorming", "Design first.");

  await replaceManagedGroups({
    root,
    kind: "skill",
    groups: new Map([["obra", [source]]]),
  });

  assert.equal(
    await readFile(
      path.join(root, "skills", "benschza", "bookmark", "SKILL.md"),
      "utf8",
    ),
    "custom",
  );
  assert.match(
    await readFile(
      path.join(root, "skills", "obra", "brainstorming", "SKILL.md"),
      "utf8",
    ),
    /name: brainstorming/,
  );
});
