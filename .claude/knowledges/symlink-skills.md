---
name: symlink-skills
description: Use when sharing skills across repos via symlinks to avoid copying files
---

# Symlink Skills to Consumer Repos

## Purpose
Keep saas-factory skills, guidelines, roles, templates, and reference available in other repos without copying files. Symlinks ensure consumer repos always use the latest version automatically.

## Rules
- **DO**: Symlink everything inside `.claude/` including `settings.json` so permission config stays in sync across all repos.
- **DO**: Symlink `templates/` and `reference/` at the repo root so skills can resolve those paths.
- **DO**: Commit the symlinks into the consumer repo's git history.
- **DON'T**: Copy the directories — copies go stale as saas-factory evolves.
- **DON'T**: Symlink the entire `.claude/` directory — symlink each entry individually so the `.claude/` directory itself belongs to the consumer repo.

## Setup

From the consumer repo root (assuming saas-factory is a sibling directory):

```bash
# .claude entries
mkdir -p .claude
ln -s ../saas-factory/.claude/commands      .claude/commands
ln -s ../saas-factory/.claude/guidelines    .claude/guidelines
ln -s ../saas-factory/.claude/company       .claude/company
ln -s ../saas-factory/.claude/roles         .claude/roles
ln -s ../saas-factory/.claude/settings.json .claude/settings.json

# repo-root resources
ln -s saas-factory/templates templates
ln -s saas-factory/reference  reference
```

## Verify

```bash
ls -la .claude/
# lrwxr-xr-x  commands   -> ../saas-factory/.claude/commands
# lrwxr-xr-x  guidelines -> ../saas-factory/.claude/guidelines
# lrwxr-xr-x  company    -> ../saas-factory/.claude/company
# lrwxr-xr-x  roles      -> ../saas-factory/.claude/roles
# lrwxr-xr-x  settings.json -> ../saas-factory/.claude/settings.json

ls -la | grep -E "templates|reference"
# lrwxr-xr-x  templates -> saas-factory/templates
# lrwxr-xr-x  reference -> saas-factory/reference
```

Entries starting with `l` in the permission string confirm they are symlinks.

## How It Works

Claude Code loads skills from `<project-root>/.claude/commands/`. The symlinks make all saas-factory content resolve correctly — any skill added, updated, or removed in saas-factory is immediately reflected in the consumer repo with no manual sync.
