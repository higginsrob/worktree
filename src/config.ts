import os from 'node:os';
import path from 'node:path';

const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
const xdgDataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');

export const CONFIG_DIR = path.join(xdgConfigHome, 'wkt');
export const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
export const WORKTREES_DIR = path.join(xdgDataHome, 'wkt', 'worktrees');

export const IMAGE_NAME = 'higginsrob/worktree:latest';
export const HOME_VOLUME = 'wkt-home';

export function volumeName(org: string, repo: string, branch: string): string {
  return `wkt-vol-${org}-${repo}-${branch}`;
}

export function containerName(org: string, repo: string, branch: string): string {
  return `wkt-${org}-${repo}-${branch}`;
}
