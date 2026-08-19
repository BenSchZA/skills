import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncManifest } from "./lib/manifest-sync.mjs";

const repositoryRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);

export async function syncAgents(root = repositoryRoot) {
  await syncManifest(root, "agent");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await syncAgents();
  console.log("Synchronized public agents.");
}
