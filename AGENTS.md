# Repository Instructions

## Task Scope
You are a key participant in the development process. Your comments and suggestions are very important to me. You are free to disagree, debate, and express your opinion; your point of view matters to us.
Work only on the explicitly assigned task. Do not automatically proceed to the next task.

Read the exact task file named by the user; do not select a task by number alone.
`docs/tasks/` is the conventional location, but current task files may be at the
repository root. Task-specific requirements and scope restrictions belong in
those specifications; the rules below apply repository-wide.

Before starting work, read `docs/SESSION_HANDOFF.md` for the current implementation
state and recent verification results. Treat it as status context, not as a
replacement for the explicitly assigned task specification.

## Sub-agents and repository skills

Use [the agent workflow](docs/AGENT_WORKFLOW.md) for delegation and skill selection.
For a substantial assigned task with independent investigation or review work,
delegate those bounded parts to the repository roles. Keep small, tightly coupled
edits with one agent; do not spawn every role by default.

The main agent coordinates scope, file ownership, integration, and final checks.
Use `ks_explorer` for read-only investigation, `ks_implementer` for assigned edits,
and `ks_reviewer` for independent read-only review. Limit the team to the main
agent plus three concurrent children, or fewer if the environment permits fewer.
Children do not recursively delegate. Never assign overlapping writers.

Repository skills live in `.agents/skills/`: `ks-persistence`, `ks-youtube-auth`,
and `ks-verify`. Read only the skills relevant to the assigned work. If the client
does not expose custom roles or skills, read their linked files and include the
relevant instructions in an ordinary delegation, or work sequentially.
These instructions authorize delegation within the current task, not new tasks,
commits, pushes, or changes to application architecture.

---

# Project Context

`knowledge-sync` is a local-first tool that periodically collects saved knowledge from external sources such as YouTube and Facebook, normalizes it into a common internal model, stores synchronization metadata locally, and writes Markdown notes directly into an existing Obsidian Vault.

The Obsidian Vault:

* exists on the local filesystem;
* is already version-controlled using Git;
* is synchronized independently from this application.

The user expects to run synchronization manually, approximately once per week.

Therefore the application does not currently require:

* background execution;
* schedulers;
* servers;
* cloud infrastructure;
* automatic Git integration.

---

# Technical Stack

Use:

* Node.js
* TypeScript
* Vitest
* Zod
* Commander
* SQLite
* Drizzle ORM

Do not add:

* Docker;
* frontend frameworks;
* web servers;
* REST APIs;
* AI or LLM integrations;
* schedulers;
* background services;
* Obsidian plugins;
* Git automation;
* cloud infrastructure.

Keep the implementation minimal.

---

# Initial Project Structure

Create an architecture approximately equivalent to:

```text
knowledge-sync/
├── src/
│   ├── collectors/
│   ├── core/
│   │   └── models/
│   ├── storage/
│   │   └── sqlite/
│   ├── outputs/
│   │   └── obsidian/
│   └── cli/
│
├── tests/
├── docs/
│   └── tasks/
├── data/
│
├── AGENTS.md
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

Minor deviations are acceptable if they improve clarity, but explain them in the completion report.

Do not create unnecessary nested abstractions.

---

# Domain Model

Define a source-independent `KnowledgeItem` model.

It should contain at least:

```ts
source
sourceId
url
title
description?
author?
collection?
publishedAt?
```

Use appropriate TypeScript types.

Validation using Zod is encouraged where it provides useful runtime guarantees.

The core domain model must not contain YouTube-specific or Facebook-specific fields unless there is a documented architectural reason.

Source-specific raw data must remain inside the corresponding collector.

---

# Collector Interface

Define a minimal abstraction representing an external source collector.

Its responsibility is:

```text
External source
      ↓
Collector
      ↓
KnowledgeItem[]
```

The interface should allow future implementations such as:

```text
YouTubeCollector
FacebookCollector
GitHubCollector
```

Avoid designing a complex generic plugin architecture.

---

# Storage Interface

Define a minimal storage abstraction responsible for synchronization state.

It must support future logic that can determine whether an item has previously been imported.

Logical item identity must use:

```text
source + sourceId
```

Do not use titles as identity.

The storage layer will later support:

* duplicate detection;
* incremental synchronization;
* import metadata.

---

# SQLite Foundation

Set up SQLite and Drizzle ORM.

Create the minimal schema needed to track imported items.

At minimum include fields equivalent to:

```text
source
sourceId
url
importedAt
```

Enforce uniqueness for:

```text
(source, sourceId)
```

Do not over-design the schema.

Task 004 extends SQLite to store normalized `KnowledgeItem` objects alongside
separate synchronization/import state. Persisting an item does not mark it as
imported or exported. Obsidian remains the planned user-facing knowledge repository.

The SQLite database must not be stored inside the Obsidian Vault.

---

# Output Interface

Define a minimal output abstraction responsible for writing a normalized `KnowledgeItem` to an external destination.

The first planned implementation will eventually be:

```text
KnowledgeItem
      ↓
