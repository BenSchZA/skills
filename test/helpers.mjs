import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function fixture(prefix = "skills-") {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function writeSkill(
  directory,
  name,
  description = `${name} skill.`,
) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n`,
  );
}

export async function writeAgent(
  file,
  name,
  description = `${name} agent.`,
) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `---\nname: ${name}\ndescription: ${description}\n---\n\nWork as ${name}.\n`,
  );
}
