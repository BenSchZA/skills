import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  linkStateFile,
  syncManagedLinks,
} from "../scripts/lib/managed-links.mjs";
import { syncLocal } from "../scripts/sync-local.mjs";
import { fixture, writeAgent, writeSkill } from "./helpers.mjs";

test("syncManagedLinks creates and refreshes owned links", async () => {
  const root = await fixture("skills-links-root-");
  const home = await fixture("skills-links-home-");
  const target = path.join(root, "skills", "bookmark");
  const link = path.join(home, ".claude", "skills", "bookmark");
  const stateFile = linkStateFile(root, "global", home);
  await mkdir(target, { recursive: true });

  await syncManagedLinks({
    stateFile,
    scope: "global",
    targetRoot: home,
    desired: [{ path: link, target, type: "dir" }],
  });

  assert.equal(path.resolve(path.dirname(link), await readlink(link)), target);
  assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), {
    version: 1,
    scope: "global",
    target: home,
    links: [{ path: link, target, type: "dir" }],
  });
});

test("syncManagedLinks refuses unmanaged targets before mutation", async () => {
  const root = await fixture("skills-links-root-");
  const home = await fixture("skills-links-home-");
  const target = path.join(root, "skills", "bookmark");
  const link = path.join(home, ".claude", "skills", "bookmark");
  await mkdir(target, { recursive: true });
  await mkdir(path.dirname(link), { recursive: true });
  await writeFile(link, "unmanaged");

  await assert.rejects(
    syncManagedLinks({
      stateFile: path.join(root, ".generated", "local-links.json"),
      scope: "global",
      targetRoot: home,
      desired: [{ path: link, target, type: "dir" }],
    }),
    /unmanaged target/,
  );
  assert.equal(await readFile(link, "utf8"), "unmanaged");
});

test("syncManagedLinks rejects state outside the installation home", async () => {
  const root = await fixture("skills-links-root-");
  const home = await fixture("skills-links-home-");
  const outside = path.join(root, "outside-link");
  const stateFile = path.join(root, ".generated", "local-links.json");
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(
    stateFile,
    `${JSON.stringify({
      version: 1,
      scope: "global",
      target: home,
      links: [{ path: outside, target: root, type: "dir" }],
    })}\n`,
  );

  await assert.rejects(
    syncManagedLinks({
      stateFile,
      scope: "global",
      targetRoot: home,
      desired: [],
    }),
    /outside target root/,
  );
});

test("syncManagedLinks removes owned links omitted from the desired state", async () => {
  const root = await fixture("skills-links-root-");
  const home = await fixture("skills-links-home-");
  const target = path.join(root, "skills", "show-me");
  const link = path.join(home, ".agents", "skills", "show-me");
  await mkdir(target, { recursive: true });
  const stateFile = linkStateFile(root, "global", home);

  await syncManagedLinks({
    stateFile,
    scope: "global",
    targetRoot: home,
    desired: [{ path: link, target, type: "dir" }],
  });
  await syncManagedLinks({
    stateFile,
    scope: "global",
    targetRoot: home,
    desired: [],
  });

  await assert.rejects(lstat(link), /ENOENT/);
});

test("syncManagedLinks rejects state for another scope or target", async () => {
  const root = await fixture("skills-links-root-");
  const home = await fixture("skills-links-home-");
  const stateFile = linkStateFile(root, "global", home);
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(
    stateFile,
    JSON.stringify({
      version: 1,
      scope: "project",
      target: home,
      links: [],
    }),
  );

  await assert.rejects(
    syncManagedLinks({
      stateFile,
      scope: "global",
      targetRoot: home,
      desired: [],
    }),
    /link state scope or target does not match/,
  );
});

