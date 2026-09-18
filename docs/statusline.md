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
| **WORKSPACE**   | `org/repo · branch`                          | Informational — click copies it to your host clipboard (via OSC 52) |
| **GIT**         | Current branch, colored by state (see below) | Opens a popup with `git status -sb`                                 |

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

The badge reads the repo under `/workspace/*`, refreshed every 5 seconds
(`status-interval`).

## OSC 52 clipboard

Both vim yanks and tmux copy-mode (keyboard `y` in copy-mode-vi, or releasing a
mouse-drag selection) pipe the selected text through an OSC 52 escape sequence
over the `docker exec -it` PTY, reaching your actual host terminal's clipboard —
no `xclip`, no X11 forwarding, no host filesystem access needed.

## Implementation

The badge text/color and click dispatch are computed by small scripts baked into
the image (`docker/bin/wkt-git-badge`, `wkt-workspace-badge`, `wkt-status-click`),
wired up via tmux's named click regions (`#[range=user|<name>]...#[norange]`) and
`MouseDown1StatusLeft`/`MouseDown1StatusRight` bindings in `docker/tmux.conf`.
