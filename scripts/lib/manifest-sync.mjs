import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { discoverAgents, discoverSkills, unique } from "./catalog.mjs";
import {
  assertWithin,
  pathExists,
  readNamedMarkdown,
} from "./content.mjs";
import {
  MANAGED_MARKER,
  readManagedRootEntries,
  replaceManagedGroups,
  replaceManagedRootEntries,
  rootEntryName,
  validateGroupName,
} from "./managed-catalog.mjs";

function validateManifestDefinition(definition, index, kind) {
  const label = `${kind} definition ${index}`;
  if (!definition || typeof definition.source !== "string") {
    throw new Error(`${label}: source must be a string`);
  }
  if (
    definition.enabled !== undefined &&
    typeof definition.enabled !== "boolean"
  ) {
    throw new Error(`${label}: enabled must be a boolean`);
  }
  if (definition.group !== undefined) {
    if (typeof definition.group !== "string") {
      throw new Error(`${label}: group must be a string`);
    }
    validateGroupName(definition.group);
  }
  if (
    definition.include !== undefined &&
    (!Array.isArray(definition.include) ||
      definition.include.some((entry) => typeof entry !== "string"))
  ) {
    throw new Error(`${label}: include must be an array of strings`);
  }
  if (definition.include?.length === 0) {
    throw new Error(`${label}: include must not be empty`);
  }
  if (definition.include?.some((entry) => entry.includes("*"))) {
    throw new Error(`${label}: include does not support wildcards`);
  }
  if (
    definition.exclude !== undefined &&
    (!Array.isArray(definition.exclude) ||
      definition.exclude.some((entry) => typeof entry !== "string"))
  ) {
    throw new Error(`${label}: exclude must be an array of strings`);
  }
}

function relativeSourcePath(sourceRoot, candidate) {
  return path.relative(sourceRoot, candidate).split(path.sep).join("/") || ".";
}

function filterExcludedSources({
  sourceRoot,
  sources,
  exclude = [],
  kind,
  group,
}) {
  const available = new Set(
    sources.map((source) => relativeSourcePath(sourceRoot, source)),
  );
  const excluded = new Set();
  for (const entry of exclude) {
    const candidate = assertWithin(
      sourceRoot,
      path.join(sourceRoot, entry),
      `${kind} exclusion ${group}/${entry}`,
    );
    const relative = relativeSourcePath(sourceRoot, candidate);
    if (!available.has(relative)) {
      throw new Error(
        `${kind} group ${group}: excluded ${kind} does not exist: ${entry}`,
      );
    }
    excluded.add(relative);
  }
  return sources.filter(
    (source) => !excluded.has(relativeSourcePath(sourceRoot, source)),
  );
}

async function findManifestSources(directory, kind) {
  const directoryStat = await lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error(`${kind} source is not a regular directory: ${directory}`);
  }
  if (kind === "skill") {
    const skillFile = path.join(directory, "SKILL.md");
    if (await pathExists(skillFile)) {
      const stat = await lstat(skillFile);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`${kind} definition is not a regular file: ${skillFile}`);
      }
      return [directory];
    }
  }

  const found = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const candidate = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic source is not allowed: ${candidate}`);
    }
    if (entry.isDirectory()) {
      found.push(...(await findManifestSources(candidate, kind)));
    } else if (
      kind === "agent" &&
      entry.isFile() &&
      path.extname(entry.name) === ".md"
    ) {
      found.push(candidate);
    }
  }
  return found;
}

async function resolveManifestSources(sourceRoot, definition, group, kind) {
  const sources =
    definition.include === undefined
      ? await findManifestSources(sourceRoot, kind)
      : definition.include.map((entry) =>
          assertWithin(
            sourceRoot,
            path.join(sourceRoot, entry),
            `${kind} ${group}/${entry}`,
          ),
        );
  return filterExcludedSources({
    sourceRoot,
    sources,
    exclude: definition.exclude,
    kind,
    group,
  });
}

export async function syncManifest(root, kind) {
  const plural = `${kind}s`;
  const manifest = JSON.parse(
    await readFile(path.join(root, "manifest.json"), "utf8"),
  );
  const definitions = manifest[plural] === undefined ? [] : manifest[plural];
  if (!Array.isArray(definitions)) {
    throw new Error(`manifest ${plural} must be an array`);
  }
  const groups = new Map();
  const rootSources = [];
  const selected = [];

  for (const [index, definition] of definitions.entries()) {
    validateManifestDefinition(definition, index, kind);
    if (definition.enabled === false) continue;
    const group = definition.group;
    const label = group ?? "root";
    const sourceRoot = assertWithin(
      root,
      path.join(root, definition.source),
      `${kind} source ${label}`,
    );
    const sources = await resolveManifestSources(
      sourceRoot,
      definition,
      label,
      kind,
    );
    if (group === undefined) {
      rootSources.push(...sources);
    } else {
      groups.set(group, [...(groups.get(group) ?? []), ...sources]);
    }
    for (const source of sources) {
      const file = kind === "skill" ? path.join(source, "SKILL.md") : source;
      const parsed = await readNamedMarkdown(file);
      selected.push({ name: parsed.name, group, file });
    }
  }

  if (kind === "skill") {
    const rootNames = new Set(
      selected
        .filter(({ group }) => group === undefined)
        .map(({ name }) => name),
    );
    for (const name of rootNames) {
      if (groups.has(name)) {
        throw new Error(`root skill ${name} collides with group ${name}`);
      }
    }
  }

  const publicRoot = path.join(root, plural);
  const existing = await (kind === "skill" ? discoverSkills : discoverAgents)(
    publicRoot,
  );
  const managedRoot = await readManagedRootEntries(publicRoot, kind);
  const firstParty = [];
  for (const item of existing) {
    if (item.group === undefined) {
      if (!managedRoot.has(rootEntryName(item.name, kind))) {
        firstParty.push(item);
      }
      continue;
    }
    const marker = path.join(publicRoot, item.group, MANAGED_MARKER);
    if (!(await pathExists(marker))) firstParty.push(item);
  }
  unique([...firstParty, ...selected], kind);

  await replaceManagedRootEntries({ root, sources: rootSources, kind });
  await replaceManagedGroups({ root, groups, kind });
}
