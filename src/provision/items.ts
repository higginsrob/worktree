import fs from 'node:fs/promises';
import path from 'node:path';
import { VIM_RUNTIME_DIR } from '../config.js';
import {
  HOST_ASSETS_DIR,
  HOST_BIN_DIR,
  HOST_TMUX_CONF,
  HOST_VIMRC,
  ensureVimRuntime,
} from '../host.js';
import {
  commandExists,
  packageInstallCommand,
  pathExists,
  type PackageNames,
  type SystemInfo,
} from './system.js';

export type Step =
  // Run through `sh -c`, output inherited.
  | { kind: 'shell'; cmd: string }
  // Instructions we can't automate; printed, never run, counted as "manual".
  | { kind: 'manual'; text: string }
  // In-process work (writing config files); `describe` is what the user confirms.
  | { kind: 'fn'; describe: string; run: () => Promise<void> };

export interface Item {
  id: string;
  label: string;
  group: 'system' | 'shell' | 'agents' | 'editor' | 'config';
  applies(sys: SystemInfo): boolean;
  detect(sys: SystemInfo): Promise<boolean>;
  plan(sys: SystemInfo): Step[];
}

export const ALIASES_FILE = path.join(HOST_ASSETS_DIR, 'aliases.sh');
export const ALIASES_BEGIN = '# >>> wkt aliases >>>';
export const ALIASES_END = '# <<< wkt aliases <<<';
const MANAGED_MARK = 'wkt-managed';

const always = (): boolean => true;

// A tool with the same name as its binary, installed via the package manager.
function pkgItem(
  id: string,
  label: string,
  names: PackageNames,
  bin = id,
  group: Item['group'] = 'system',
): Item {
  return {
    id,
    label,
    group,
    applies: always,
    detect: () => commandExists(bin),
    plan: (sys) => {
      const cmd = packageInstallCommand(sys, names);
      return cmd
        ? [{ kind: 'shell', cmd }]
        : [{ kind: 'manual', text: `Install ${label} with your system's package manager.` }];
    },
  };
}