Markdown renderer
      ↓
Local Obsidian Vault
```

Do not use an Obsidian API.

---

# CLI

Create a minimal CLI using Commander.

The following command must work:

```bash
knowledge-sync --help
```

Design the CLI so commands such as the following can be added later:

```bash
knowledge-sync sync youtube <playlist-url>
knowledge-sync sync facebook
knowledge-sync sync all
```

Empty command placeholders are optional and should only be added if they help establish the intended CLI structure.

Do not create fake implementations that appear functional.

---

# Local Configuration

Provide configuration placeholders for at least:

```text
OBSIDIAN_VAULT_PATH
DATABASE_PATH
```

Create `.env.example`.

Machine-specific values must not be committed.

The application should be designed so the SQLite database path and Obsidian Vault path are independently configurable.

---

# Git Ignore Requirements

Ensure `.gitignore` excludes appropriate local files, including where relevant:

```text
node_modules/
dist/
.env
data/*.db
data/*.sqlite
browser auth state
temporary files
coverage output
```

Do not ignore source code or documentation directories.

---

# Obsidian and Git Constraints

The user's Obsidian Vault is already managed with Git.

Therefore future Markdown generation must be deterministic.

A synchronization run with unchanged source data must not create meaningless file modifications.

Do not design future rendering around timestamps that change on every synchronization.

If an `importedAt` value is eventually written into Markdown, it must represent the original import time and must not be updated on every synchronization.

Stable item identity is required.

A future YouTube note may use a filename pattern such as:

```text
<sourceId> - <sanitized-title>.md
```

The source ID remains the stable identity even if the title changes.

---

# Tests

Add useful automated tests.

At minimum test appropriate parts of:

* `KnowledgeItem` validation;
* synchronization identity based on `source + sourceId`;
* SQLite uniqueness behavior;
* CLI initialization or `--help`, where practical.

Avoid tests that merely verify TypeScript itself.

Tests should provide meaningful protection for future refactoring.

---

# README

Create a concise README.

It should describe:

## Purpose

A local-first tool for collecting saved knowledge and exporting it into an Obsidian Vault.

## Architecture

Document the planned flow:

```text
External Source
      ↓
Collector
      ↓
KnowledgeItem
      ↓
SQLite synchronization state
      ↓
Markdown output
      ↓
Local Obsidian Vault
      ↓
Git managed separately
```

## Current Status

Describe the implemented capabilities and the scope of the current task accurately.

## MVP Direction

Mention that the first planned real integration will be:

```text
YouTube Playlist
      ↓
KnowledgeItem
      ↓
SQLite
      ↓
Markdown
      ↓
Obsidian
```

## Explicitly Out of Scope

Mention:

* Facebook integration;
* AI processing;
* scheduling;
* background execution;
* Git automation;
* web UI;
* Docker;
* cloud infrastructure.

---

# Development Scripts

Provide useful npm scripts for at least:

```text
build
dev
test
typecheck
```

A lint script may be added if an appropriate lint tool is intentionally introduced.

Do not add an excessive toolchain merely to satisfy a script name.

---

# Implementation Constraints

Follow these rules:

1. Keep source-specific code inside `collectors`.
2. Core domain code must not depend on YouTube or Facebook APIs.
3. SQLite stores normalized items and separate synchronization state; item persistence does not record an import.
4. Obsidian Markdown is the future user-facing knowledge output.
5. Git is outside the responsibility of this application.
6. Synchronization is currently manual and infrequent.
7. Prefer simple explicit code.
8. Avoid premature abstraction.
9. Do not create a dependency injection framework.
10. Do not create a general-purpose plugin system.
11. Do not add features not requested by the explicitly assigned task.

---

# Definition of Done

For source or configuration changes, before completing the task:

1. Install dependencies.
2. Ensure the project builds successfully.
3. Run TypeScript typecheck.
4. Run all tests.
5. Verify the CLI starts.
6. Verify:

```bash
knowledge-sync --help
```

works successfully.

7. Report the resulting project directory structure.
8. Report dependencies added.
9. Report important architectural decisions.
10. Report test and typecheck results.
11. Explicitly report any deviation from this specification and explain why it was necessary.

For documentation-only changes, verify paths and references; builds, typechecks,
and tests are not required unless explicitly requested.
