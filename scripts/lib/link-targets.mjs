import path from "node:path";

function skillLink(pathname, skill) {
  return { path: pathname, target: skill.directory, type: "dir" };
}

function agentLink(pathname, agent) {
  return { path: pathname, target: agent.file, type: "file" };
}

const GLOBAL_TARGETS = {
  skillDirectories: [
    [".claude", "skills"],
    [".codex", "skills"],
    [".agents", "skills"],
  ],
  agentDirectories: [
    ["claude-code", [".claude", "agents"], ".md"],
    ["codex", [".codex", "agents"], ".toml"],
    ["pi", [".pi", "agent", "agents"], ".md"],
  ],
};

const PROJECT_TARGETS = {
  skillDirectories: [
    [".claude", "skills"],
    [".agents", "skills"],
  ],
  agentDirectories: [
    ["claude-code", [".claude", "agents"], ".md"],
    ["codex", [".codex", "agents"], ".toml"],
  ],
};

function links({ targetRoot, skills, generated }, targets) {
  const links = [];
  for (const skill of skills) {
    for (const directory of targets.skillDirectories) {
      links.push(
        skillLink(path.join(targetRoot, ...directory, skill.name), skill),
      );
    }
  }
  for (const [runtime, directory, extension] of targets.agentDirectories) {
    for (const agent of generated.get(runtime)) {
      links.push(
        agentLink(
          path.join(targetRoot, ...directory, `${agent.name}${extension}`),
          agent,
        ),
      );
    }
  }
  return links;
}

export function globalLinks(options) {
  return links(options, GLOBAL_TARGETS);
}

export function projectLinks(options) {
  return links(options, PROJECT_TARGETS);
}
