# worktree — project plan

Locked-down, isolated Docker development environments built around `git worktree`. Unlike the sibling project [`hvim`](https://github.com/higginsrob/vim), **tmux and vim both live inside the container**. The host CLI's only job is worktree/container lifecycle: create, attach, sync files back, promote commits, monitor, and clean up disk space. No AI features (no ollama chat integration, no omniVoice, no speak, no in-editor AI pane) — this project is scoped strictly to git-worktree + devcontainer isolation.

- **CLI:** `@higginsrob/worktree` → bin `wkt`
- **Default image:** `higginsrob/worktree:latest` (Docker Hub, built from this repo's `docker/Dockerfile`)
- **Distribution:** npm (`npm install -g @higginsrob/worktree`)
- **License:** MIT

---

## 1. Decisions locked in this planning session

| # | Decision | Choice |
|---|---|---|
| 1 | Git commit/push model | **Git-native promote**, same shape as hvim: a sanitized, credential-free clone lives in the container; commits happen in-container; `wkt git promote`/`wkt git push` bundles those commits onto the host worktree and pushes with the host's own git credentials. |
| 2 | Ollama runtime | **Included** in the devcontainer image as a plain binary/runtime (for the user's own tools, e.g. locally-installed agent CLIs) — but with **zero** custom integration: no statusline badges, no model management, no wrapper commands. |
| 3 | Custom per-project images | **Not in v1.** One official fixed image only. No `./worktree/Dockerfile` override, no per-project `config.json`, no in-container "client" package for compatibility checks. Ports/env can still be set via CLI flags at `wkt open` time. |
| 4 | CLI binary name | **`wkt`** (avoids the common `wt` alias collision, stays distinct from `git worktree`). |
| 5 | Host-side UX | **Plain argv CLI**, no interactive dashboard. `wkt list` prints a table and exits. The "TUI" experience of the project lives entirely in tmux + vim *inside* the container; the host CLI is a thin, scriptable lifecycle tool. |
| 6 | Disk cleanup scope | **wkt-managed resources only.** `wkt clean` prunes only containers/volumes/image layers this tool created and tracks in its own state file. Never touches unrelated Docker resources on the host. |
| 7 | Default tmux layout on `wkt open` | **Vim + shell split** — one window, vim in the main pane, a shell in a secondary pane. |
| 8 | Global tool bootstrap (claude-code, opencode, etc.) | **Entirely manual.** wkt never installs global tools; users `npm install -g ...` themselves once attached. Keeps wkt's scope to worktree/container lifecycle only. |
| 9 | Statusline scope | **TMUX controls + a read-only GIT badge.** New-window / window-tabs / split-h / split-v, plus a WORKSPACE label and a GIT badge (branch + clean/dirty/ahead/behind, click → status popup). No push/pull/sync actions live in the statusline — those are host-only commands. |
| 10 | Naming | npm `@higginsrob/worktree` (bin `wkt`), Docker Hub `higginsrob/worktree:latest`. |

---

## 2. Mental model

hvim split control-plane (host tmux) from data-plane (read-only container). worktree collapses that: **the container is both** — it's a fully self-contained, tmux+vim IDE you attach to over `docker exec`. The host CLI is deliberately thin:

```
Host (wkt CLI)
  git worktree lifecycle, docker run/exec, sync, promote/push, list, clean
  no tmux required on the host — attach is just `docker exec -it <container> tmux ...`
  no SSH keys, no docker.sock inside any container, no credential helpers shared in

Container  (--read-only, no-new-privileges, unprivileged)
  tmux server + vim + full toolchain, all interaction happens here
  sanitized credential-free git clone
  no docker.sock, no SSH, no access to any other project's volume
```

A **worktree session** is 1:1 with:

1. A real host `git worktree` path (`git worktree add`)
2. A Docker named volume seeded from that path only (`/workspace/<repo>`)
3. A container mounting that volume, `--read-only`, running a persistent tmux server
4. A shared home volume (`wkt-home`) mounted at `$HOME` for global tool installs, shared across **all** worktrees/projects

### Why named volumes (not bind mounts)

Same reasoning as hvim: bind mounts (especially on Docker Desktop) are slow for dense trees, and a named volume lets us safely apply `--read-only` + tmpfs without exposing the host filesystem. Trade-off: work lives in Docker storage until you `wkt sync` (files) or `wkt git push` (commits).

### Isolation guarantees

- Each container mounts **exactly one** project volume — never another worktree's.
- The shared `wkt-home` volume is the **only** thing every container has in common; it holds npm globals, dotfiles, and any tool the user installs (`claude-code`, `opencode`, etc.). Containers cannot see or modify each other's project volumes, and cannot modify the image's system files (read-only root FS).
- No `docker.sock` in any container — a container can never control Docker itself (no privileged execution, no spawning siblings, no escaping its own sandbox).
- No `~/.ssh`, no `SSH_AUTH_SOCK`, no host `~/.gitconfig` bind-mounted. Git identity is injected as `GIT_CONFIG_*` / `GIT_AUTHOR_*` env only.
- `--read-only` root filesystem + `--security-opt no-new-privileges`. Writable: project volume, home volume, and tmpfs `/tmp` + `/var/tmp`.
- Fetch/pull/push run on the **host**, using the host's own credential helper / agent — never inside the container.

---

## 3. Git-native worktree + promote pipeline (decision #1)

```
wkt add <branch>
  → git worktree add ~/.local/share/wkt/worktrees/<org>/<repo>/<branch>  (on host)
  → docker volume create wkt-vol-<org>-<repo>-<branch>
  → seed the volume from that host worktree path (rsync, one-time, host → volume)
  → volume's .git becomes a SANITIZED clone: no remotes with tokens, no credential helper config
  → docker run --read-only ... (project volume + wkt-home) → container up
  → wkt open <name>   (attach)
```

Inside the container the user edits, builds, tests, and **commits** freely (vim-fugitive or `git commit` in a shell pane) against that sanitized clone. Nothing in the container can push anywhere — there's no remote credential available to it.

```
wkt sync [name]              # rsync non-.git file changes: volume → host worktree (working-tree-only sync)
wkt git promote [name]       # git bundle the volume's new commits → fetch them into the host worktree
wkt git push [name]          # promote, then `git push` on the host (host credentials)
wkt git pull / fetch / status  [name]   # ordinary host git, scoped to that worktree's path
wkt reset [name]             # host worktree → volume (re-seed + re-clone sanitized .git; destructive to container-only work)
```

This mirrors hvim's `promote` pipeline exactly, just invoked from the host CLI instead of a host-tmux GIT menu (since there is no host tmux here). `wkt sync` and `wkt git promote` are independent: sync moves *working tree* file changes, promote moves *committed* history. Both are manual/on-demand — no background daemon.

---

## 4. Devcontainer image

Single official image, `higginsrob/worktree:latest`, built from `docker/Dockerfile` in this repo. Ubuntu 24.04 base (matches hvim's proven toolchain footprint).

**Included:**

- node.js (22.x LTS via NodeSource) + npm, with `NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS=true` and `NPM_CONFIG_PREFIX` pointed at the home volume so global installs (`npm install -g @anthropic-ai/claude-code`, `opencode`, etc.) land on `wkt-home`, not the read-only image
- bun
- tmux
- vim (vim-nox, so it has clipboard/python/etc. support) with a minimal committed `.vimrc` (fugitive, sensible defaults — **no** AI-pane leader bindings; those were hvim-only)
- python3, pip, venv
- uv (astral)
- ollama (runtime binary only — see decision #2)
- build-essential
- zsh + oh-my-zsh
- fzf
- ripgrep
- rsync (needed as the seed/sync helper)
- unzip
- jq
- git, curl, ca-certificates, less, file, locales (base utilities, same as hvim's Dockerfile)
- an `osc52-copy` helper script so tmux copy-mode / vim yanks can reach the host terminal's real clipboard over the `docker exec -it` PTY (this is a plain clipboard passthrough, unrelated to the removed AI features — carried over from hvim as a usability item)

**Explicitly excluded vs. hvim:** omniVoice, `speak`, the `chat` TUI, the `hvim-client` package, the Ollama statusline/model-role config system, the AI pane / buffer sidecar, the `HVIMTOGGLE_AI` / `HVIMSPLIT_*` window-rename signal channel (that channel existed only because host tmux needed to talk to in-container vim; with tmux inside the container that whole mechanism is unnecessary).

**Entrypoint:** container PID 1 is `sleep infinity` (kept alive independent of tmux attach state, same as hvim). `wkt open` does:

```
docker exec -it <container> tmux new-session -A -s main -c /workspace/<repo>
```

`-A` attaches if the tmux server/session already exists, or creates it (with the default vim+shell split) if this is the first attach. The tmux server persists across detach — killing all attached clients doesn't kill the session, only stopping the container does.

---

## 5. tmux config (inside the container)

Default session `main`, one window, split into a main pane (vim) and a secondary pane (shell) — decision #7. Mouse mode on (for clicking statusline badges and resizing), `set-clipboard on` for OSC 52.

**Statusline badges (decision #9):**

| Badge | Shows | Click |
|---|---|---|
| **+** (green) | New window | Open a new shell window |
| **Window tabs** | `#I:#W` | Select that window |
| **-** (yellow) | Split horizontal | `split-window -v` |
| **\|** (cyan) | Split vertical | `split-window -h` |
| **WORKSPACE** | `org/repo` · branch | Informational only — copies the name |
| **GIT** | Branch; color = clean / dirty / ahead / behind / diverged | Popup: `git status -sb` output. **Read-only** — no push/pull/sync actions here; those are host-only (`wkt sync`, `wkt git push`) |

No model/ctx/reason/AI/tts badges, no todo stack, no chat skills — all of that was hvim-only.

---

## 6. CLI command surface

```
wkt                                   # help
wkt add <branch>                      # git worktree add + volume + container + tmux session (creates + opens)
wkt open [name] [options]             # attach to an existing worktree (or create if missing, name prompted if omitted)
  --no-create                         #   fail instead of creating if the volume doesn't exist
  --pull                              #   check the image digest on Docker Hub before starting
  --rebuild                           #   rebuild the local devcontainer image from docker/Dockerfile
  -p, --port, --publish <spec>        #   publish ports (docker run -p semantics, repeatable)
  --host                              #   --network=host
wkt list [--all]                      # table: name, branch, container status, volume size, last synced
wkt sync [name] [--dry-run] [--delete] [--yes]   # rsync file changes: volume → host worktree (not .git)
wkt git promote [name]                # bundle in-container commits → fetch onto host worktree
wkt git push [name]                   # promote, then git push on host
wkt git pull | fetch | status [name]  # ordinary host git scoped to that worktree
wkt reset [name] [--yes]              # host worktree → volume (re-seed, re-clone sanitized .git)
wkt reset-home [--yes]                # delete + recreate the shared wkt-home volume (stops all containers first)
wkt rm <name> [--yes]                 # remove container + volume (+ managed git worktree if wkt created it)
wkt clean [--yes] [--dry-run]         # prune only wkt-managed stopped containers / orphaned volumes / dangling image layers
wkt doctor                            # check host deps: docker, git, node, disk space
wkt build-image                       # build higginsrob/worktree:latest locally from docker/Dockerfile
wkt exec [cmd...]                     # docker exec helper into the current/named worktree's container
```

Unknown subcommands are errors, not implicit `add`/`open` calls (avoid hvim's footgun class of `hvim ls` typos — but note `wkt` requires an explicit verb, it never falls back to treating an unknown word as a name).

---

## 7. State & config files (host side)

- `~/.config/wkt/state.json` — tracked containers/volumes/worktrees this CLI created (source of truth for `wkt list` / `wkt clean` scoping — never touch anything not in this file)
- `~/.local/share/wkt/worktrees/<org>/<repo>/<branch>` — host git worktree paths managed by `wkt add`
- Docker volume naming: `wkt-vol-<org>-<repo>-<branch>` (project), `wkt-home` (shared, singular, across all projects)
- Container naming: `wkt-<org>-<repo>-<branch>`

---

## 8. Repo / package structure

Single npm package (no `packages/cli` + `packages/client` split — that split existed in hvim to support custom images and an in-container AI client; both are out of scope here per decisions #2/#3).

```
worktree/
  bin/wkt                     # shebang entry
  src/
    commands/                 # add, open, list, sync, git.ts, reset, reset-home, rm, clean, doctor, build-image, exec
    docker.ts                 # docker run/exec/volume/image wrappers
    git.ts                    # worktree add, bundle/promote, sanitized-clone seeding
    state.ts                  # ~/.config/wkt/state.json read/write
    config.ts                 # paths, XDG locations
  docker/
    Dockerfile
    tmux.conf
    vimrc
    zshrc
    bin/osc52-copy
  docs/
    mental-model.md
    security.md
    statusline.md
    cli.md
  package.json                # @higginsrob/worktree, bin: { "wkt": "./bin/wkt" }
  tsconfig.json
  eslint.config.js
  prettier.config.js
  Makefile                    # make build-image, etc.
  README.md
```

Language/tooling: TypeScript + `tsc`, ESLint (`typescript-eslint`), Prettier, `commander` for argv parsing — same toolchain hvim already proved out. `engines.node >= 20`.

---

## 9. Build order (milestones)

1. **Scaffold** — package.json, tsconfig, eslint/prettier configs, `bin/wkt` entry, `commander` skeleton with all subcommands stubbed (`wkt doctor` first, since it validates the dev loop).
2. **Docker image** — `docker/Dockerfile` + `tmux.conf` + `vimrc` + `zshrc`, `wkt build-image` / `make build-image`. Verify manually: `docker run --read-only -it higginsrob/worktree:latest` boots, tmux attach works, all listed tools present.
3. **Worktree lifecycle** — `wkt add`, `wkt open`, `wkt list`, `wkt rm`. Volume seeding + sanitized-clone creation.
4. **Sync & promote** — `wkt sync`, `wkt git promote/push/pull/fetch/status`, `wkt reset`.
5. **Housekeeping** — `wkt reset-home`, `wkt clean`, state-file tracking hardened so cleanup never touches non-wkt resources.
6. **Statusline & vim polish** — tmux status bar badges/click menus, vimrc defaults, OSC 52 clipboard.
7. **Docs + npm publish** — README, docs/*, `npm publish` dry run, Docker Hub image push.

---

## 10. Open items deferred (not v1)

- Custom per-project images (`./worktree/Dockerfile` override) — revisit once the single official image is proven out.
- Any interactive host-side dashboard — start with plain table output; an Ink-based dashboard is a plausible v2 if `wkt list` output becomes unwieldy at scale.
- Optional global-tool bootstrap config — user-driven manual installs for now.