// A tool installed by piping an official install script into a shell.
function scriptItem(
  id: string,
  label: string,
  cmd: string,
  bin = id,
  group: Item['group'] = 'agents',
): Item {
  return {
    id,
    label,
    group,
    applies: always,
    detect: () => commandExists(bin),
    plan: () => [{ kind: 'shell', cmd }],
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function vimQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ~/.vimrc / ~/.tmux.conf are thin wrappers, not symlinks: the bundled configs
// read WKT_* env vars and call helper scripts by bare name, which a plain
// symlink wouldn't provide. Paths are baked in at write time, so re-running
// `wkt provision` refreshes them after the package moves or is upgraded.
export function vimWrapper(): string {
  return [
    `" ${MANAGED_MARK}: written by \`wkt provision\`; re-run it to refresh after upgrading wkt.`,
    `let $WKT_VIMRC = ${vimQuote(HOST_VIMRC)}`,
    `let $WKT_VIM_RUNTIME_DIR = ${vimQuote(VIM_RUNTIME_DIR)}`,
    `let $PATH = ${vimQuote(HOST_BIN_DIR + ':')} . $PATH`,
    `execute 'source ' . fnameescape(${vimQuote(HOST_VIMRC)})`,
    '',
  ].join('\n');
}

export function tmuxWrapper(): string {
  return [
    `# ${MANAGED_MARK}: written by \`wkt provision\`; re-run it to refresh after upgrading wkt.`,
    `set-environment -g WKT_VIMRC "${HOST_VIMRC}"`,
    `set-environment -g WKT_TMUX_CONF "${HOST_TMUX_CONF}"`,
    `set-environment -g WKT_VIM_RUNTIME_DIR "${VIM_RUNTIME_DIR}"`,
    `set-environment -g PATH "${HOST_BIN_DIR}:$PATH"`,
    `source-file "${HOST_TMUX_CONF}"`,
    '',
  ].join('\n');
}

async function readOrUndefined(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

// Writes a managed wrapper, first moving aside any existing file that isn't
// already one of ours (a previous wrapper is simply overwritten).
async function writeWrapper(file: string, content: string): Promise<void> {
  const existing = await readOrUndefined(file);
  if (existing !== undefined && !existing.includes(MANAGED_MARK)) {
    const backup = `${file}.bak.${Date.now()}`;
    await fs.rename(file, backup);
    console.log(`Backed up existing ${file} to ${backup}`);
  }
  await fs.writeFile(file, content);
}

function wrapperItem(
  id: string,
  label: string,
  file: (sys: SystemInfo) => string,
  content: () => string,
  prepare?: () => Promise<void>,
): Item {
  return {
    id,
    label,
    group: 'config',
    applies: always,
    detect: async (sys) => (await readOrUndefined(file(sys))) === content(),
    plan: (sys) => {
      const target = file(sys);
      return [
        {
          kind: 'fn',
          describe: `Write ${target} (sources ${id === 'vim-config' ? HOST_VIMRC : HOST_TMUX_CONF}); an existing file is backed up first`,
          run: async () => {
            await prepare?.();
            await writeWrapper(target, content());
          },
        },
      ];
    },
  };
}

export function aliasesRcFile(sys: SystemInfo): string {
  const shell = path.basename(process.env.SHELL ?? '');
  return path.join(sys.home, shell === 'bash' ? '.bashrc' : '.zshrc');
}

export function aliasesBlock(): string {
  return [
    ALIASES_BEGIN,
    `[ -f ${shellQuote(ALIASES_FILE)} ] && . ${shellQuote(ALIASES_FILE)}`,
    ALIASES_END,
  ].join('\n');
}

function replaceBlock(text: string, block: string): string {
  const start = text.indexOf(ALIASES_BEGIN);
  const end = text.indexOf(ALIASES_END);
  if (start !== -1 && end > start) {
    return text.slice(0, start) + block + text.slice(end + ALIASES_END.length);
  }
  return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}\n${block}\n`;
}

const nodeNames: PackageNames = {
  brew: 'node',
  apt: 'nodejs',
  dnf: 'nodejs',
  pacman: 'nodejs',
  apk: 'nodejs',
};

// Order matters: it's the install order (package manager first, tools that
// other installs rely on — node/npm — before the npm-based agent CLIs).
export const ITEMS: Item[] = [
  {
    id: 'brew',
    label: 'Homebrew',
    group: 'system',
    applies: (sys) => sys.os === 'mac',
    detect: () => commandExists('brew'),
    plan: () => [
      {
        kind: 'shell',
        cmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      },
    ],
  },
  pkgItem('node', 'Node.js', nodeNames),
  pkgItem('npm', 'npm', { ...nodeNames, apt: 'npm', dnf: 'npm', pacman: 'npm', apk: 'npm' }),
  scriptItem('bun', 'Bun', 'curl -fsSL https://bun.sh/install | bash', 'bun', 'system'),
  pkgItem('python3', 'Python 3', {
    brew: 'python',
    apt: 'python3',
    dnf: 'python3',
    pacman: 'python',
    apk: 'python3',
  }),
  pkgItem(
    'zsh',
    'zsh',
    { brew: 'zsh', apt: 'zsh', dnf: 'zsh', pacman: 'zsh', apk: 'zsh' },
    'zsh',
    'shell',
  ),
  {
    id: 'oh-my-zsh',
    label: 'oh-my-zsh',
    group: 'shell',
    applies: always,
    detect: (sys) =>
      pathExists(path.join(process.env.ZSH ?? path.join(sys.home, '.oh-my-zsh'), 'oh-my-zsh.sh')),
    // RUNZSH/CHSH=no: don't launch zsh or change the login shell mid-run;
    // KEEP_ZSHRC=yes: don't clobber an existing ~/.zshrc.
    plan: () => [
      {
        kind: 'shell',
        cmd: 'RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"',
      },
    ],
  },
  {
    id: 'docker',
    label: 'Docker',
    group: 'system',
    applies: always,
    detect: async (sys) =>
      (await commandExists('docker')) ||
      (sys.os === 'mac' && (await pathExists('/Applications/Docker.app'))),
    plan: (sys) => {
      if (sys.os === 'mac') {
        return sys.pkg === 'brew'
          ? [{ kind: 'shell', cmd: 'brew install --cask docker' }]
          : [
              {
                kind: 'manual',
                text: 'Install Docker Desktop: https://www.docker.com/products/docker-desktop/',
              },
            ];
      }
      return [
        { kind: 'shell', cmd: 'curl -fsSL https://get.docker.com | sh' },
        {
          kind: 'manual',
          text: 'To run docker without sudo: sudo usermod -aG docker "$USER" (then log out and back in).',
        },
      ];
    },
  },
  {
    id: 'ollama',
    label: 'Ollama',
    group: 'agents',
    applies: always,
    detect: () => commandExists('ollama'),
    plan: (sys) => [
      {
        kind: 'shell',
        cmd:
          sys.os === 'mac' && sys.pkg === 'brew'
            ? 'brew install ollama'
            : 'curl -fsSL https://ollama.com/install.sh | sh',
      },
    ],
  },
  scriptItem('claude', 'Claude Code', 'curl -fsSL https://claude.ai/install.sh | bash'),
  scriptItem('cursor-agent', 'Cursor Agent', 'curl https://cursor.com/install -fsS | bash'),
  {
    id: 'codex',
    label: 'Codex CLI',
    group: 'agents',
    applies: always,
    detect: () => commandExists('codex'),
    plan: (sys) => [
      {
        kind: 'shell',
        cmd:
          sys.os === 'mac' && sys.pkg === 'brew'
            ? 'brew install codex'
            : 'npm install -g @openai/codex',
      },
    ],
  },
  pkgItem(
    'vim',
    'Vim',
    { brew: 'vim', apt: 'vim', dnf: 'vim-enhanced', pacman: 'vim', apk: 'vim' },
    'vim',
    'editor',
  ),
  pkgItem(
    'tmux',
    'tmux',
    { brew: 'tmux', apt: 'tmux', dnf: 'tmux', pacman: 'tmux', apk: 'tmux' },
    'tmux',
    'editor',
  ),
  wrapperItem(
    'vim-config',
    'vim config → wkt vimrc',
    (sys) => path.join(sys.home, '.vimrc'),
    vimWrapper,
    ensureVimRuntime,
  ),
  wrapperItem(
    'tmux-config',
    'tmux config → wkt tmux.conf',
    (sys) => path.join(sys.home, '.tmux.conf'),
    tmuxWrapper,
  ),
  {
    id: 'aliases',
    label: 'shell aliases',
    group: 'config',
    applies: always,
    detect: async (sys) =>
      ((await readOrUndefined(aliasesRcFile(sys))) ?? '').includes(aliasesBlock()),
    plan: (sys) => {
      const rc = aliasesRcFile(sys);
      return [
        {
          kind: 'fn',
          describe: `Add a wkt aliases block to ${rc} (sources ${ALIASES_FILE})`,
          run: async () => {
            const existing = (await readOrUndefined(rc)) ?? '';
            await fs.writeFile(rc, replaceBlock(existing, aliasesBlock()));
          },
        },
      ];
    },
  },
];