test("syncManagedLinks migrates a legacy link array after success", async () => {
  const root = await fixture("skills-links-root-");
  const home = await fixture("skills-links-home-");
  const target = path.join(root, "skills", "show-me");
  const link = path.join(home, ".agents", "skills", "show-me");
  const legacyStateFile = path.join(
    root,
    ".generated",
    "local-links",
    "legacy.json",
  );
  const stateFile = linkStateFile(root, "global", home);
  await mkdir(target, { recursive: true });
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(target, link, "dir");
  await mkdir(path.dirname(legacyStateFile), { recursive: true });
  await writeFile(
    legacyStateFile,
    `${JSON.stringify([{ path: link, target, type: "dir" }])}\n`,
  );

  await syncManagedLinks({
    stateFile,
    legacyStateFile,
    scope: "global",
    targetRoot: home,
    desired: [{ path: link, target, type: "dir" }],
  });

  await assert.rejects(readFile(legacyStateFile), /ENOENT/);
  assert.equal(JSON.parse(await readFile(stateFile, "utf8")).version, 1);
});

test("syncLocal links public and private skills and agents", async () => {
  const root = await fixture("skills-local-root-");
  const home = await fixture("skills-local-home-");
  const secondHome = await fixture("skills-local-home-");
  await writeSkill(
    path.join(root, "skills", "public-skill"),
    "public-skill",
    "Public skill.",
  );
  await writeSkill(
    path.join(root, ".private", "skills", "private-skill"),
    "private-skill",
    "Private skill.",
  );
  await writeAgent(
    path.join(root, "agents", "public-agent.md"),
    "public-agent",
    "Public agent.",
  );
  await writeAgent(
    path.join(root, ".private", "agents", "personal", "private-agent.md"),
    "private-agent",
    "Private agent.",
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({ skills: [], agents: [] }),
  );

  await syncLocal(root, home);

  assert.equal(
    (await lstat(path.join(home, ".claude", "skills", "public-skill"))).isSymbolicLink(),
    true,
  );
  assert.equal(
    (await lstat(path.join(home, ".claude", "skills", "private-skill"))).isSymbolicLink(),
    true,
  );
  assert.match(
    await readFile(
      path.join(root, ".generated", "agents", "codex", "private-agent.toml"),
      "utf8",
    ),
    /developer_instructions/,
  );
  await assert.rejects(
    readFile(
      path.join(root, "skills", "personal", "private-skill", "SKILL.md"),
    ),
    /ENOENT/,
  );

  await syncLocal(root, secondHome);
  assert.equal(
    (await lstat(path.join(secondHome, ".agents", "skills", "private-skill"))).isSymbolicLink(),
    true,
  );
  assert.equal(
    (await lstat(path.join(home, ".agents", "skills", "private-skill"))).isSymbolicLink(),
    true,
  );
});

test("syncLocal filters definitions and removes links after a profile switch", async () => {
  const root = await fixture("skills-local-root-");
  const home = await fixture("skills-local-home-");
  await writeSkill(path.join(root, "skills", "one"), "one");
  await writeSkill(path.join(root, "skills", "two"), "two");
  await mkdir(path.join(root, "profiles"), { recursive: true });
  await writeFile(
    path.join(root, "profiles", "one.json"),
    JSON.stringify({ skills: { include: ["one"] } }),
  );
  await writeFile(
    path.join(root, "profiles", "two.json"),
    JSON.stringify({ skills: { include: ["two"] } }),
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({ skills: [], agents: [] }),
  );

  await syncLocal(root, home, "one");
  assert.equal(
    (await lstat(path.join(home, ".agents", "skills", "one"))).isSymbolicLink(),
    true,
  );
  await assert.rejects(
    lstat(path.join(home, ".agents", "skills", "two")),
    /ENOENT/,
  );

  await syncLocal(root, home, "two");
  await assert.rejects(
    lstat(path.join(home, ".agents", "skills", "one")),
    /ENOENT/,
  );
  assert.equal(
    (await lstat(path.join(home, ".agents", "skills", "two"))).isSymbolicLink(),
    true,
  );
});
