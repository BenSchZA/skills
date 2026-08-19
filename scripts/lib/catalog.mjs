import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  pathExists,
  readEntries,
  readNamedMarkdown,
  validateNoSymlinks,
} from "./content.mjs";

export function unique(items, kind) {
  const byName = new Map();
  for (const item of items) {
    const location = item.file;
    if (byName.has(item.name)) {
      throw new Error(
        `duplicate ${kind} name ${item.name}: ${byName.get(item.name)} and ${location}`,
      );
    }
    byName.set(item.name, location);
  }
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export async function discoverSkills(root) {
  const found = [];
  for (const group of await readEntries(root)) {
    if (!group.isDirectory() || group.name.startsWith(".")) continue;
    const groupPath = path.join(root, group.name);
    const flatFile = path.join(groupPath, "SKILL.md");
    if (await pathExists(flatFile)) {
      await validateNoSymlinks(groupPath);
      const parsed = await readNamedMarkdown(flatFile);
      found.push({
        name: parsed.name,
        group: undefined,
        directory: groupPath,
        file: flatFile,
      });
      continue;
    }
    for (const entry of await readdir(groupPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const directory = path.join(groupPath, entry.name);
      await validateNoSymlinks(directory);
      const file = path.join(directory, "SKILL.md");
      const parsed = await readNamedMarkdown(file);
      found.push({
        name: parsed.name,
        group: group.name,
        directory,
        file,
      });
    }
  }
  return unique(found, "skill");
}

export async function discoverAgents(root) {
  const found = [];
  for (const group of await readEntries(root)) {
    if (group.name.startsWith(".")) continue;
    if (group.isFile() && path.extname(group.name) === ".md") {
      const file = path.join(root, group.name);
      const parsed = await readNamedMarkdown(file);
      found.push({ name: parsed.name, group: undefined, file, parsed });
      continue;
    }
    if (!group.isDirectory()) continue;
    const groupPath = path.join(root, group.name);
    for (const entry of await readdir(groupPath, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name) !== ".md") continue;
      const file = path.join(groupPath, entry.name);
      const parsed = await readNamedMarkdown(file);
      found.push({ name: parsed.name, group: group.name, file, parsed });
    }
  }
  return unique(found, "agent");
}
