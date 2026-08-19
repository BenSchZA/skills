import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

function parseScalar(value) {
  const text = value.trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replaceAll("''", "'");
  }
  return text;
}

export function parseFrontmatter(markdown, filePath) {
  const normalized = markdown.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${filePath}: missing YAML frontmatter`);
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error(`${filePath}: unterminated YAML frontmatter`);
  }

  const lines = normalized.slice(4, end).split("\n");
  const attributes = {};
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(
      lines[index],
    );
    if (!match) continue;

    const [, key, rawValue = ""] = match;
    if (["|", "|-", ">", ">-"].includes(rawValue.trim())) {
      const block = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        block.push(lines[index + 1].replace(/^ {2}/, ""));
        index += 1;
      }
      attributes[key] = rawValue.startsWith(">")
        ? block.join(" ")
        : block.join("\n");
    } else {
      attributes[key] = parseScalar(rawValue);
    }
  }

  return {
    attributes,
    body: normalized.slice(end + 5).replace(/^\n/, ""),
  };
}

export async function readNamedMarkdown(filePath) {
  const parsed = parseFrontmatter(await readFile(filePath, "utf8"), filePath);
  const name = parsed.attributes.name?.trim();
  const description = parsed.attributes.description?.trim();
  if (!name) throw new Error(`${filePath}: missing name frontmatter`);
  if (!description) {
    throw new Error(`${filePath}: missing description frontmatter`);
  }
  return { name, description, ...parsed };
}

export function assertWithin(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`${label} escapes repository root: ${candidate}`);
  }
  return resolved;
}

export async function validateNoSymlinks(directory, internalLinksRoot) {
  const allowedRoot = internalLinksRoot
    ? await realpath(internalLinksRoot)
    : undefined;

  async function walk(candidate, isRoot = false) {
    const candidateStat = await lstat(candidate);
    if (candidateStat.isSymbolicLink()) {
      if (!allowedRoot || isRoot) {
        throw new Error(
          `symbolic link is not allowed in catalog content: ${candidate}`,
        );
      }
      const resolved = await realpath(candidate);
      assertWithin(allowedRoot, resolved, "symbolic link target");
      if (!(await lstat(resolved)).isFile()) {
        throw new Error(`symbolic link target is not a file: ${candidate}`);
      }
      return;
    }
    if (!candidateStat.isDirectory()) return;

    for (const entry of await readdir(candidate, { withFileTypes: true })) {
      await walk(path.join(candidate, entry.name));
    }
  }

  await walk(directory, true);
}

export async function readEntries(directory) {
  return readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

export async function pathExists(candidate) {
  return lstat(candidate).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
}
