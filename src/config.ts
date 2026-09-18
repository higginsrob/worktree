import os from 'node:os';
import path from 'node:path';

const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
const xdgDataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');

export const CONFIG_DIR = path.join(xdgConfigHome, 'wkt');
export const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
export const WORKTREES_DIR = path.join(xdgDataHome, 'wkt', 'worktrees');

export const IMAGE_NAME = 'higginsrob/worktree:latest';
export const HOME_VOLUME = 'wkt-home';

// Docker resource names allow only [a-zA-Z0-9_.-]; branch names may contain
// slashes (e.g. "feature/x"), so collapse anything else to a single dash.
export function sanitizeForDockerName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

export function volumeName(org: string, repo: string, branch: string): string {
  return `wkt-vol-${sanitizeForDockerName(org)}-${sanitizeForDockerName(repo)}-${sanitizeForDockerName(branch)}`;
}

export function containerName(org: string, repo: string, branch: string): string {
  return `wkt-${sanitizeForDockerName(org)}-${sanitizeForDockerName(repo)}-${sanitizeForDockerName(branch)}`;
}

export function worktreeName(org: string, repo: string, branch: string): string {
  return `${org}/${repo}/${branch}`;
}
