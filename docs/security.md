# Security & isolation

`worktree` is built around the assumption that whatever runs inside a container —
agent CLIs, build scripts, anything a project's dependencies pull in — should never
be able to reach outside its own project, escalate privileges, or push code
anywhere on its own.

## Container hardening

Every worktree container runs with:

- `--read-only` — the root filesystem cannot be written to. Writable paths are
  limited to the project volume, the shared home volume, and tmpfs mounts at
  `/tmp` and `/var/tmp`.
- `--security-opt no-new-privileges` — the container can never gain more
  privileges than it started with (no setuid escalation, etc.).
- A non-root user (`dev`, uid/gid 1000). Nothing runs as root inside the container
  at steady state.
- No `docker.sock` mounted — a container can never control Docker itself: no
  privileged execution, no spawning sibling containers, no escaping its own
  sandbox.

## No shared credentials

- **No `~/.ssh`, no `SSH_AUTH_SOCK`.** SSH-based git remotes are informational
  only inside the container; there's no key material available to use them.
- **No host `~/.gitconfig` bind-mounted.** Git identity (`user.name`/`user.email`)
  is injected as `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/
  `GIT_COMMITTER_EMAIL` environment variables only, read from the host's config at
  container-creation time. There's no persistent credential store inside the
  container to leak.
- **The in-container git clone is sanitized at creation time**: any embedded
  credential in the origin URL (an access token, for example) is stripped, and
  any inherited `credential.helper` is removed. See
  [`mental-model.md`](mental-model.md#the-sanitized-clone).
- **Fetch/pull/push always run on the host**, using the host's own credential
  helper or SSH agent — never inside the container. `wkt git push` promotes
  commits out to the host first, then pushes from there.

## Project isolation

- Each container mounts **exactly one** project volume — never another
  worktree's, and never another project's.
- The shared `wkt-home` volume (npm globals, dotfiles, anything you install with
  `npm install -g`) is the **only** thing every container has in common.
  Containers cannot see or modify each other's project volumes.

## Cleanup safety

`wkt clean` and `wkt rm` only ever operate on resources this tool created and
tracks in `~/.config/wkt/state.json` (or, for orphan detection, resources matching
wkt's own unambiguous naming convention: `wkt-*` containers, `wkt-vol-*` volumes).
Dangling image-layer pruning is scoped to a `dev.wkt.image=true` label baked into
`docker/Dockerfile`, so it can never remove an unrelated dangling image elsewhere
on your Docker host. Nothing outside that scope is ever touched.

## What this does _not_ protect against

This is process/filesystem isolation, not a hard security boundary against a
determined adversary with kernel exploits — it relies on Docker's own container
isolation. It's meant to contain the _ordinary_ blast radius of running
untrusted or semi-trusted code (an AI agent, a project's own build tooling,
dependencies with postinstall scripts) — not to be a hostile-multi-tenant sandbox.
