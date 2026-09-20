import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GITHUB_DIR } from '../config.js';
import { gitInherit, parseOrgRepo } from '../git.js';
import { readState } from '../state.js';
import { openAction, type OpenCliOptions } from './open.js';

const SHORTHAND = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// "org/repo" (not the three-part "org/repo/branch" worktree names).
export function isProjectShorthand(value: string): boolean {
  return SHORTHAND.test(value) && !value.startsWith('.') && !value.startsWith('/');
}

// Clones into $HOME/Github/<org>/<repo> unless it's already there, then makes
// that directory the process's cwd (wkt's worktree logic keys off cwd).
export async function ensureProject(spec: string): Promise<string> {
  const shorthand = isProjectShorthand(spec);
  const { org, repo } = parseOrgRepo(spec);
  const dir = path.join(GITHUB_DIR, org, repo);
  if (existsSync(dir)) {
    console.log(`${org}/${repo} already exists at ${dir}`);
  } else {
    const url = shorthand ? `https://github.com/${org}/${repo}.git` : spec;
    await fs.mkdir(path.dirname(dir), { recursive: true });
    console.log(`Cloning ${url} → ${dir}`);
    const code = await gitInherit(path.dirname(dir), ['clone', url, dir]);
    if (code !== 0) {
      throw new Error(`git clone failed (exit ${code})`);
    }
  }
  process.chdir(dir);
  return dir;
}

// True when `name` looks like org/repo and isn't an already-tracked worktree.
export async function isUntrackedProject(name: string): Promise<boolean> {
  if (!isProjectShorthand(name)) {
    return false;
  }
  return !(name in (await readState()).worktrees);
}

export async function cloneAction(spec: string, options: OpenCliOptions): Promise<void> {
  await ensureProject(spec);
  await openAction(undefined, options);
}
