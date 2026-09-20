# worktree

A clean, keyboard-first **tmux + vim** workspace for every `git worktree` —
one command, one branch, one ready-to-work session.

```sh
wkt add my-feature
```

You land in a tmux session at the new worktree: vim open on the repo, a
terminal beside it, a statusline showing your branch state, and leader-key
shortcuts for everything you do all day — splits, dev servers, builds, an
AI agent pane, reloading config. Your own `~/.vimrc` and `~/.tmux.conf` are
never touched.

- **CLI:** `@higginsrob/worktree` → bin `wkt`
- **License:** MIT

## Install

```sh
npm install -g @higginsrob/worktree
wkt doctor   # checks git, tmux, vim, node, disk space
```

Requires git, tmux, vim, and Node.js ≥ 20. Vim plugins are cloned once into
`~/.local/share/wkt/` on first use (or up front with `wkt setup-host`).

## Quick start

```sh
# from inside any git repo:
wkt add my-feature        # git worktree add + tmux session, opens immediately

wkt list                  # name, branch, mode, running/not, size
wkt open my-feature       # reattach any time — layout and vim state intact
wkt rm my-feature         # remove the tmux session + git worktree
```

Work on several branches at once, each in its own session, without stashing
or switching. Detach, come back tomorrow, and it's all still there.

## Shortcuts

`<leader>` is **space**. Most shortcuts open a tmux pane, so vim stays put
while your dev server, build, or agent runs beside it.

### Panes & agents

| Keys        | Does                                         |
| ----------- | -------------------------------------------- |
| `<leader>t` | New terminal pane, side by side              |
| `<leader>T` | New terminal pane, stacked below             |
| `<leader>a` | Side-by-side pane running `claude`           |
| `<leader>A` | Same, stacked below                          |
| `<leader>v` | Vim vertical split                           |
| `<leader>h` | Vim horizontal split                         |
| `<leader>e` | File explorer (`:e .`)                       |

### Run your project

Each opens a pane and picks **bun** if it's installed, else **npm**. The pane
closes itself when the command succeeds and **stays open on failure** so you
can read the error.

| Keys        | Runs                                    |
| ----------- | --------------------------------------- |
| `<leader>d` | `bun run dev` / `npm run dev`           |
| `<leader>s` | `bun start` / `npm start`               |
| `<leader>b` | `bun run build` / `npm run build`       |
| `<leader>D` `S` `B` | Same, stacked below instead     |

### Everyday

| Keys        | Does                                         |
| ----------- | -------------------------------------------- |
| `<leader>w` | Save                                         |
| `<leader>q` | Quit                                         |
| `<leader>x` | Save (if changed) and quit (`:x`)             |
| `<leader>r` | Reload vim + tmux config in place            |
| `gcc` / `gc`| Toggle comments                              |

### Navigation

- **Ctrl-h/j/k/l** moves between vim splits *and* tmux panes as if they were
  one thing — no more remembering which kind of pane you're in.
- **Ctrl-C twice** (within 1s) offers to kill the whole session; **Ctrl-C
  then Ctrl-D** detaches and leaves it running. A single press behaves
  normally.
- **Mouse works everywhere**: click panes, drag borders, scroll, select.

## The statusline

Clickable, at the bottom of every session:

| Button        | Click                                              |
| ------------- | -------------------------------------------------- |
| **-** / **\|** | Split the pane stacked / side by side              |
| **+**         | New window                                         |
| window tabs   | Switch windows                                     |
| **WORKSPACE** | Copies `org/repo` to your clipboard                |
| **GIT**       | Popup with `git status -sb`                        |

The GIT badge is colored by state: 🟢 clean · 🔴 dirty · 🔵 ahead ·
🟡 behind · 🟣 diverged. Details in [`docs/statusline.md`](docs/statusline.md).

## What's in the box

- **vim**: fzf (`:Files`, `:Rg`, `:Buffers`), fugitive (`:Git`,
  `:Gdiffsplit`, `:Git blame`), commentary, JS/TS/JSX/Markdown/YAML/TOML
  syntax, tokyonight colors, a minimal statusline. Deliberately close to vim
  defaults — no linters or language servers to fight.
- **tmux**: tokyonight-themed, mouse on, 1-based windows and panes,
  auto-renumbering, fast escape, 10k history.
- **Clipboard that just works**: vim yanks and tmux copy-mode both use OSC 52,
  so copying reaches your real system clipboard — even over SSH.
- **Persistent undo** across sessions.
- **Zero footprint**: config is loaded via `tmux -f` / `vim -u`, so your
  personal dotfiles are never read or modified.

Full reference: [`docs/editor.md`](docs/editor.md).

## Handy workflows

- **Parallel branches**: `wkt add fix-login`, `wkt add refactor-api` — each
  is a real worktree with its own session; `wkt list` shows them all.
- **Agent alongside your editor**: `<leader>a` puts `claude` in a pane next
  to vim, in the same worktree.
- **Dev server on the side**: `<leader>d` for the server, `<leader>t` for a
  scratch shell, Ctrl-hjkl to hop between them.
- **Review in place**: `:Git` for status, `:Gdiffsplit` for a diff, click
  the GIT badge for a quick look.
- **Git as usual**: `wkt git push` / `wkt git pull` are plain host git
  operations scoped to the worktree, using your own credentials.

## Sandbox mode (optional)

Running something you don't fully trust — an AI agent, unfamiliar build
tooling, a project's postinstall scripts? Add `--sandbox` and the same
tmux/vim session runs inside a locked-down, read-only Docker container with
no credentials and no docker socket:

```sh
wkt build-image                  # one-time
wkt add my-feature --sandbox
wkt sync                         # copy uncommitted files back to the host
wkt git promote                  # bring commits back onto the host worktree
```

The editing experience is identical. See
[`docs/security.md`](docs/security.md) for the guarantees and
[`docs/mental-model.md`](docs/mental-model.md) for how the two modes differ.

## Docs

[CLI reference](docs/cli.md) · [Editor & shortcuts](docs/editor.md) ·
[Statusline](docs/statusline.md) · [Mental model](docs/mental-model.md) ·
[Security](docs/security.md)

## Development

```sh
npm install
npm run build   # tsc
npm run lint
npm run format
```

## License

MIT
