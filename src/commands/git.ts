import {
  promoteWorktree,
  pushWorktree,
  pullWorktree,
  fetchWorktree,
  statusWorktree,
  resolveDefaultName,
} from '../worktree.js';

async function resolveName(name?: string): Promise<string> {
  return name ?? (await resolveDefaultName());
}

export async function promoteAction(name?: string): Promise<void> {
  const resolvedName = await resolveName(name);
  const result = await promoteWorktree(resolvedName);
  console.log(
    result === 'up-to-date'
      ? `${resolvedName}: already up to date.`
      : `${resolvedName}: promoted new commits onto the host worktree.`,
  );
}

export async function pushAction(name?: string): Promise<void> {
  const resolvedName = await resolveName(name);
  process.exitCode = await pushWorktree(resolvedName);
}

export async function pullAction(name?: string): Promise<void> {
  const resolvedName = await resolveName(name);
  process.exitCode = await pullWorktree(resolvedName);
}

export async function fetchAction(name?: string): Promise<void> {
  const resolvedName = await resolveName(name);
  process.exitCode = await fetchWorktree(resolvedName);
}

export async function statusAction(name?: string): Promise<void> {
  const resolvedName = await resolveName(name);
  process.exitCode = await statusWorktree(resolvedName);
}
