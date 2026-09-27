# Repository agents and skills

This setup supports development of `knowledge-sync`. It does not add agents,
AI processing, background execution, or Git automation to the application.

## Start a session

Read [AGENTS.md](../AGENTS.md), [SESSION_HANDOFF.md](SESSION_HANDOFF.md), the exact
task file named by the user, and `git status --short`. Existing uncommitted work
may belong to an earlier task; preserve it. Reading a task to compare or explain
it is not an instruction to implement it.

Task files are not guaranteed to be in `docs/tasks/`. The current persistence
specification is [task-004.md](../task-004.md). Task 004 adds normalized-item
persistence, independent of import-state tracking, and its implementation is in
the working tree. The earlier state-only policy in AGENTS.md has been reconciled
with that explicitly assigned scope. Later orchestration/output work still needs
its own assignment. Escalate an ambiguity only if the assigned task and user
instructions do not already settle it.

## Roles

| Role | Responsibility | Editing boundary | Relevant skills |
| --- | --- | --- | --- |
| Main agent | Interpret the task, allocate files, integrate work, run final checks, report results | Own shared configuration, dependencies, README and handoff unless explicitly delegated | Any relevant skill; `ks-verify` for final checks |
| [ks_explorer](../.codex/agents/ks_explorer.toml) | Trace current behavior, contracts, existing tests, and scope conflicts | Read-only; returns evidence and recommendations | Persistence or YouTube/OAuth as relevant |
| [ks_implementer](../.codex/agents/ks_implementer.toml) | Implement a bounded change and focused tests | Only files assigned by the main agent | The relevant domain skill plus `ks-verify` |
| [ks_reviewer](../.codex/agents/ks_reviewer.toml) | Independently check correctness, regressions, missing tests, and task scope | Read-only; findings go back to the main agent for fixes | Relevant domain skill; inspect validation using `ks-verify` |

Three roles are available, not required for every task. Prefer one investigator
or reviewer when that is enough. The main agent can implement directly. Models
and reasoning effort are inherited unless the user or environment selects them.
The project configuration caps spawned threads at three; session limits can be
lower. Child agents do not spawn their own teams.

## Delegation and shared files

Give each child a concrete assignment:

```text
Role and objective:
Assigned task file and relevant requirements:
Files you may edit (or read-only):
Inputs, agreed interface, and dependencies on other work:
Explicit exclusions:
Validation you own; checks reserved for the main agent:
Return: changed files or findings with locations, commands/results, unresolved issues.
```

All agents share the working tree. Assign one writer per file, including test
files. Agree on interfaces before splitting dependent work. Do not overwrite or
revert another agent's or the user's edits. Report a required ownership change
to the main agent. A review of work still changing is provisional.

The main agent runs dependency installation, builds, and the final full test
suite after writers finish; do not duplicate them across children. Reviewers
inspect code and existing results without editing or running commands that write
files. If reproduction needs execution, ask the main agent to run the command
or explicitly assign it to an implementer. Wait for delegated results before
reporting completion. Unused roles need not be started.

## Skills

| Skill | Use it for | Entry point |
| --- | --- | --- |
| `ks-persistence` | Domain identity, SQLite/Drizzle storage, row mapping and persistence tests | [SKILL.md](../.agents/skills/ks-persistence/SKILL.md) |
| `ks-youtube-auth` | YouTube collection, Google OAuth, token handling and related CLI errors | [SKILL.md](../.agents/skills/ks-youtube-auth/SKILL.md) |
| `ks-verify` | Task-appropriate validation, regression review and completion evidence | [SKILL.md](../.agents/skills/ks-verify/SKILL.md) |

Skills supply workflows; roles supply responsibility and file ownership. A skill
does not grant extra filesystem/network permissions or authorize the next task.
Neither local credentials nor the real vault/database are test fixtures.

Example requests for a future session:

```text
Use ks_explorer to assess task-004.md and the existing storage lifecycle.
Return a proposal only; do not implement it.

Implement the explicitly assigned persistence task using $ks-persistence.
Delegate an independent review to ks_reviewer, then validate with $ks-verify.
Do not commit or push.

Use $ks-youtube-auth to investigate this refresh failure with mocked transport
errors. Preserve login flow and token persistence.
```

## Discovery and maintenance

The native files are `.codex/config.toml` and `.codex/agents/*.toml`; skill entry
points are `.agents/skills/*/SKILL.md`. Start a new repository session to check
availability. If skills do not appear, restart the client. Project configuration
is subject to the client's trust and policy settings; these files do not bypass
them. This session's already-created agents do not prove native role discovery
in a later session.

When a runtime cannot select a custom role directly, pass that TOML file's
`developer_instructions` and this workflow in the delegation prompt. Skills can
be read directly when discovery is unavailable. Do not install extra plugins or
change global settings just to use these repository instructions.

Keep role instructions in TOML, specialized guidance in the skill entry points,
and this document as the role/skill map. Update the handoff with actual observed
state and distinguish fresh checks from historical results. Add roles or skills
only after a recurring task justifies them.

The layout follows official OpenAI documentation for
[custom sub-agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
and [repository skills](https://learn.chatgpt.com/docs/build-skills).
