import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getRepoRoot,
  getOriginUrl,
  parseOrgRepo,
  sanitizeRemoteUrl,
  worktreeAdd,
  worktreeRemove,
  getUserIdentity,
  revParse,
  fetchRef,
  fastForwardWorktree,
  deleteRef,
  hasUpstream,
  gitInherit,
} from './git.js';
import {
  volumeExists,
  createVolume,
  removeVolume,
  seedSanitizedClone,
  containerState,
  runContainer,
  removeContainer,
  startContainer,
  attachTmux,
  volumeSize,
  imageExists,
  syncVolumeToHost,
  createPromoteBundle,
  type ContainerState,
} from './docker.js';
import { volumeName, containerName, worktreeName, WORKTREES_DIR, HOME_VOLUME } from './config.js';
import { readState, writeState, type WktState, type WorktreeRecord } from './state.js';

function getRecord(state: WktState, name: string): WorktreeRecord {
  const record = state.worktrees[name];
  if (!record) {
    throw new Error(`no worktree named "${name}" — run "wkt add <branch>" first`);
  }
  return record;
}

export interface RepoContext {
  root: string;
  org: string;
  repo: string;
  originUrl?: string;
}

export async function resolveRepoContext(cwd: string): Promise<RepoContext> {
  const root = await getRepoRoot(cwd);
  const originUrl = await getOriginUrl(root);
  const { org, repo } = parseOrgRepo(originUrl);
  return { root, org, repo, originUrl };
}

export interface CreateOptions {
  ports?: string[];
  networkHost?: boolean;
}

async function createContainerFor(
  record: Pick<WorktreeRecord, 'org' | 'repo' | 'volume' | 'container' | 'repoRoot'>,
  opts: CreateOptions,
): Promise<void> {
  if (!(await imageExists())) {
    throw new Error('image not found locally — run "wkt build-image" first');
  }
  const identity = await getUserIdentity(record.repoRoot);
  const env: Record<string, string> = {};
  if (identity.name) {
    env.GIT_AUTHOR_NAME = identity.name;
    env.GIT_COMMITTER_NAME = identity.name;
  }
  if (identity.email) {
    env.GIT_AUTHOR_EMAIL = identity.email;
    env.GIT_COMMITTER_EMAIL = identity.email;
  }
  await runContainer({
    name: record.container,
    projectVolume: record.volume,
    workspacePath: `/workspace/${record.repo}`,
    homeVolume: HOME_VOLUME,
    env,
    ports: opts.ports,
    networkHost: opts.networkHost,
  });
}

export async function addWorktree(
  branch: string,
  cwd: string = process.cwd(),
  opts: CreateOptions = {},
): Promise<WorktreeRecord> {
  const ctx = await resolveRepoContext(cwd);
  const name = worktreeName(ctx.org, ctx.repo, branch);

  const state = await readState();
  if (state.worktrees[name]) {
    throw new Error(`worktree "${name}" already exists — run "wkt open ${name}"`);
  }

  const worktreePath = path.join(WORKTREES_DIR, ctx.org, ctx.repo, branch);
  const volume = volumeName(ctx.org, ctx.repo, branch);
  const container = containerName(ctx.org, ctx.repo, branch);

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  let worktreeCreated = false;
  let volumeCreated = false;
  try {
    await worktreeAdd(ctx.root, worktreePath, branch);
    worktreeCreated = true;

    await createVolume(volume);
    volumeCreated = true;

    await seedSanitizedClone({
      hostRepoRoot: ctx.root,
      volume,
      branch,
      originUrl: ctx.originUrl ? sanitizeRemoteUrl(ctx.originUrl) : undefined,
    });
    await createContainerFor(
      { org: ctx.org, repo: ctx.repo, volume, container, repoRoot: ctx.root },
      opts,
    );
  } catch (err) {
    if (volumeCreated) {
      await removeVolume(volume).catch(() => undefined);
    }
    if (worktreeCreated) {
      await worktreeRemove(ctx.root, worktreePath).catch(() => undefined);
    }
    throw err;
  }

  const record: WorktreeRecord = {
    name,
    org: ctx.org,
    repo: ctx.repo,
    branch,
    repoRoot: ctx.root,
    worktreePath,
    volume,
    container,
    createdAt: new Date().toISOString(),
  };
  state.worktrees[name] = record;
  await writeState(state);
  return record;
}

export function attach(record: WorktreeRecord): Promise<number> {
  return attachTmux(record.container, `/workspace/${record.repo}`);
}

export interface OpenOptions extends CreateOptions {
  noCreate?: boolean;
}

