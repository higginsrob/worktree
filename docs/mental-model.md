# Mental model

`worktree` collapses control-plane and data-plane into one place: **the container is
both**. It's a fully self-contained, tmux+vim environment you attach to over
`docker exec`. The host CLI (`wkt`) is deliberately thin:

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

## A worktree session is 1:1 with

1. A real host `git worktree` path (`git worktree add`), under
   `~/.local/share/wkt/worktrees/<org>/<repo>/<branch>`.
2. A Docker named volume (`wkt-vol-<org>-<repo>-<branch>`) seeded with an independent,
   sanitized clone of your repo — not a copy of the host worktree's `.git`, which
   would just be a path reference back into the host's object store.
3. A container mounting that volume at `/workspace/<repo>`, `--read-only`, running a
   persistent tmux server.
4. A shared home volume (`wkt-home`), mounted at `$HOME`, shared across **every**
   worktree and project — this is where global tool installs
   (`npm install -g ...`) and dotfiles live.

## Why a Docker volume, not a bind mount

Bind mounts (especially on Docker Desktop) are slow for dense trees, and a named
volume lets the container run fully `--read-only` plus tmpfs without exposing the
host filesystem. The trade-off: your work lives in Docker storage until you
explicitly bring it out — see below.

## The sanitized clone

When you run `wkt add <branch>`, the volume isn't seeded by copying the host
worktree's files. Instead, a helper container clones the **host repo itself**
(bind-mounted read-only) directly into the volume, checks out `branch`, then:

- rewrites `origin`'s URL to strip any embedded credentials (an access token in an
  `https://token@host/...` URL, for example)
- removes any inherited `credential.helper` config
- chowns everything to the container's non-root user

The result: a real, independent git repository that can `git log`, `git diff`,
`git commit` freely, but has no credential available to it for push. Nothing that
happens inside the container can reach outside of it.

## Bringing work back out: sync vs. promote

These are independent, both manual/on-demand — there's no background daemon.

- **`wkt sync`** moves _working-tree files_ (rsync, volume → host worktree,
  excluding `.git`). It has no idea what's committed vs. not; it just mirrors files.
- **`wkt git promote`** moves _committed history_. It bundles commits that exist in
  the container's clone but not yet on the host (`git bundle create
<hostTip>..<branch>`), fetches that bundle into the host repo, and fast-forwards
  the host worktree onto it.
- **`wkt git push`** promotes, then runs an ordinary `git push` **on the host**,
  using the host's own git credentials. The container is never involved in the
  push itself.

## `wkt reset`: discarding container-only work

`wkt reset` removes the container and volume, then re-seeds from the host repo's
_current_ state. Anything committed inside the container but not yet promoted is
discarded. Anything already promoted survives, since it's already part of the host
repo's object store by then.

## Isolation guarantees

See [`security.md`](security.md) for the full list.
