# AGENTS.md

Shared working agreement for AI coding agents on this repo (Claude Code, Google
Antigravity, and any other agent). `CLAUDE.md` imports this file, so there is
exactly one source of truth — edit **this** file, never the stub.

## What this project is

An **Anki add-on** that imports Quizlet study sets into Anki, including audio,
images and diagram ("shapes") decks. It is distributed as a `.ankiaddon` zip and
runs *inside* Anki's own Python environment.

AnkiWeb package id: `1362209126` (see `manifest.json`).

## File map

| Path | Ships? | Role |
|---|---|---|
| `__init__.py` | ✅ | **The entire add-on.** Qt dialog, Quizlet scraper/parser, media downloader, Anki note creation. |
| `config.json` | ✅ | Add-on config schema — `qlts` and `cookies`. **Must stay empty in git.** |
| `meta.json`, `manifest.json` | ✅ | Anki add-on metadata. |
| `__original_init__.py` | ❌ | Frozen copy of the upstream original add-on, kept for diffing. Do not "fix" it. |
| `__polygon__.py` | ❌ | Standalone scratch script for parser work; reads `examples/2.html` offline. Not importable by Anki. |
| `examples/*.json`, `examples/*.html` | ❌ | Captured Quizlet payloads/pages used to develop the parser without hitting the network. |
| `build.sh` | ❌ | Packages the four shipping files into `quizlet_importer.ankiaddon`. |

If you add a file that must ship, you **must** also add it to the `cp` line in
`build.sh` — otherwise it silently never reaches users.

## Build

```bash
./build.sh    # -> quizlet_importer.ankiaddon (gitignored)
```

That is the whole pipeline. There is no package manager, no lockfile, no
`requirements.txt`: every import must be either stdlib or something Anki already
bundles (`requests`, `aqt`, `anki`, PyQt).

## Testing & verification

There are **no tests and no CI**. Do not claim a change is verified because it
"looks right". What you can actually do:

1. **Parser changes** — exercise them against `examples/` offline. `__polygon__.py`
   is the pattern: load a fixture, run the mapping functions, print the result.
2. **Import-time sanity** — `python -c "import ast; ast.parse(open('__init__.py').read())"`
   catches syntax errors. You cannot `import __init__` outside Anki; `aqt`/`anki`
   do not exist there.
3. **Anything touching the Qt dialog or note creation** — only verifiable by
   installing the built `.ankiaddon` in a real Anki. If you cannot do that, say so
   plainly in your summary rather than implying it was tested.

## Conventions and constraints

- **Keep the add-on single-file.** `__init__.py` is large, but splitting it means
  touching the packaging and the Anki import path. Don't refactor it into modules
  as a side effect of another task.
- **Quizlet's HTML/JSON changes without warning.** Parsing code is defensive on
  purpose (`try`/`except`, `.get()`, fallbacks). Preserve that; a "cleanup" that
  turns a `.get()` into `[...]` is a regression.
- **The proxy fallback is load-bearing.** `quizlet-proxy.proto.click` is the retry
  path when a direct fetch is blocked (`proxyRetry` in `QuizletDownloader`). Don't
  remove it while simplifying.
- **Secrets never land in git.** `config.json` holds the user's `qlts` token and
  cookies. Both stay `""` in the repo. If you need real values to reproduce a bug,
  keep them out of files, commits and diffs.
- Match the surrounding style (4-space indent, existing naming). The file mixes
  `camelCase` and `snake_case`; follow whichever the neighbouring code uses rather
  than renaming things.
- New behaviour goes in the changelog comment block at the top of `__init__.py`,
  newest entry first.

## Multi-agent coordination

More than one agent may be working on this repo at the same time, from different
machines, and **they cannot see each other's working directories.**

- **Git is the only channel.** Work that isn't pushed does not exist for the other
  agent. Push before handing off, and `git fetch` before assuming you are current.
- **One agent per branch.** Use separate branches, or separate `git worktree`
  checkouts if running in parallel on one machine:
  ```bash
  git worktree add ../quizlet-antigravity feature/x
  git worktree add ../quizlet-claude      feature/y
  ```
- **Never force-push a branch you did not create**, and never rewrite history on a
  branch another agent may have checked out. Merge, don't rebase, across agents.
- **`__init__.py` is one giant file — it is the contention point.** Two agents
  editing it concurrently will clobber each other with no warning. Agree on who
  owns it for a given task; if you need it and aren't sure, say so instead of
  editing.
- Cloud/remote sessions get a **fresh clone** and are discarded afterwards.
  Anything not committed and pushed is lost.
- When you finish, state what you changed, what you verified, and what you did
  **not** verify. The next agent reads that, not your reasoning.
