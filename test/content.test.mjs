import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  assertWithin,
  parseFrontmatter,
} from "../scripts/lib/content.mjs";
import { fixture } from "./helpers.mjs";

test("parseFrontmatter reads scalar and block values", () => {
  const parsed = parseFrontmatter(
    "---\nname: reviewer\ndescription: |\n  First line.\n  Second line.\naccess: read-only\n---\n\nReview code.\n",
    "reviewer.md",
  );

  assert.equal(parsed.attributes.name, "reviewer");
  assert.equal(parsed.attributes.description, "First line.\nSecond line.");
  assert.equal(parsed.attributes.access, "read-only");
  assert.equal(parsed.body, "Review code.\n");
});

test("assertWithin rejects a path outside the repository", async () => {
  const root = await fixture();

  assert.throws(
    () => assertWithin(root, path.join(root, "..", "escape"), "source"),
    /escapes repository root/,
  );
});
