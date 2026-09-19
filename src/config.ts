import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
const xdgDataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');

export const CONFIG_DIR = path.join(xdgConfigHome, 'wkt');
export const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
export const WORKTREES_DIR = path.join(xdgDataHome, 'wkt', 'worktrees');
export const VIM_RUNTIME_DIR = path.join(xdgDataHome, 'wkt', 'vim-runtime');

export const IMAGE_NAME = 'higginsrob/worktree:latest';
export const HOME_VOLUME = 'wkt-home';

// Docker resource names allow only [a-zA-Z0-9_.-]; branch names may contain
// slashes (e.g. "feature/x"), so collapse anything else to a single dash.
export function sanitizeForDockerName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

// tmux target strings ("session:window.pane") treat ":" and "." specially,
// so a session name needs a stricter charset than a Docker resource name.
export function sanitizeForTmuxName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

export function volumeName(org: string, repo: string, branch: string): string {
  return `wkt-vol-${sanitizeForDockerName(org)}-${sanitizeForDockerName(repo)}-${sanitizeForDockerName(branch)}`;
}

export function containerName(org: string, repo: string, branch: string): string {
  return `wkt-${sanitizeForDockerName(org)}-${sanitizeForDockerName(repo)}-${sanitizeForDockerName(branch)}`;
}

// The checkout path is part of the name: org/repo/branch alone isn't unique
// per checkout (two clones of one repo, or repos with no origin that share a
// directory name), and colliding names made one `wkt open` attach to — and
// delete — another's session.
export function tmuxSessionName(
  org: string,
  repo: string,
  branch: string,
  worktreePath: string,
): string {
  const pathHash = createHash('sha1').update(worktreePath).digest('hex').slice(0, 6);
  return `wkt-${sanitizeForTmuxName(org)}-${sanitizeForTmuxName(repo)}-${sanitizeForTmuxName(branch)}-${pathHash}`;
}

export function worktreeName(org: string, repo: string, branch: string): string {
  return `${org}/${repo}/${branch}`;
}
