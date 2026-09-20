# CLI reference

Unknown subcommands are errors — `wkt` never falls back to treating an unknown
word as a worktree name. Most commands take an optional `[name]`; if omitted and
exactly one worktree exists, that one is used, otherwise you're asked to specify.
A worktree's `name` is `org/repo/branch` (as printed by `wkt list`).

Every worktree is either `host` (the default — runs directly on your
machine) or `sandbox` (`--sandbox` — runs in an isolated Docker container).
Mode is chosen once, at `wkt add` time, and fixed for that worktree's
lifetime — see [`mental-model.md`](mental-model.md).

## Lifecycle

### `wkt add <branch> [--sandbox]`

`git worktree add` on the host, then attaches a tmux session. With
`--sandbox`, also creates a project volume, seeds it with a sanitized clone
checked out to `<branch>`, and starts a container before attaching. Fails if
a worktree with that name already exists (`wkt open` instead), or if
`<branch>` is already checked out somewhere `git worktree` can see — most
commonly right here, in the repo you ran `wkt add` from. In that last case
the error points you at `wkt open <name>` instead (see below).

### `wkt clone <org/repo | url>`

Clones into `$HOME/Github/<org>/<repo>` (`org/repo` means
`https://github.com/org/repo.git`; a full URL also works, and lands under the
org/repo parsed from it), then runs `wkt open` from that directory. If the
directory already exists it just opens it.

### `wkt open [name] [options]`

`wkt open org/repo` (two segments, not a tracked worktree name) does the same
as `wkt clone org/repo`: clones to `$HOME/Github/<org>/<repo>` if missing, then
opens from there.

Attaches to an existing worktree. For a `--sandbox` worktree, recreates its
container if missing (unless `--no-create`); containers run with `--rm`, so
when the last tmux session ends (exit the final shell) the container is
stopped and removed, and the next open starts fresh from the current image.
For a `host` worktree there's nothing to create — it attaches (or
reattaches) to the host tmux session directly. Detaching (`Ctrl-b d`) leaves
either kind running.

If `name` isn't tracked yet, `wkt open` tries two fallbacks before giving up,
in order: (1) if it matches the git worktree at `$PWD` (the untracked row
`wkt list` shows for it), **adopt** it — register the existing directory as
a `host` worktree, no new `git worktree add`, since it's already a perfectly
good one; (2) if it names a local branch of the repo at `$PWD` that isn't
checked out anywhere, **create** a new host worktree for it (same as
`wkt add <branch>`). Either way it then attaches. This is what makes
`wkt open <name>` work both for a repo's original checkout (which `wkt add`
can't create a worktree for — a branch can't be checked out twice) and for
any other branch already on the host that never got its own worktree.
`--no-create` disables fallback (2).

