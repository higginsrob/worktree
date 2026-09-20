# Editor setup

vim and tmux behave identically whether a worktree runs `--sandbox` (in
Docker) or on the host (the default) — both modes load the exact same
`docker/tmux.conf`/`docker/vimrc`, launched via `tmux -f`/`vim -u`. **Host
mode never reads or writes your real `~/.vimrc`/`~/.tmux.conf`** — those two
flags replace the normal config lookup entirely, which is what makes this
safe to install alongside your own personal setup.

The one thing that differs between the two modes is where vim finds its
plugins:

- **Sandbox**: baked into the image at build time (`docker/Dockerfile`,
  native vim8 packages under `/usr/share/vim/vimfiles/pack/plugins/start/`) —
  no plugin manager, no runtime network access needed inside the read-only
  container.
- **Host**: cloned once into `~/.local/share/wkt/vim-runtime/pack/plugins/start/`
  by `wkt setup-host` (or lazily, the first time you attach to a host
  worktree). `docker/vimrc` points vim's `packpath`/`runtimepath` at that
  directory via `$WKT_VIM_RUNTIME_DIR`, which is only set in host mode.

## vim plugins

The same set either way:

| Plugin                                                                                | Gives you                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `tpope/vim-fugitive`                                                                  | `:Git`, `:Gdiffsplit`, `:Git blame`               |
| `tpope/vim-commentary`                                                                | `gcc` / `gc` to toggle comments                   |
| `junegunn/fzf` + `junegunn/fzf.vim`                                                   | `:Files`, `:Buffers`, `:Rg`, `:Lines`, `:History` |
| `pangloss/vim-javascript`, `HerringtonDarkholme/yats.vim`, `MaxMEllon/vim-jsx-pretty` | JS/TS/JSX syntax                                  |
| `preservim/vim-markdown`                                                              | Markdown syntax (folding disabled)                |
| `stephpy/vim-yaml`, `cespare/vim-toml`                                                | YAML/TOML syntax                                  |
| `christoomey/vim-tmux-navigator`                                                      | Ctrl-hjkl pane nav, see below                     |
| `ghifarit53/tokyonight-vim`                                                           | colorscheme                                       |

There's deliberately no linter/fixer (ALE) — this setup stays close to vim
defaults plus the plugins above and the leader-key shortcuts below; wire up
your own `~/.vimrc` on the shared home volume for anything more opinionated.

## Leader key

`<leader>` is space. New splits (including `:terminal`) open below/right of
the current window (`splitbelow`/`splitright`), not above/left.

| Mapping                             | Runs                                                      |
| ----------------------------------- | --------------------------------------------------------- |
| `<leader>q`                         | `:q`                                                      |
| `<leader>x`                         | `:x` (save if changed, then quit)                         |
| `<leader>t`                         | new tmux pane, side by side                               |
| `<leader>T`                         | new tmux pane, stacked below                              |
| `<leader>e`                         | `:e .` (netrw)                                            |
| `<leader>v`                         | vertical split                                            |
| `<leader>h`                         | horizontal split                                          |
| `<leader>a`                         | tmux pane side by side running `claude`                   |
| `<leader>A`                         | same, stacked below                                       |
| `<leader>c`                         | tmux pane side by side running Cursor `agent`             |
| `<leader>C`                         | same, stacked below                                       |
| `<leader>w`                         | `:w`                                                      |
| `<leader>r`                         | reload vim + tmux config                                  |
| `<leader>d`                         | side-by-side pane: `bun run dev` (else `npm run dev`)     |
| `<leader>s`                         | side-by-side pane: `bun start` (else `npm start`)         |
| `<leader>b`                         | side-by-side pane: `bun run build` (else `npm run build`) |
| `<leader>D` `<leader>S` `<leader>B` | same as `d`/`s`/`b`, stacked below                        |

The `a`/`A`/`d`/`s`/`b` panes close when their command exits successfully; on a
non-zero exit they stay open in a shell so the error is readable.

## Colorscheme & statusline

`tokyonight` (`night` variant, italics on), with a minimal custom statusline
(filename left, a filetype badge right, dimmed when the window isn't
focused) and tuned diff/spell colors. tmux's pane borders and status bar use
the same palette (see [`statusline.md`](statusline.md) for the badges
themselves).

## Ctrl-h/j/k/l pane navigation

Since vim and tmux run in the same session inside one container, Ctrl-hjkl
moves seamlessly between vim splits and tmux panes — no need to remember
whether the pane you want is a vim window or a tmux pane. Implemented by
`vim-tmux-navigator` plus matching bindings in `tmux.conf`.

## Session start layout

A brand-new session opens vim at the repo root (netrw, `vim .`) with a
terminal split to its right — implemented by the `session-created` hook in
`tmux.conf`, which only fires the first time a session is created (not on
`wkt open` reattaches).

## Double Ctrl-C / Ctrl-C then Ctrl-D

Pressing Ctrl-C twice within 1 second pops a confirm-before prompt to kill
the whole tmux session (not just the foreground process) — a fast way out if
a pane gets stuck. Pressing Ctrl-C then Ctrl-D within that same window
detaches from the session instead, leaving it running. A single Ctrl-C or
Ctrl-D still behaves normally otherwise. Implemented by `wkt-doublec-check`
and `wkt-detach-check`, bound from `tmux.conf`.

## Persistence

Undo history (`~/.vim/undo`) and viminfo (`~/.local/share/vim`) always mean
`$HOME` at the path where vim actually runs: the shared `wkt-home` volume in
sandbox mode (so history survives `wkt open` reattaches across a rebuilt
container), and your real host home directory in host mode (so it's the same
undo history any other vim invocation on your machine would use). If that
location isn't writable yet, vim falls back to `/tmp`.

## Clipboard

Both vim yanks and tmux copy-mode pipe through `osc52-copy` — see the
[OSC 52 clipboard](statusline.md#osc-52-clipboard) section in `statusline.md`.
