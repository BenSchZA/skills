import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const PROFILE_NAME = /^[a-z0-9][a-z0-9-]*$/;

async function readDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const profiles = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== ".json") continue;
    const name = path.basename(entry.name, ".json");
    if (!PROFILE_NAME.test(name)) {
      throw new Error(`invalid profile name: ${name}`);
    }
    const file = path.join(directory, entry.name);
    let value;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      throw new Error(`invalid profile JSON: ${file}`, { cause: error });
    }
    profiles.push({ name, value });
  }
  return profiles;
}

function stringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} contains a duplicate name`);
  }
  return value;
}

function validateProfile(name, value) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`profile ${name}: profile must be an object`);
  }
  if (value.extends !== undefined && typeof value.extends !== "string") {
    throw new Error(`profile ${name}: extends must be a string`);
  }

  const result = { extends: value.extends };
  for (const kind of ["skills", "agents"]) {
    const section = value[kind] ?? {};
    if (!section || Array.isArray(section) || typeof section !== "object") {
      throw new Error(`profile ${name}: ${kind} must be an object`);
    }
    result[kind] = {
      include: stringArray(
        section.include,
        `profile ${name}: ${kind}.include`,
      ),
      exclude: stringArray(
        section.exclude,
        `profile ${name}: ${kind}.exclude`,
      ),
    };
  }
  return result;
}

async function loadProfiles(root) {
  const [publicProfiles, privateProfiles] = await Promise.all([
    readDirectory(path.join(root, "profiles")),
    readDirectory(path.join(root, ".private", "profiles")),
  ]);
  const profiles = new Map();
  for (const profile of [...publicProfiles, ...privateProfiles]) {
    if (profiles.has(profile.name)) {
      throw new Error(`duplicate profile name ${profile.name}`);
    }
    profiles.set(profile.name, validateProfile(profile.name, profile.value));
  }
  return profiles;
}

function applySection(current, section, available, profileName, kind) {
  const selected = new Set(current);
  for (const name of [...section.include, ...section.exclude]) {
    if (!available.has(name)) {
      throw new Error(
        `profile ${profileName} references unknown ${kind} ${name}`,
      );
    }
  }
  for (const name of section.include) selected.add(name);
  for (const name of section.exclude) selected.delete(name);
  return selected;
}

export async function resolveProfile({ root, name, skillNames, agentNames }) {
  if (name === undefined) {
    return {
      skillNames: new Set(skillNames),
      agentNames: new Set(agentNames),
    };
  }

  const profiles = await loadProfiles(root);
  if (!profiles.has(name)) throw new Error(`profile not found: ${name}`);

  function visit(profileName, stack = []) {
    const cycleAt = stack.indexOf(profileName);
    if (cycleAt >= 0) {
      throw new Error(
        `profile inheritance cycle: ${[
          ...stack.slice(cycleAt),
          profileName,
        ].join(" -> ")}`,
      );
    }
    const profile = profiles.get(profileName);
    if (!profile) {
      throw new Error(
        `profile ${stack.at(-1)} extends missing profile ${profileName}`,
      );
    }
    const parent = profile.extends
      ? visit(profile.extends, [...stack, profileName])
      : { skillNames: new Set(), agentNames: new Set() };
    return {
      skillNames: applySection(
        parent.skillNames,
        profile.skills,
        skillNames,
        profileName,
        "skill",
      ),
      agentNames: applySection(
        parent.agentNames,
        profile.agents,
        agentNames,
        profileName,
        "agent",
      ),
    };
  }

  return visit(name);
}
