import { lstat, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { projectLinks } from "./lib/link-targets.mjs";
import {
  linkStateFile,
  syncManagedLinks,
} from "./lib/managed-links.mjs";
import { prepareRuntime } from "./lib/runtime-catalog.mjs";
import { parseProjectOptions } from "./lib/sync-options.mjs";
import { syncAgents } from "./sync-agents.mjs";
import { syncSkills } from "./sync-skills.mjs";

const repositoryRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);

export async function syncProject(root, target, profile) {
  if (!profile) throw new Error("project profile is required");
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = await realpath(path.resolve(target));
  if (!(await lstat(resolvedTarget)).isDirectory()) {
    throw new Error(`project target is not a directory: ${resolvedTarget}`);
  }
  await Promise.all([syncSkills(resolvedRoot), syncAgents(resolvedRoot)]);

  const { skills, generated } = await prepareRuntime(resolvedRoot, profile);
  await syncManagedLinks({
    stateFile: linkStateFile(resolvedRoot, "project", resolvedTarget),
    scope: "project",
    targetRoot: resolvedTarget,
    desired: projectLinks({
      targetRoot: resolvedTarget,
      skills,
      generated,
    }),
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseProjectOptions(process.argv.slice(2));
  await syncProject(repositoryRoot, options.target, options.profile);
  console.log("Synchronized selected skills and agents to the project.");
}
