import { parseArgs } from "node:util";

function parseOptions(args) {
  const { values, tokens } = parseArgs({
    args,
    options: {
      profile: { type: "string" },
      target: { type: "string" },
    },
    tokens: true,
  });
  for (const name of ["profile", "target"]) {
    if (tokens.filter((token) => token.name === name).length > 1) {
      throw new Error(`--${name} can only be set once`);
    }
  }
  return values;
}

export function parseLocalOptions(args) {
  const values = parseOptions(args);
  if (values.target !== undefined) {
    throw new Error("--target is only supported by sync:project");
  }
  return { profile: values.profile };
}

export function parseProjectOptions(args) {
  const values = parseOptions(args);
  if (values.target === undefined) throw new Error("--target is required");
  if (values.profile === undefined) throw new Error("--profile is required");
  return { profile: values.profile, target: values.target };
}
