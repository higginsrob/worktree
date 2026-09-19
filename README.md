# worktree

`git worktree` sessions with a consistent tmux+vim environment — on your
host by default, or sandboxed in a locked-down Docker container with
`--sandbox`.

Each worktree is a real host `git worktree` with tmux and vim already
running inside it. By default that tmux session runs directly on your
machine (`host` mode) — the fastest path, and the right choice when you
trust what you're about to run. Pass `--sandbox` to instead run it inside a
`--read-only`, unprivileged container backed by a Docker named volume, for
anything you don't fully trust (an AI agent, unfamiliar build tooling, a
project's own postinstall scripts). Both modes get the identical tmux/vim
environment — see [`docs/editor.md`](docs/editor.md). The host CLI (`wkt`)
only handles lifecycle: create, attach, list, and (for `--sandbox`) sync
files back, promote commits, and clean up disk space. There's no AI tooling,
no custom image system, and no interactive dashboard — just a thin,
scriptable wrapper around `git worktree` (+ optional Docker isolation).

- **CLI:** `@higginsrob/worktree` → bin `wkt`
- **Default image:** `higginsrob/worktree:latest` (Docker Hub)
- **License:** MIT

See [`docs/mental-model.md`](docs/mental-model.md) for the full design, or
[`docs/security.md`](docs/security.md) for the isolation guarantees.

## Requirements

- git, tmux, vim
- Node.js ≥ 20
- Docker (only needed for `--sandbox`)

## Install

```sh
npm install -g @higginsrob/worktree
wkt doctor   # checks git, tmux, vim, node, disk space (docker is optional)
```

## Quick start

```sh
# from inside any git repo:
wkt add my-feature       # git worktree add + host tmux session, opens immediately
```

`wkt add` creates a host git worktree and attaches you to a tmux session
running right there: vim in the main pane, a shell in a secondary pane. It's
your own worktree, your own git credentials — `wkt git push`, `wkt git pull`,
etc. are ordinary host git operations scoped to that path.

List, reattach, and clean up:

```sh
wkt list             # name, branch, mode, running/not, size
wkt open my-feature   # reattach
wkt rm my-feature      # remove the tmux session + git worktree
```

### Sandboxed mode

For anything you don't fully trust — an AI agent, unfamiliar build tooling, a
project's own postinstall scripts — add `--sandbox` to run the worktree
inside a locked-down Docker container instead:

```sh
wkt build-image           # one-time: build the devcontainer image locally
wkt add my-feature --sandbox   # git worktree add + volume + container + attach
```

This seeds a Docker volume with a sanitized clone of your repo (no embedded
credentials, no credential helper — it can never push anywhere on its own)
and starts a locked-down container mounting that volume. Inside it, edit and
commit freely; bring that work back out with:

```sh
wkt sync            # copy uncommitted working-tree files back to the host
wkt git promote      # bring committed history back onto the host worktree
wkt git push         # promote, then push using your host's own git credentials
```

Full command reference: [`docs/cli.md`](docs/cli.md); the two modes are
compared in [`docs/mental-model.md`](docs/mental-model.md).

## Why a Docker volume, not a bind mount? (`--sandbox`)

Bind mounts are slow for dense trees (especially on Docker Desktop), and a named
volume lets the container run fully `--read-only` without exposing the host
filesystem. The trade-off: your work lives in Docker storage until you `wkt sync`
(files) or `wkt git push` (commits). See [`docs/mental-model.md`](docs/mental-model.md).

## Isolation (`--sandbox`)

Host-mode worktrees have none of this — they're just your own shell, same
trust level as running `vim`/`tmux` yourself. `--sandbox` worktrees get:

- No `docker.sock`, no SSH agent, no host `~/.gitconfig` mounted in the container.
- Git identity is injected as `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env only.
- `--read-only` root filesystem, `--security-opt no-new-privileges`.
- Fetch/pull/push always run on the **host**, using the host's own credentials.

Details: [`docs/security.md`](docs/security.md).

## tmux, everywhere

Mouse-clickable statusline: new window / split panes, a WORKSPACE label, and a
read-only GIT badge (branch, colored by clean/dirty/ahead/behind/diverged) —
identical whether the session is running on the host or `--sandbox`ed in
Docker. See [`docs/statusline.md`](docs/statusline.md).

## Editor setup

vim ships with fzf, fugitive, commentary, JS/TS/JSX/Markdown/YAML/TOML syntax,
a tokyonight colorscheme, and Ctrl-hjkl navigation that moves seamlessly
between vim splits and tmux panes — the same on the host and in `--sandbox`,
without ever touching your own `~/.vimrc`. See [`docs/editor.md`](docs/editor.md).

## Building the sandbox image yourself

```sh
wkt build-image     # or: make build-image
```

## Development

```sh
npm install
npm run build   # tsc
npm run lint
npm run format
```

## License

MIT
