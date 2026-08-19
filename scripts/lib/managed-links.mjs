import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { pathExists } from "./content.mjs";

export function linkStateFile(root, scope, targetRoot) {
  if (scope !== "global" && scope !== "project") {
    throw new Error(`invalid link scope: ${scope}`);
  }
  const id = createHash("sha256")
    .update(scope)
    .update("\0")
    .update(path.resolve(targetRoot))
    .digest("hex")
    .slice(0, 16);
  return path.join(root, ".generated", "links", `${id}.json`);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new Error(`invalid link state: ${file}`, { cause: error });
  }
}

async function readState({ stateFile, legacyStateFile, scope, targetRoot }) {
  const current = await readJson(stateFile);
  if (current !== undefined) {
    if (
      !current ||
      current.version !== 1 ||
      current.scope !== scope ||
      current.target !== targetRoot ||
      !Array.isArray(current.links)
    ) {
      throw new Error(
        `link state scope or target does not match: ${stateFile}`,
      );
    }
    return { links: current.links, migrated: false };
  }
  if (!legacyStateFile) return { links: [], migrated: false };
  const legacy = await readJson(legacyStateFile);
  if (legacy === undefined) return { links: [], migrated: false };
  if (!Array.isArray(legacy)) {
    throw new Error(`invalid legacy link state: ${legacyStateFile}`);
  }
  return { links: legacy, migrated: true };
}

function assertLinkPath(targetRoot, candidate) {
  const root = path.resolve(targetRoot);
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`managed target is outside target root: ${candidate}`);
  }
  return target;
}

function validateEntry(entry, targetRoot) {
  if (
    !entry ||
    typeof entry.path !== "string" ||
    typeof entry.target !== "string" ||
    (entry.type !== "dir" && entry.type !== "file")
  ) {
    throw new Error("invalid managed link entry");
  }
  const linkPath = assertLinkPath(targetRoot, entry.path);
  if (linkPath !== entry.path || path.resolve(entry.target) !== entry.target) {
    throw new Error("managed link paths must be absolute");
  }
}

async function validateSource(entry) {
  const source = await lstat(entry.target);
  if (source.isSymbolicLink()) {
    throw new Error(`managed link source must not be symbolic: ${entry.target}`);
  }
  if (entry.type === "dir" && !source.isDirectory()) {
    throw new Error(`managed link source is not a directory: ${entry.target}`);
  }
  if (entry.type === "file" && !source.isFile()) {
    throw new Error(`managed link source is not a file: ${entry.target}`);
  }
}

async function validateOwnedLink(entry, message) {
  const stat = await lstat(entry.path);
  if (!stat.isSymbolicLink() || (await readlink(entry.path)) !== entry.target) {
    throw new Error(`${message}: ${entry.path}`);
  }
}

export async function syncManagedLinks({
  stateFile,
  legacyStateFile,
  scope,
  targetRoot,
  desired,
}) {
  const resolvedTarget = path.resolve(targetRoot);
  const { links: previous, migrated } = await readState({
    stateFile,
    legacyStateFile,
    scope,
    targetRoot: resolvedTarget,
  });
  const previousByPath = new Map();
  for (const entry of previous) {
    validateEntry(entry, resolvedTarget);
    if (previousByPath.has(entry.path)) {
      throw new Error(`duplicate path in managed link state: ${entry.path}`);
    }
    previousByPath.set(entry.path, entry);
  }

  const desiredPaths = new Set();
  for (const entry of desired) {
    validateEntry(entry, resolvedTarget);
    await validateSource(entry);
    if (desiredPaths.has(entry.path)) {
      throw new Error(`duplicate managed target: ${entry.path}`);
    }
    desiredPaths.add(entry.path);
    if (!(await pathExists(entry.path))) continue;
    if (!previousByPath.has(entry.path)) {
      throw new Error(`unmanaged target: ${entry.path}`);
    }
  }
  for (const entry of previous) {
    if (await pathExists(entry.path)) {
      await validateOwnedLink(
        entry,
        "managed link changed outside this repository",
      );
    }
  }

  const state = {
    version: 1,
    scope,
    target: resolvedTarget,
    links: desired,
  };
  await mkdir(path.dirname(stateFile), { recursive: true });
  const temporaryState = `${stateFile}.tmp`;
  await writeFile(temporaryState, `${JSON.stringify(state, null, 2)}\n`);

  const removed = [];
  const created = [];
  try {
    for (const entry of previous) {
      if (!(await pathExists(entry.path))) continue;
      await rm(entry.path);
      removed.push(entry);
    }
    for (const entry of desired) {
      await mkdir(path.dirname(entry.path), { recursive: true });
      await symlink(entry.target, entry.path, entry.type);
      created.push(entry);
    }
    await rename(temporaryState, stateFile);
  } catch (error) {
    await rm(temporaryState, { force: true });
    for (const entry of created.reverse()) {
      if (await pathExists(entry.path)) await rm(entry.path);
    }
    for (const entry of removed) {
      if (await pathExists(entry.path)) continue;
      await mkdir(path.dirname(entry.path), { recursive: true });
      await symlink(entry.target, entry.path, entry.type);
    }
    throw error;
  }
  if (migrated) await rm(legacyStateFile, { force: true });
}
