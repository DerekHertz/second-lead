# Second Lead

A Mandarin learning app: the learner acts out a scene from a show they love while an AI plays the other characters. Vocabulary lives in `CONTEXT.md`; use its terms. Decisions live in `docs/adr/`. What the MVP is and the build order: `docs/mvp.md`. How the experiment is judged: `docs/experiment.md`.

Work is tracked as GitHub Issues on this repo and run through Dim Sum Dev roles (the `den` plugin): tickets, hand-offs and the relay follow its team protocol.

## Agents (den kit)

This project is built by the den's roles, loaded with `claude --plugin-dir <den>/.claude` as `den:<role>`. Every agent follows the `den:team-protocol` skill.

- Code tickets run a relay: `developer` writes the failing tests first, then `code-reviewer` and `qa` (verify) review the same commit; one fix round carries both reviews. Then `den risk-check`: a clean exit skips `security`, a hit dispatches it. Push, PR and merge on green CI follow.
- The board is **GitHub Issues on this repo**, not `.scratch/` (see "Board on GitHub" below); tests run with `den test <files>`.

Everything in `den:team-protocol` applies here; swap the den's commands for the `den` command on PATH:

| In the den | In another project |
|---|---|
| `npm run board -- <cmd> ...` | `gh issue ...` (see "Board on GitHub") |
| `npm run test:path -- <files>` | `den test <files>` (the project's own test command, from `.den/project.json`) |
| `npm run risk-check` | `den risk-check` |
| `node scripts/usage.mjs --provider claude` | `den usage --provider claude` |

- The risk path is `.claude/`, `CLAUDE.md`, `.den/`, `.github/`, dependency and lockfile changes, secrets handling, and every file in `.den/project.json`'s `guardrailPaths`.
- Den-only tools (`node scripts/jg.mjs`, `node scripts/test-guard.mjs`, `npm run pr-map`, `npm run -s session-check`, `npm run verify:ui`, `den:update`) don't exist there: skip them and say so in your handoff. Den docs (`docs/agents/*`, the den's ADRs) are not in that repo; the rules they back are the ones in `den:team-protocol` and your role.
- Roles load as `den:<role>`; you still sign the board as the bare role (`--as qa`, `claim <ref> qa`).
- The user approves new dependencies, accounts and keys, changes to `.claude/`, `CLAUDE.md`, `.den/` and CI, and gives every visual verdict.

## Board on GitHub

A ticket is a GitHub issue; its status is a label. `den board` does not apply here; use `gh` against `DerekHertz/second-lead`:

| `team-protocol` step | Here |
|---|---|
| Ready | open, label `ready-for-agent`, every issue in its "Blocked by" closed |
| Claim | check it has no `claimed`/`in-review` label, then `gh issue edit <n> --add-label claimed --remove-label ready-for-agent` and comment `Claimed by <role>` |
| Comment | `gh issue comment <n> --body-file <file>` |
| Verdict | a comment whose first line is `Verdict (<role>): pass` or `Verdict (<role>): bounce` |
| Handoff | a comment starting `## Handoff: <role>`, holding the `handoff` skill's sections |
| Release to review | `--add-label in-review --remove-label claimed` |
| Resolved | the PR body says `Closes #<n>`; the issue closes when the PR reaches `main` |
| Needs the user | label `ready-for-human` and a `**Question:**` line |

## Pull requests

- PR bodies follow `den:pr-writing` (What changes, System map, Risk, Evidence). `npm run pr-map` doesn't exist here: the System map is `docviz pr <steps.json> --pr <url> --glossary CONTEXT.md`, posted as its own PR comment; the body's System map section links to it.
- PRs are **stacked**: each ticket's branch is based on the branch below it, and the bottom PR targets `main`. Once a PR is green and reviewed, the chief of staff merges it into the branch below. Only the user merges the bottom PR into `main`.
