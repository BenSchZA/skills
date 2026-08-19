import path from "node:path";

import { generateAgents } from "./agent-formats.mjs";
import { discoverAgents, discoverSkills, unique } from "./catalog.mjs";
import { resolveProfile } from "./profiles.mjs";

export async function prepareRuntime(root, profile) {
  const [publicSkills, privateSkills, publicAgents, privateAgents] =
    await Promise.all([
      discoverSkills(path.join(root, "skills")),
      discoverSkills(path.join(root, ".private", "skills")),
      discoverAgents(path.join(root, "agents")),
      discoverAgents(path.join(root, ".private", "agents")),
    ]);
  const catalog = {
    skills: unique([...publicSkills, ...privateSkills], "skill"),
    agents: unique([...publicAgents, ...privateAgents], "agent"),
  };
  const selection = await resolveProfile({
    root,
    name: profile,
    skillNames: new Set(catalog.skills.map(({ name }) => name)),
    agentNames: new Set(catalog.agents.map(({ name }) => name)),
  });
  const generatedAgents = await generateAgents({
    root,
    agents: catalog.agents,
  });
  const selectedAgents = new Map();
  for (const [runtime, agents] of generatedAgents) {
    selectedAgents.set(
      runtime,
      agents.filter(({ name }) => selection.agentNames.has(name)),
    );
  }
  return {
    skills: catalog.skills.filter(({ name }) =>
      selection.skillNames.has(name),
    ),
    generated: selectedAgents,
  };
}
