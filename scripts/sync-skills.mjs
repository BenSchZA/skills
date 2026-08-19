import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncManifest } from "./lib/manifest-sync.mjs";

const repositoryRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);

export async function syncSkills(root = repositoryRoot) {
  await syncManifest(root, "skill");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await syncSkills();
  console.log("Synchronized public skills.");
}
