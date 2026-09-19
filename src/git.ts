import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export function gitInherit(cwd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function gitVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['--version']);
    return stdout.trim().replace(/^git version /, '');
  } catch {
    return undefined;
  }
}

export async function getRepoRoot(cwd: string): Promise<string> {
  return git(cwd, ['rev-parse', '--show-toplevel']);
}

export async function getOriginUrl(cwd: string): Promise<string> {
  try {
    return await git(cwd, ['remote', 'get-url', 'origin']);
  } catch {
    throw new Error('no "origin" remote configured for this repository');
  }
}

export interface OrgRepo {
  org: string;
  repo: string;
}

// Handles git@host:org/repo.git, ssh://git@host/org/repo.git,
// https://[user[:token]@]host/org/repo.git, and local paths ending in org/repo.
export function parseOrgRepo(url: string): OrgRepo {
  const stripped = url.replace(/\.git$/, '');
  const scpMatch = /^[^@/]+@[^:/]+:(.+)$/.exec(stripped);
  const pathPart = scpMatch ? scpMatch[1] : stripped.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, '');
  const segments = pathPart.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`could not determine org/repo from remote URL: ${url}`);
  }
  const repo = segments.at(-1)!;
  const org = segments.at(-2)!;
  return { org, repo };
}

// Strips embedded userinfo (e.g. an access token) from an HTTPS remote URL.
export function sanitizeRemoteUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]+@/i, '$1');
}

// Short SHA fallback for a detached HEAD, matching wkt-git-badge's bash logic.
export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    return await git(cwd, ['symbolic-ref', '--short', 'HEAD']);
  } catch {
    return git(cwd, ['rev-parse', '--short', 'HEAD']);
  }
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export async function listLocalBranches(cwd: string): Promise<string[]> {
  const out = await git(cwd, ['branch', '--format=%(refname:short)']);
  return out ? out.split('\n').filter(Boolean) : [];
}

// Branches already checked out in *some* worktree of this repo (this one or
// any other, wkt-tracked or not) — `git worktree add` refuses all of them.
export async function listWorktreeBranches(cwd: string): Promise<Set<string>> {
  const out = await git(cwd, ['worktree', 'list', '--porcelain']);
  const branches = new Set<string>();
  for (const line of out.split('\n')) {
    const match = /^branch refs\/heads\/(.+)$/.exec(line);
    if (match) {
      branches.add(match[1]!);
    }
  }
  return branches;
}

export async function worktreeAdd(
  repoRoot: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  const exists = await branchExists(repoRoot, branch);
  const args = exists
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', '-b', branch, worktreePath];
  try {
    await git(repoRoot, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('is already used by worktree')) {
      throw new Error(
        `branch "${branch}" is already checked out elsewhere (often the repo itself) — ` +
          'check out a different branch there first, or use a different branch name',
      );
    }
    throw err;
  }
}

export async function worktreeRemove(repoRoot: string, worktreePath: string): Promise<void> {
  await git(repoRoot, ['worktree', 'remove', '--force', worktreePath]);
}

export interface GitIdentity {
  name?: string;
  email?: string;
}

export async function getUserIdentity(cwd: string): Promise<GitIdentity> {
  const [name, email] = await Promise.all([
    git(cwd, ['config', 'user.name']).catch(() => undefined),
    git(cwd, ['config', 'user.email']).catch(() => undefined),
  ]);
  return { name, email };
}

export async function revParse(cwd: string, rev: string): Promise<string> {
  return git(cwd, ['rev-parse', rev]);
}

export async function fetchRef(repoRoot: string, source: string, refspec: string): Promise<void> {
  await git(repoRoot, ['fetch', source, refspec]);
}

// Git refuses to fetch/push directly into a ref checked out in a worktree,
// so promote fetches into a scratch ref first, then fast-forwards the
// worktree's checked-out branch onto it from inside that worktree — the
// same pattern `git pull` uses internally.
export async function fastForwardWorktree(worktreePath: string, ref: string): Promise<void> {
  await git(worktreePath, ['merge', '--ff-only', ref]);
}

export async function deleteRef(repoRoot: string, ref: string): Promise<void> {
  await git(repoRoot, ['update-ref', '-d', ref]);
}

export async function hasUpstream(worktreePath: string): Promise<boolean> {
  try {
    await git(worktreePath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    return true;
  } catch {
    return false;
  }
}
