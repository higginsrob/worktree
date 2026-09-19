import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { VIM_RUNTIME_DIR } from './config.js';

const execFileAsync = promisify(execFile);

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(MODULE_DIR, '..');
// Reuses the same tmux.conf/vimrc/bin scripts baked into the Docker image
// (see docker.ts's DOCKER_CONTEXT_DIR) instead of shipping a second copy —
// both modes are parameterized via env vars, not forked configs.
export const HOST_ASSETS_DIR = path.join(PACKAGE_ROOT, 'docker');
export const HOST_BIN_DIR = path.join(HOST_ASSETS_DIR, 'bin');
export const HOST_TMUX_CONF = path.join(HOST_ASSETS_DIR, 'tmux.conf');
export const HOST_VIMRC = path.join(HOST_ASSETS_DIR, 'vimrc');

// Same plugin set as docker/Dockerfile's build-time clone loop. Kept as a
// second list (not imported by the Dockerfile, which can't run TS) so the
// host gets the same vim environment without needing Docker.
const VIM_PLUGINS = [
  'tpope/vim-fugitive',
  'tpope/vim-commentary',
  'junegunn/fzf',
  'junegunn/fzf.vim',
  'pangloss/vim-javascript',
  'HerringtonDarkholme/yats.vim',
  'MaxMEllon/vim-jsx-pretty',
  'preservim/vim-markdown',
  'stephpy/vim-yaml',
  'cespare/vim-toml',
  'christoomey/vim-tmux-navigator',
  'ghifarit53/tokyonight-vim',
];

function runInherit(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Idempotent: clones any plugin not already present. Safe to call on every
// host attach — a no-op once the runtime dir is populated.
export async function ensureVimRuntime(): Promise<void> {
  const startDir = path.join(VIM_RUNTIME_DIR, 'pack', 'plugins', 'start');
  await fs.mkdir(startDir, { recursive: true });

  const missing: string[] = [];
  for (const repo of VIM_PLUGINS) {
    const name = repo.split('/').at(-1)!;
    if (!(await pathExists(path.join(startDir, name)))) {
      missing.push(repo);
    }
  }
  if (missing.length === 0) {
    return;
  }

  console.log('Setting up host vim environment (one-time)…');
  for (const repo of missing) {
    const name = repo.split('/').at(-1)!;
    await execFileAsync('git', [
      'clone',
      '--depth',
      '1',
      `https://github.com/${repo}`,
      path.join(startDir, name),
    ]);
  }
}

export async function isTmuxAvailable(): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['-V']);
    return true;
  } catch {
    return false;
  }
}

export async function tmuxVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('tmux', ['-V']);
    return stdout.trim().replace(/^tmux /, '');
  } catch {
    return undefined;
  }
}

export async function isVimAvailable(): Promise<boolean> {
  try {
    await execFileAsync('vim', ['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function vimVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('vim', ['--version']);
    return stdout.split('\n')[0];
  } catch {
    return undefined;
  }
}

export async function hasHostTmuxSession(name: string): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', `=${name}`]);
    return true;
  } catch {
    return false;
  }
}

export async function killHostTmuxSession(name: string): Promise<void> {
  await execFileAsync('tmux', ['kill-session', '-t', `=${name}`]);
}

export async function directorySize(dirPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('du', ['-sh', dirPath]);
    return stdout.split(/\s+/)[0];
  } catch {
    return undefined;
  }
}

export interface AttachHostOptions {
  sessionName: string;
  worktreePath: string;
  repoName: string;
}

export async function attachHostTmux(opts: AttachHostOptions): Promise<number> {
  await ensureVimRuntime();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${HOST_BIN_DIR}:${process.env.PATH ?? ''}`,
    WKT_REPO_NAME: opts.repoName,
    WKT_WORKSPACE_DIR: opts.worktreePath,
    WKT_VIMRC: HOST_VIMRC,
    WKT_VIM_RUNTIME_DIR: VIM_RUNTIME_DIR,
  };

  // All host sessions share one tmux server (default socket), and statusline
  // `#(...)` jobs run with the *session* environment — not the env of whichever
  // client happened to start the server. Without -e, a second session would
  // inherit the first session's WKT_* values. Requires tmux >= 3.2.
  const sessionEnv = ['WKT_REPO_NAME', 'WKT_WORKSPACE_DIR', 'WKT_VIMRC', 'WKT_VIM_RUNTIME_DIR'].flatMap(
    (key) => ['-e', `${key}=${env[key]}`],
  );

  return runInherit(
    'tmux',
    [
      '-f',
      HOST_TMUX_CONF,
      'new-session',
      '-A',
      '-s',
      opts.sessionName,
      ...sessionEnv,
      '-c',
      opts.worktreePath,
    ],
    env,
  );
}
