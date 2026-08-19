# Agent Skills

This repository contains a catalog of public agent skills and reusable agents. Git submodules track upstream projects. [`manifest.json`](manifest.json) selects the skills and agents that this repository publishes.

## Skill installation

Install skills from GitHub with the standard Skills CLI:

```sh
npx skills add BenSchZA/skills
```

Use `--skill` to select one or more skills:

```sh
npx skills add BenSchZA/skills --skill code-review --skill show-me
```

The CLI discovers public skills from `skills/<skill>/SKILL.md` and `skills/<group>/<skill>/SKILL.md`. Groups organize related skills but do not change skill names.

## Repository setup

Clone the repository and initialize its upstream sources:

```sh
git clone --recurse-submodules git@github.com:BenSchZA/skills.git
cd skills
```

For an existing clone, run:

```sh
git submodule update --init --recursive
```

The repository uses this layout:

```text
skills/                         Public skills
  show-me/SKILL.md              Root skill
  obsidian/...                  Imported skill group
agents/                         Public agents
upstream/                       Git submodules
.generated/                     Generated local files and managed-link state
.private/skills/                Uncommitted skills
.private/agents/                Uncommitted agents
.private/profiles/              Uncommitted synchronization profiles
manifest.json                   Public import selection
profiles/                       Committed synchronization profiles
```

## Manifest selections

`skills` and `agents` are arrays of source selections. `source` is relative to the repository root. Each explicit `include` entry is relative to that source. Set `group` to place selected definitions below a named directory. Omit `group` to place them at the catalog root.

```json
{
  "skills": [
    {
      "source": "upstream/humanlayer/plugins/show-me/skills",
      "include": [
        "show-me"
      ]
    },
    {
      "source": "upstream/mattpocock/skills",
      "group": "mattpocock"
    }
  ],
  "agents": []
}
```

Omit `include` to select every definition recursively below `source`. Set `include` to a non-empty array of exact source-relative paths when you need an allowlist, such as `"productivity/grill-me"`. Set `exclude` to exact source-relative paths to remove definitions, such as `"in-progress/loop-me"`. Omit `exclude` when no exclusions are needed.

Set `enabled` to `false` to keep a selection in the manifest without publishing it. Omitted `enabled` and `enabled: true` both enable the selection. Disabled selections are schema-validated, but their sources are not read. The next sync removes their previous manifest-managed output. To toggle only part of a source, place that subset in a separate selection or use `exclude`.

Multiple selections can use the same `group`. The sync command merges their selected definitions. Skill and agent names must remain unique across the full catalog. A root skill name cannot equal a group name.

The sync commands replace only manifest-managed root entries and groups. They preserve other catalog entries.

## Public synchronization

Copy the selected upstream definitions into the public catalog:

```sh
npm run sync:skills
npm run sync:agents
```

Update every upstream repository before refreshing the public catalog:

```sh
git submodule update --remote --recursive
npm run sync:skills
npm run sync:agents
```

Add a public custom skill at `skills/<skill>/SKILL.md` or `skills/<group>/<skill>/SKILL.md`. Add a public agent at `agents/<agent>.md` or `agents/<group>/<agent>.md`. Do not add a custom definition to a manifest-managed path.

Skill and agent frontmatter must contain unique `name` values. Runtime installation directories are flat, so names cannot be duplicated across groups.

## Private definitions

Store uncommitted skills in `.private/skills/<skill>/SKILL.md`. Store uncommitted agents in `.private/agents/<agent>.md`. Both directories also support one grouping level, such as `.private/skills/<group>/<skill>/SKILL.md` and `.private/agents/<group>/<agent>.md`.

The `.private/` directory is ignored by Git. Local and project synchronization include these definitions in the available catalog. Their frontmatter names must remain unique across public and private definitions.

## Profiles

Profiles select skills and agents for an environment or project. Store committed profiles in `profiles/<name>.json`. Store uncommitted profiles in `.private/profiles/<name>.json`.

```json
{
  "extends": "development",
  "skills": {
    "include": ["dimensional-analysis", "rust-review"],
    "exclude": ["show-me"]
  },
  "agents": {
    "include": ["security-reviewer"]
  }
}
```

The file name is the profile name. Profile names can contain lowercase letters, numbers, and hyphens. Each selection uses the unique frontmatter `name`, not a group or source path.

A profile can extend one parent profile. The parent resolves first. Child includes add names, and child excludes remove names. An exclusion wins when one profile includes and excludes the same name. A child can include a name that its parent excluded.

Public and private profile names share one namespace. Duplicate names are errors. A missing profile, missing parent, inheritance cycle, malformed field, or unknown definition name is also an error.

## Local synchronization

Install skills and agents for Claude Code, Codex, and Pi:

```sh
npm run sync:local
npm run sync:local -- --profile development
```

The command without `--profile` selects all available skills and agents. The command with `--profile` selects only the effective profile.

The command first refreshes the catalog. It then creates one managed symbolic link for each definition:

| Definition | Claude Code | Codex | Pi |
| --- | --- | --- | --- |
| Skill | `~/.claude/skills/<name>` | `~/.codex/skills/<name>` | `~/.agents/skills/<name>` |
| Agent | `~/.claude/agents/<name>.md` | `~/.codex/agents/<name>.toml` | `~/.pi/agent/agents/<name>.md` |

Individual links preserve unrelated definitions in each runtime directory. The command records owned links under `.generated/links/`. One state file owns the links for one scope and target. The command refuses to replace an unmanaged path or a managed link that changed outside this repository.

If a profile removes or excludes a definition, the next sync removes its unchanged owned links. The sync does not remove the catalog source or links owned by another user or project scope.

Set `SKILLS_SYNC_HOME` to test against another installation root:

```sh
SKILLS_SYNC_HOME="$(mktemp -d)" npm run sync:local
```

Pi supports agent skills directly. Pi agent definitions require a separate subagent extension. The sync command warns when it does not find that extension. It does not install the extension.

## Project synchronization

Install one profile in an existing project directory:

```sh
npm run sync:project -- --profile rust --target ~/workspace/project
```

The command creates these project links:

```text
<project>/.agents/skills/<name>
<project>/.claude/skills/<name>
<project>/.codex/agents/<name>.toml
<project>/.claude/agents/<name>.md
```

The command does not edit Git ignore files. It does not install Pi project agents. The `.agents/skills` directory serves Codex and Pi project skills.

## Agents

Agents use Markdown with YAML frontmatter:

```markdown
---
name: reviewer
description: Review changes for correctness and missing tests.
access: read-only
reasoning: high
---

Inspect the affected execution paths and report concrete findings.
```

`sync:local` translates each agent into the native Claude Code, Codex, and Pi format. `access` can be `read-only` or `workspace-write`. `reasoning` controls Codex reasoning effort when specified.

## Verification

Run the automated tests and check Skills CLI discovery:

```sh
npm test
npx skills add . --list
```

## Licenses

Each imported skill and agent remains subject to its upstream repository license. See the repositories under `upstream/` for details.
