import { randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assertWithin,
  pathExists,
  readEntries,
  readNamedMarkdown,
  validateNoSymlinks,
} from "./content.mjs";

export const MANAGED_MARKER = ".manifest-managed.json";
const ROOT_MANAGED_MARKER = ".manifest-root-managed.json";

export function validateGroupName(group) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(group)) {
    throw new Error(`invalid output group: ${group}`);
  }
}

export function rootEntryName(name, kind) {
  if (
    typeof name !== "string" ||
    !name ||
    name.startsWith(".") ||
    path.basename(name) !== name
  ) {
    throw new Error(`invalid ${kind} name: ${name}`);
  }
  return kind === "skill" ? name : `${name}.md`;
}

export async function readManagedRootEntries(outputRoot, kind) {
  const marker = path.join(outputRoot, ROOT_MANAGED_MARKER);
  let state;
  try {
    state = JSON.parse(await readFile(marker, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
  if (
    !state ||
    state.kind !== kind ||
    !Array.isArray(state.entries) ||
    state.entries.some(
      (entry) =>
        typeof entry !== "string" ||
        rootEntryName(
          kind === "skill" ? entry : path.basename(entry, ".md"),
          kind,
        ) !== entry,
    )
  ) {
    throw new Error(`invalid managed root state: ${marker}`);
  }
  if (new Set(state.entries).size !== state.entries.length) {
    throw new Error(`duplicate managed root entry: ${marker}`);
  }
  return new Set(state.entries);
}

async function prepareEntries({ root, outputRoot, group, sources, kind }) {
  const label = group ?? "root";
  const temporary = assertWithin(
    outputRoot,
    path.join(outputRoot, `.sync-${label}.tmp-${randomUUID()}`),
    `temporary ${label}`,
  );
  await mkdir(temporary, { recursive: true });
  const entries = [];

  try {
    for (const source of sources) {
      const sourceStat = await lstat(source);
      if (sourceStat.isSymbolicLink()) {
        throw new Error(`symbolic source is not allowed: ${source}`);
      }
      if (kind === "skill") {
        if (!sourceStat.isDirectory()) {
          throw new Error(`skill source is not a directory: ${source}`);
        }
        await validateNoSymlinks(source, root);
      } else if (!sourceStat.isFile()) {
        throw new Error(`agent source is not a file: ${source}`);
      }

      const parsed =
        kind === "skill"
          ? await readNamedMarkdown(path.join(source, "SKILL.md"))
          : await readNamedMarkdown(source);
      const entry = rootEntryName(parsed.name, kind);
      const target = assertWithin(
        temporary,
        path.join(temporary, entry),
        `temporary ${kind}`,
      );
      await cp(source, target, {
        recursive: kind === "skill",
        dereference: kind === "skill",
        errorOnExist: true,
        force: false,
        filter: (candidate) => path.basename(candidate) !== ".git",
      });
      entries.push(entry);
    }
    if (group !== undefined) {
      await writeFile(
        path.join(temporary, MANAGED_MARKER),
        `${JSON.stringify({ group, kind }, null, 2)}\n`,
      );
    }
    return { temporary, entries };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function replacePreparedGroup(outputRoot, group, temporary) {
  const destination = assertWithin(
    outputRoot,
    path.join(outputRoot, group),
    "group destination",
  );
  const destinationExists = await pathExists(destination);
  const backup = assertWithin(
    outputRoot,
    path.join(outputRoot, `.sync-${group}.backup-${randomUUID()}`),
    "group backup",
  );
  if (destinationExists) await rename(destination, backup);
  try {
    await rename(temporary, destination);
  } catch (error) {
    if (destinationExists && (await pathExists(backup))) {
      await rename(backup, destination);
    }
    throw error;
  }
  if (destinationExists) await rm(backup, { recursive: true });
}

export async function replaceManagedGroups({ root, groups, kind }) {
  if (kind !== "skill" && kind !== "agent") {
    throw new Error(`unsupported catalog kind: ${kind}`);
  }

  const outputRoot = assertWithin(root, path.join(root, `${kind}s`), "output");
  await mkdir(outputRoot, { recursive: true });

  for (const group of groups.keys()) validateGroupName(group);
  for (const group of groups.keys()) {
    const destination = path.join(outputRoot, group);
    if (
      (await pathExists(destination)) &&
      !(await pathExists(path.join(destination, MANAGED_MARKER)))
    ) {
      throw new Error(`refusing to replace unmanaged group: ${destination}`);
    }
  }

  const prepared = new Map();
  try {
    for (const [group, sources] of groups) {
      const { temporary } = await prepareEntries({
        root,
        outputRoot,
        group,
        sources,
        kind,
      });
      prepared.set(group, temporary);
    }
  } catch (error) {
    for (const temporary of prepared.values()) {
      await rm(temporary, { recursive: true, force: true });
    }
    throw error;
  }

  for (const group of await readEntries(outputRoot)) {
    if (
      !group.isDirectory() ||
      group.name.startsWith(".") ||
      groups.has(group.name)
    ) {
      continue;
    }
    const groupPath = path.join(outputRoot, group.name);
    if (await pathExists(path.join(groupPath, MANAGED_MARKER))) {
      await rm(assertWithin(outputRoot, groupPath, "stale managed group"), {
        recursive: true,
      });
    }
  }
  for (const [group, temporary] of prepared) {
    await replacePreparedGroup(outputRoot, group, temporary);
  }
}

export async function replaceManagedRootEntries({ root, sources, kind }) {
  if (kind !== "skill" && kind !== "agent") {
    throw new Error(`unsupported catalog kind: ${kind}`);
  }

  const outputRoot = assertWithin(root, path.join(root, `${kind}s`), "output");
  await mkdir(outputRoot, { recursive: true });
  const previous = await readManagedRootEntries(outputRoot, kind);
  const { temporary, entries } = await prepareEntries({
    root,
    outputRoot,
    sources,
    kind,
  });
  const desired = new Set(entries);
  if (desired.size !== entries.length) {
    await rm(temporary, { recursive: true, force: true });
    throw new Error(`duplicate root ${kind} name`);
  }

  const replaceable = new Set(previous);
  try {
    for (const entry of desired) {
      const destination = assertWithin(
        outputRoot,
        path.join(outputRoot, entry),
        `root ${kind} destination`,
      );
      if (!(await pathExists(destination)) || replaceable.has(entry)) continue;

      const managedGroupMarker = path.join(destination, MANAGED_MARKER);
      if (kind === "skill" && (await pathExists(managedGroupMarker))) {
        replaceable.add(entry);
        continue;
      }
      throw new Error(`refusing to replace unmanaged root entry: ${destination}`);
    }
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }

  const backup = assertWithin(
    outputRoot,
    path.join(outputRoot, `.sync-root.backup-${randomUUID()}`),
    "root entry backup",
  );
  await mkdir(backup);
  const moved = [];
  const installed = [];
  const marker = path.join(outputRoot, ROOT_MANAGED_MARKER);
  const markerTemporary = assertWithin(
    outputRoot,
    path.join(outputRoot, `.sync-root.marker-${randomUUID()}`),
    "temporary root marker",
  );

  try {
    for (const entry of replaceable) {
      const destination = assertWithin(
        outputRoot,
        path.join(outputRoot, entry),
        `managed root ${kind}`,
      );
      if (!(await pathExists(destination))) continue;
      await rename(destination, path.join(backup, entry));
      moved.push(entry);
    }
    for (const entry of entries) {
      await rename(path.join(temporary, entry), path.join(outputRoot, entry));
      installed.push(entry);
    }
    await writeFile(
      markerTemporary,
      `${JSON.stringify({ kind, entries: [...desired].sort() }, null, 2)}\n`,
    );
    await rename(markerTemporary, marker);
  } catch (error) {
    await rm(markerTemporary, { force: true });
    for (const entry of installed) {
      await rm(path.join(outputRoot, entry), {
        recursive: kind === "skill",
        force: true,
      });
    }
    for (const entry of moved) {
      await rename(path.join(backup, entry), path.join(outputRoot, entry));
    }
    await rm(temporary, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    throw error;
  }

  await rm(temporary, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
}