export async function openWorktree(name: string, opts: OpenOptions = {}): Promise<WorktreeRecord> {
  const state = await readState();
  const record = getRecord(state, name);

  const status = await containerState(record.container);
  if (status === 'absent') {
    if (opts.noCreate) {
      throw new Error(`container for "${name}" doesn't exist and --no-create was given`);
    }
    if (!(await volumeExists(record.volume))) {
      throw new Error(
        `volume for "${name}" is missing — run "wkt rm ${name}" then "wkt add" again`,
      );
    }
    await createContainerFor(record, opts);
  } else if (status === 'stopped') {
    await startContainer(record.container);
  }

  return record;
}

export async function resolveDefaultName(): Promise<string> {
  const state = await readState();
  const names = Object.keys(state.worktrees);
  if (names.length === 0) {
    throw new Error('no worktrees exist yet — run "wkt add <branch>" first');
  }
  if (names.length > 1) {
    throw new Error(`multiple worktrees exist, specify one by name: ${names.join(', ')}`);
  }
  return names[0]!;
}

export interface ListEntry {
  record: WorktreeRecord;
  status: ContainerState;
  volumeSize?: string;
}

export async function listWorktrees(opts: { all?: boolean } = {}): Promise<ListEntry[]> {
  const state = await readState();
  const entries: ListEntry[] = [];
  for (const record of Object.values(state.worktrees)) {
    const status = await containerState(record.container);
    if (!opts.all && status === 'absent') {
      continue;
    }
    const size = await volumeSize(record.volume);
    entries.push({ record, status, volumeSize: size });
  }
  return entries;
}

export async function removeWorktree(name: string): Promise<void> {
  const state = await readState();
  const record = getRecord(state, name);

  await removeContainer(record.container).catch(() => undefined);
  await removeVolume(record.volume).catch(() => undefined);
  await worktreeRemove(record.repoRoot, record.worktreePath).catch(() => undefined);

  delete state.worktrees[name];
  await writeState(state);
}

export interface SyncOptions {
  dryRun?: boolean;
  delete?: boolean;
}

export async function syncWorktree(name: string, opts: SyncOptions = {}): Promise<string> {
  const state = await readState();
  const record = getRecord(state, name);
  return syncVolumeToHost({
    volume: record.volume,
    hostWorktreePath: record.worktreePath,
    dryRun: opts.dryRun,
    delete: opts.delete,
  });
}

export type PromoteResult = 'created' | 'up-to-date';

export async function promoteWorktree(name: string): Promise<PromoteResult> {
  const state = await readState();
  const record = getRecord(state, name);

  const hostTip = await revParse(record.repoRoot, record.branch);
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wkt-bundle-'));
  const scratchRef = `refs/wkt/promote/${record.branch}`;
  try {
    const result = await createPromoteBundle({
      volume: record.volume,
      branch: record.branch,
      hostTip,
      bundleHostDir: bundleDir,
    });
    if (result === 'up-to-date') {
      return result;
    }
    const bundlePath = path.join(bundleDir, 'promote.bundle');
    await fetchRef(record.repoRoot, bundlePath, `${record.branch}:${scratchRef}`);
    await fastForwardWorktree(record.worktreePath, scratchRef);
    return result;
  } finally {
    await deleteRef(record.repoRoot, scratchRef).catch(() => undefined);
    await fs.rm(bundleDir, { recursive: true, force: true });
  }
}

export async function pushWorktree(name: string): Promise<number> {
  const state = await readState();
  const record = getRecord(state, name);
  await promoteWorktree(name);
  const upstream = await hasUpstream(record.worktreePath);
  return gitInherit(
    record.worktreePath,
    upstream ? ['push'] : ['push', '-u', 'origin', record.branch],
  );
}

export async function pullWorktree(name: string): Promise<number> {
  const state = await readState();
  const record = getRecord(state, name);
  return gitInherit(record.worktreePath, ['pull']);
}

export async function fetchWorktree(name: string): Promise<number> {
  const state = await readState();
  const record = getRecord(state, name);
  return gitInherit(record.worktreePath, ['fetch']);
}

export async function statusWorktree(name: string): Promise<number> {
  const state = await readState();
  const record = getRecord(state, name);
  return gitInherit(record.worktreePath, ['status']);
}

// Destructive: discards any container-only work (uncommitted or
// unpromoted) by re-seeding the volume from the host worktree's repo.
export async function resetWorktree(name: string): Promise<void> {
  const state = await readState();
  const record = getRecord(state, name);

  const originUrl = sanitizeRemoteUrl(await getOriginUrl(record.repoRoot));

  await removeContainer(record.container).catch(() => undefined);
  await removeVolume(record.volume).catch(() => undefined);

  await createVolume(record.volume);
  try {
    await seedSanitizedClone({
      hostRepoRoot: record.repoRoot,
      volume: record.volume,
      branch: record.branch,
      originUrl,
    });
    await createContainerFor(record, {});
  } catch (err) {
    await removeVolume(record.volume).catch(() => undefined);
    throw err;
  }
}
