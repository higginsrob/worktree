# worktree

Locked-down, isolated Docker development environments built around `git worktree`.

Each worktree session is a real host `git worktree`, backed by a Docker named volume,
running inside a `--read-only`, unprivileged container with **tmux and vim already
running inside it**. The host CLI (`wkt`) only handles lifecycle: create, attach, sync
files back, promote commits, list, and clean up disk space. There's no AI tooling, no
custom image system, and no interactive dashboard — just a thin, scriptable wrapper
around `git worktree` + Docker isolation.

- **CLI:** `@higginsrob/worktree` → bin `wkt`
- **Default image:** `higginsrob/worktree:latest` (Docker Hub)
- **License:** MIT

See [`docs/mental-model.md`](docs/mental-model.md) for the full design, or
[`docs/security.md`](docs/security.md) for the isolation guarantees.

## Requirements

- Docker (with a running daemon)
- git
- Node.js ≥ 20

## Install

```sh
npm install -g @higginsrob/worktree
wkt doctor   # checks docker, git, node, disk space
```

## Quick start

```sh
# one-time: build the devcontainer image locally
wkt build-image

# from inside any git repo with an "origin" remote:
wkt add my-feature       # git worktree add + volume + container + attach
```

`wkt add` creates a host git worktree, seeds a Docker volume with a sanitized clone of
your repo (no embedded credentials, no credential helper — it can never push
anywhere on its own), starts a locked-down container mounting that volume, and attaches
you to a tmux session inside it: vim in the main pane, a shell in a secondary pane.

Inside the container, edit and commit freely. To bring that work back out:

```sh
wkt sync            # copy uncommitted working-tree files back to the host
wkt git promote      # bring committed history back onto the host worktree
wkt git push         # promote, then push using your host's own git credentials
```

List, reattach, and clean up:

```sh
wkt list             # name, branch, container status, volume size
wkt open my-feature   # reattach (recreates the container if it's gone)
wkt rm my-feature      # remove container + volume + git worktree
```

Full command reference: [`docs/cli.md`](docs/cli.md).

## Why a Docker volume, not a bind mount?

Bind mounts are slow for dense trees (especially on Docker Desktop), and a named
volume lets the container run fully `--read-only` without exposing the host
filesystem. The trade-off: your work lives in Docker storage until you `wkt sync`
(files) or `wkt git push` (commits). See [`docs/mental-model.md`](docs/mental-model.md).

## Isolation

- No `docker.sock`, no SSH agent, no host `~/.gitconfig` mounted in the container.
- Git identity is injected as `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env only.
- `--read-only` root filesystem, `--security-opt no-new-privileges`.
- Fetch/pull/push always run on the **host**, using the host's own credentials.

Details: [`docs/security.md`](docs/security.md).

## tmux inside the container

Mouse-clickable statusline: new window / split panes, a WORKSPACE label, and a
read-only GIT badge (branch, colored by clean/dirty/ahead/behind/diverged). See
[`docs/statusline.md`](docs/statusline.md).

## Building the image yourself

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
