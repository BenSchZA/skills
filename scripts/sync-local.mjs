import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { pathExists } from "./lib/content.mjs";
import { globalLinks } from "./lib/link-targets.mjs";
import {
  linkStateFile,
  syncManagedLinks,
} from "./lib/managed-links.mjs";
import { prepareRuntime } from "./lib/runtime-catalog.mjs";
import { parseLocalOptions } from "./lib/sync-options.mjs";
import { syncAgents } from "./sync-agents.mjs";
import { syncSkills } from "./sync-skills.mjs";

const repositoryRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);

function legacyLocalStateFile(root, installationHome) {
  const homeId = createHash("sha256")
    .update(installationHome)
    .digest("hex")
    .slice(0, 16);
  return path.join(root, ".generated", "local-links", `${homeId}.json`);
}

export async function syncLocal(
  root = repositoryRoot,
  installationHome = process.env.SKILLS_SYNC_HOME || homedir(),
  profile,
) {
  const resolvedRoot = path.resolve(root);
  const resolvedHome = path.resolve(installationHome);
  await Promise.all([syncSkills(resolvedRoot), syncAgents(resolvedRoot)]);

  const { skills, generated } = await prepareRuntime(resolvedRoot, profile);
  await syncManagedLinks({
    stateFile: linkStateFile(resolvedRoot, "global", resolvedHome),
    legacyStateFile: legacyLocalStateFile(resolvedRoot, resolvedHome),
    scope: "global",
    targetRoot: resolvedHome,
    desired: globalLinks({
      targetRoot: resolvedHome,
      skills,
      generated,
    }),
  });

  const piExtension = path.join(
    resolvedHome,
    ".pi",
    "agent",
    "extensions",
    "subagent",
    "index.ts",
  );
  if (
    generated.get("pi").length > 0 &&
    !(await pathExists(piExtension))
  ) {
    console.warn("Warning: Pi agent files require the Pi subagent extension.");
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseLocalOptions(process.argv.slice(2));
  await syncLocal(repositoryRoot, undefined, options.profile);
  console.log("Synchronized public and private skills and agents locally.");
}
