# CLI reference

Unknown subcommands are errors — `wkt` never falls back to treating an unknown
word as a worktree name. Most commands take an optional `[name]`; if omitted and
exactly one worktree exists, that one is used, otherwise you're asked to specify.
A worktree's `name` is `org/repo/branch` (as printed by `wkt list`).

## Lifecycle

### `wkt add <branch>`

`git worktree add` on the host, creates a project volume, seeds it with a
sanitized clone checked out to `<branch>`, starts the container, and attaches.
Fails if a worktree with that name already exists (`wkt open` instead).

### `wkt open [name] [options]`

Attaches to an existing worktree, restarting its container if stopped or
recreating it if missing (unless `--no-create`).

| Option                                   | Effect                                                           |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `--no-create`                            | Fail instead of creating/recreating a missing container          |
| `--pull`                                 | `docker pull` the image before starting                          |
| `--rebuild`                              | Rebuild the local image from `docker/Dockerfile` before starting |
| `-p, --port <spec>` / `--publish <spec>` | Publish a port (`docker run -p` semantics), repeatable           |
| `--host`                                 | `--network=host`                                                 |

### `wkt list [--all]`

Prints a table: name, branch, container status, volume size, last synced.
`--all` includes worktrees whose container doesn't exist (stopped/cleaned).

### `wkt rm <name> [--yes]`

Removes the container, the volume, and the host git worktree, and drops the
`state.json` entry. Prompts for confirmation unless `--yes`.

## Bringing work out of the container

### `wkt sync [name] [--dry-run] [--delete] [--yes]`

Rsyncs working-tree files (never `.git`) from the project volume onto the host
worktree path. `--delete` also removes host files that no longer exist in the
container (prompts for confirmation unless `--yes` or `--dry-run`).

### `wkt git promote [name]`

Bundles commits that exist in the container's clone but not yet on the host,
and fast-forwards the host worktree onto them. Safe to run repeatedly — a no-op
when there's nothing new.

### `wkt git push [name]`

Runs `wkt git promote`, then `git push` **on the host**, using the host's own
credentials. Sets `-u origin <branch>` automatically on a branch's first push.

### `wkt git pull [name]` / `wkt git fetch [name]` / `wkt git status [name]`

Ordinary host `git pull`/`fetch`/`status`, scoped to that worktree's path.

## Destructive / housekeeping

### `wkt reset [name] [--yes]`

Discards any container-only work (uncommitted or unpromoted) by removing the
container and volume and re-seeding from the host repo's current state.

### `wkt reset-home [--yes]`

Removes every wkt container (they recreate on next `wkt open`) and deletes +
recreates the shared `wkt-home` volume — npm globals, dotfiles, anything
installed there. Project volumes are untouched.

### `wkt rm <name> [--yes]`

See above.

### `wkt clean [--yes] [--dry-run]`

Removes wkt-managed stopped containers (their volume — the real data — is
untouched, `wkt open` recreates them), volumes matching wkt's naming convention
with no matching `state.json` entry (orphaned), and dangling image layers built
from `docker/Dockerfile`. Never touches anything outside that scope.

## Setup / image

### `wkt doctor`

Checks docker, git, node version, and disk space.

### `wkt build-image`

Builds `higginsrob/worktree:latest` locally from `docker/Dockerfile`
(`make build-image` is equivalent).

### `wkt exec [cmd...]`

Not yet implemented.

## State

- `~/.config/wkt/state.json` — every worktree this CLI knows about; the source of
  truth for `wkt list`/`wkt clean` scoping.
- `~/.local/share/wkt/worktrees/<org>/<repo>/<branch>` — host git worktree paths.
- Docker volumes: `wkt-vol-<org>-<repo>-<branch>` (per project), `wkt-home`
  (shared, one, across everything).
- Containers: `wkt-<org>-<repo>-<branch>`.
