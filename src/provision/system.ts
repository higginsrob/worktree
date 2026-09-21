import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import readline from 'node:readline/promises';

export type PackageManager = 'brew' | 'apt' | 'dnf' | 'pacman' | 'apk';

export interface SystemInfo {
  os: 'mac' | 'linux';
  // Undefined when no supported package manager was found (e.g. brew not yet
  // installed on a fresh Mac, or an unsupported distro).
  pkg?: PackageManager;
  isRoot: boolean;
  home: string;
}

export function runShell(cmd: string, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', cmd], { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export async function commandExists(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function detectSystem(): Promise<SystemInfo> {
  const isRoot = process.getuid?.() === 0;
  const home = os.homedir();

  if (process.platform === 'darwin') {
    return { os: 'mac', pkg: (await commandExists('brew')) ? 'brew' : undefined, isRoot, home };
  }
  if (process.platform !== 'linux') {
    throw new Error(`wkt provision supports macOS and Linux only (found ${process.platform}).`);
  }
  const candidates: [string, PackageManager][] = [
    ['apt-get', 'apt'],
    ['dnf', 'dnf'],
    ['pacman', 'pacman'],
    ['apk', 'apk'],
  ];
  for (const [bin, pkg] of candidates) {
    if (await commandExists(bin)) {
      return { os: 'linux', pkg, isRoot, home };
    }
  }
  return { os: 'linux', isRoot, home };
}

export async function confirm(question: string, def = false): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} ${def ? '[Y/n]' : '[y/N]'} `);
    if (answer.trim() === '') {
      return def;
    }
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export interface PackageNames {
  brew?: string;
  apt?: string;
  dnf?: string;
  pacman?: string;
  apk?: string;
}

// Shell command that installs `names[sys.pkg]`, or undefined when there's no
// usable package manager (or no package for it).
export function packageInstallCommand(sys: SystemInfo, names: PackageNames): string | undefined {
  if (!sys.pkg) {
    return undefined;
  }
  const name = names[sys.pkg];
  if (!name) {
    return undefined;
  }
  const sudo = sys.isRoot ? '' : 'sudo ';
  switch (sys.pkg) {
    case 'brew':
      return `brew install ${name}`;
    case 'apt':
      return `${sudo}apt-get update && ${sudo}apt-get install -y ${name}`;
    case 'dnf':
      return `${sudo}dnf install -y ${name}`;
    case 'pacman':
      return `${sudo}pacman -S --noconfirm ${name}`;
    case 'apk':
      return `${sudo}apk add ${name}`;
  }
}