With `name` omitted and stdin/stdout attached to a terminal, `wkt open` shows
a picker (same table shape as `wkt list`, plus one row per local branch of
the repo at `$PWD` that isn't a worktree yet, marked `branch (new)`):
`↑`/`↓` or vim `k`/`j` to move, `Enter` to open, `D` to delete the
highlighted worktree (asks `[y/N]` first, then removes it the same way
`wkt rm` does), `Esc`/`q`/`Ctrl-C` to cancel. `D` only works on a real
tracked worktree — it's a no-op (with a message) on the untracked
current-dir row or a `branch (new)` row, since there's nothing to delete
there yet. Picking a `branch (new)` row creates a new host worktree for it
on the spot — this is what lets `wkt open` double as "turn a branch already
on the host into a worktree" without typing `wkt add`. `--no-create` leaves
those rows out of the picker, same as it disables fallback (2) above.
The picker lists the `$PWD` checkout and its local branches first as their
own group, followed by the other worktrees. `wkt open --branch` shows only
that group; `wkt open --no-branch` shows only worktrees and leaves out the
`branch (new)` rows.
Without a TTY (piped input, scripts, CI) it falls back to auto-picking when
exactly one worktree exists, or failing with the full list of names to
choose from.

| Option                                   | Effect                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--no-create`                            | Fail instead of creating/recreating a missing container (`--sandbox`), or creating a new host worktree from a local branch |
| `--pull`                                 | `docker pull` the image before starting (`--sandbox` only)                                                                 |
| `--rebuild`                              | Rebuild the local image from `docker/Dockerfile` before starting (`--sandbox` only)                                        |
| `-p, --port <spec>` / `--publish <spec>` | Publish a port (`docker run -p` semantics), repeatable (`--sandbox` only)                                                  |
| `--network-host`                         | `--network=host` (`--sandbox` only)                                                                                        |

Passing any `--sandbox`-only option against a `host` worktree prints a
notice and is otherwise ignored — mode can't be changed after `wkt add`.

### `wkt list`

Prints a table of every tracked worktree: name, branch, mode (`host` or
`sandbox`), whether it's currently running, size, last synced. For
`sandbox` worktrees, "running" reflects the container (containers run with
`--rm` and disappear once their last tmux session ends, so "not running" is
the normal resting state) and "size" is the Docker volume's size. For
`host` worktrees, "running" reflects whether the host tmux session is
currently alive and "size" is the worktree directory's size. `wkt open`
recreates/reattaches either kind on demand.

If the current directory is inside a git worktree that isn't tracked by wkt
at all — most commonly the repo's original checkout — `wkt list` adds one
extra row for it (mode `host (untracked)`), so the table is useful even
from a location `wkt` never created.

### `wkt rm <name> [--yes]`

For `sandbox`: removes the container and volume. For `host`: kills the host
tmux session if it's running. Either way, also removes the host git
worktree and drops the `state.json` entry. Prompts for confirmation unless
`--yes`.

## Bringing work out of a sandbox container

These only apply to `--sandbox` worktrees — a `host` worktree's files
already are the host's files, so there's nothing to bring out. Running any
of these against a `host` worktree fails with a clear error.

### `wkt sync [name] [--dry-run] [--delete] [--yes]`

Rsyncs working-tree files (never `.git`) from the project volume onto the host
worktree path. `--delete` also removes host files that no longer exist in the
container (prompts for confirmation unless `--yes` or `--dry-run`).

### `wkt git promote [name]`

Bundles commits that exist in the container's clone but not yet on the host,
and fast-forwards the host worktree onto them. Safe to run repeatedly — a no-op
when there's nothing new.

### `wkt git push [name]`

For `sandbox`: runs `wkt git promote`, then `git push` **on the host**, using
the host's own credentials. For `host`: goes straight to `git push` — there's
no separate container copy to promote from. Either way, sets `-u origin
<branch>` automatically on a branch's first push.

### `wkt git pull [name]` / `wkt git fetch [name]` / `wkt git status [name]`

Ordinary host `git pull`/`fetch`/`status`, scoped to that worktree's path.
Work the same for both modes — these were always host-side operations.

## Destructive / housekeeping

### `wkt reset [name] [--yes]`

`--sandbox` only. Discards any container-only work (uncommitted or
unpromoted) by removing the container and volume and re-seeding from the host
repo's current state.

### `wkt reset-home [--yes]`

Removes every sandbox container (they recreate on next `wkt open`) and
deletes + recreates the shared `wkt-home` volume — npm globals, dotfiles,
anything installed there. Project volumes and host worktrees are untouched.

### `wkt rm <name> [--yes]`

See above.

### `wkt clean [--yes] [--dry-run]`

Removes wkt-managed stopped containers (their volume — the real data — is
untouched, `wkt open` recreates them), volumes matching wkt's naming convention
with no matching `state.json` entry (orphaned), and dangling image layers built
from `docker/Dockerfile`. Never touches anything outside that scope, and never
touches `host` worktrees (nothing Docker-side exists for them).

## Setup / image

### `wkt doctor`

Checks node, git, tmux, vim, and disk space (required for the default host
mode), plus Docker (reported but optional — only needed for `--sandbox`).

### `wkt setup-host`

Pre-clones the bundled vim plugin set into `~/.local/share/wkt/vim-runtime`,
so the first `wkt add`/`wkt open` on a host worktree isn't the one paying
that one-time cost. Otherwise happens automatically, lazily, on first host
attach.

### `wkt build-image`

`--sandbox` only. Builds `higginsrob/worktree:latest` locally from
`docker/Dockerfile` (`make build-image` is equivalent).

### `wkt exec [cmd...]`

Not yet implemented.

## State

- `~/.config/wkt/state.json` — every worktree this CLI knows about (host and
  sandbox); the source of truth for `wkt list`/`wkt clean` scoping.
- `~/.local/share/wkt/worktrees/<org>/<repo>/<branch>` — host git worktree
  paths, for both modes.
- `~/.local/share/wkt/vim-runtime` — vim plugins for host mode (see
  `wkt setup-host`).
- Docker volumes (`--sandbox` only): `wkt-vol-<org>-<repo>-<branch>` (per
  project), `wkt-home` (shared, one, across everything).
- Containers (`--sandbox` only): `wkt-<org>-<repo>-<branch>`.
- Host tmux sessions (`host` only): `wkt-<org>-<repo>-<branch>` (same naming
  convention, different namespace — tmux session names vs. Docker container
  names).
