# tmux statusline

The host CLI is a plain, scriptable tool with no interactive dashboard — the "TUI"
experience lives entirely in tmux + vim _inside_ the container. The statusline
gives you tmux window controls and read-only repo status, nothing more.

| Badge           | Shows                                        | Click                                                               |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **+** (green)   | New window                                   | Opens a new shell window                                            |
| **Window tabs** | `#I:#W`                                      | tmux's built-in window list — click to select                       |
| **-** (yellow)  | Split horizontal                             | `split-window -v` in the current path                               |
| **\|** (cyan)   | Split vertical                               | `split-window -h` in the current path                               |
| **sandbox**     | (sandbox worktrees only) yellow **sandbox** pill | — |
| **WORKSPACE**   | `org/repo`                                   | Opens a menu of worktrees (same columns as `wkt list`); Up/Down + Enter detaches this session and attaches the chosen one. Host sessions only |
| **GIT**         | Current branch, colored by state (see below) | Opens a menu of common git commands; the pick runs in a new pane (side-by-side if the current pane is wide, stacked otherwise). Read-only views (status, diff, log, branches) stay open in a pager; actions (add, commit, fetch, pull, push, stash) close the pane on success and stay open on error |

There are deliberately **no push/pull/sync actions in the statusline** — those stay
host-only `wkt` commands (`wkt sync`, `wkt git push`, ...), so a container never has
a UI affordance implying it could push on its own.

## GIT badge colors

| Color   | Meaning                          |
| ------- | -------------------------------- |
| green   | clean, up to date with upstream  |
| red     | uncommitted changes (dirty)      |
| cyan    | ahead of upstream                |
| yellow  | behind upstream                  |
| magenta | diverged (both ahead and behind) |

The badge reads the repo at `$WKT_WORKSPACE_DIR` (set by the host CLI for both
sandbox containers and host tmux sessions — see [`editor.md`](editor.md)),
refreshed every 5 seconds (`status-interval`).

## OSC 52 clipboard

Both vim yanks and tmux copy-mode (keyboard `y` in copy-mode-vi, or releasing a
mouse-drag selection) pipe the selected text through an OSC 52 escape sequence
to `/dev/tty` — over the `docker exec -it` PTY in sandbox mode, or straight to
your terminal in host mode — reaching your actual clipboard with no `xclip`,
no X11 forwarding, no host filesystem access needed.

## Implementation

The badge text/color and click dispatch are computed by small scripts baked into
the image (`docker/bin/wkt-git-badge`, `wkt-sandbox-badge`, `wkt-workspace-badge`, `wkt-status-click`),
wired up via tmux's named click regions (`#[range=user|<name>]...#[norange]`) and
`MouseDown1StatusLeft`/`MouseDown1StatusRight` bindings in `docker/tmux.conf`.
