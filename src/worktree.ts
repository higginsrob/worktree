import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getRepoRoot,
  getOriginUrl,
  getCurrentBranch,
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
  branchExists,
  listLocalBranches,
  listWorktreeBranches,
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
  hasTmuxSession,
  stopContainerNow,
  attachTmux,
  volumeSize,
  imageExists,
  syncVolumeToHost,
  createPromoteBundle,
  listContainersByPrefix,
  listVolumesByPrefix,
  pruneDanglingImages,
} from './docker.js';
import { attachHostTmux, directorySize, hasHostTmuxSession, killHostTmuxSession } from './host.js';
import {
  volumeName,
  containerName,
  tmuxSessionName,
  worktreeName,
  WORKTREES_DIR,
  HANDOFF_DIR,
  HOME_VOLUME,
} from './config.js';
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
  record: Pick<WorktreeRecord, 'org' | 'repo' | 'repoRoot'> & { volume: string; container: string },
  opts: CreateOptions,
): Promise<void> {
  if (!(await imageExists())) {
    throw new Error('image not found locally — run "wkt build-image" first');
  }
  const identity = await getUserIdentity(record.repoRoot);
  const workspacePath = `/workspace/${record.repo}`;
  const env: Record<string, string> = {
    WKT_MODE: 'sandbox',
    WKT_REPO_NAME: `${record.org}/${record.repo}`,
    WKT_WORKSPACE_DIR: workspacePath,
    // Points the shared tmux.conf's session-created hook at the same vimrc
    // it always used; host mode sets this to the package's bundled vimrc
    // instead (see attachHostTmux in host.ts).
    WKT_VIMRC: '/etc/vim/vimrc.local',
  };
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
    workspacePath,
    homeVolume: HOME_VOLUME,
    env,
    ports: opts.ports,
    networkHost: opts.networkHost,
  });
}

export interface AddOptions extends CreateOptions {
  sandbox?: boolean;
}

export async function addWorktree(
  branch: string,
  cwd: string = process.cwd(),
  opts: AddOptions = {},
): Promise<WorktreeRecord> {
  const ctx = await resolveRepoContext(cwd);
  const name = worktreeName(ctx.org, ctx.repo, branch);

  const state = await readState();
  if (state.worktrees[name]) {
    throw new Error(`worktree "${name}" already exists — run "wkt open ${name}"`);
  }

  // `git worktree add` refuses to check out a branch that's already checked
  // out somewhere — most commonly right here, in ctx.root itself (the repo
  // you ran `wkt add` from). That's not an error so much as a sign you
  // wanted `wkt open`, which can adopt this exact checkout as a host
  // worktree without creating a new one.
  if ((await getCurrentBranch(ctx.root).catch(() => undefined)) === branch) {
    const suggestion = opts.sandbox
      ? 'check out a different branch here first, or use a different branch name'
      : `run "wkt open ${name}" instead to attach a tmux session to this checkout directly`;
    throw new Error(
      `branch "${branch}" is already checked out here (this is that checkout) — ${suggestion}`,
    );
  }

  const worktreePath = path.join(WORKTREES_DIR, ctx.org, ctx.repo, branch);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  const record: WorktreeRecord = {
    name,
    org: ctx.org,
    repo: ctx.repo,
    branch,
    repoRoot: ctx.root,
    worktreePath,
    mode: opts.sandbox ? 'sandbox' : 'host',
    createdAt: new Date().toISOString(),
  };

  if (!opts.sandbox) {
    await worktreeAdd(ctx.root, worktreePath, branch);
    state.worktrees[name] = record;
    await writeState(state);
    return record;
  }

  const volume = volumeName(ctx.org, ctx.repo, branch);
  const container = containerName(ctx.org, ctx.repo, branch);

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

  record.volume = volume;
  record.container = container;
  state.worktrees[name] = record;
  await writeState(state);
  return record;
}

// Sandbox: once the last tmux session ends the container is stopped (and,
// being `--rm`, removed) — a plain detach leaves the session (and container)
// running. Host: there's no container to tear down; a detach just leaves the
// host tmux session running, discoverable next time via hasHostTmuxSession.
//
// Host sessions can hand off: `wkt switch` (the statusline workspace menu)
// writes the target worktree name to a per-session file and detaches the
// client; when tmux returns here we attach to that worktree instead of exiting.
export function hostSessionName(record: WorktreeRecord): string {
  return tmuxSessionName(record.org, record.repo, record.branch, record.worktreePath);
}

export function handoffPath(session: string): string {
  return path.join(HANDOFF_DIR, session);
}

async function takeHandoff(session: string): Promise<string | undefined> {
  const file = handoffPath(session);
  try {
    const name = (await fs.readFile(file, 'utf8')).trim();
    await fs.rm(file, { force: true });
    return name || undefined;
  } catch {
    return undefined;
  }
}

export async function attach(record: WorktreeRecord): Promise<number> {
  let current = record;
  for (;;) {
    if (current.mode !== 'host') {
      return attachOnce(current);
    }
    const session = hostSessionName(current);
    await fs.rm(handoffPath(session), { force: true }); // drop any stale request
    const code = await attachOnce(current);
    const next = await takeHandoff(session);
    if (!next) {
      return code;
    }
    current = await openWorktree(next);
  }
}

async function attachOnce(record: WorktreeRecord): Promise<number> {
  if (record.mode === 'host') {
    return attachHostTmux({
      sessionName: hostSessionName(record),
      worktreePath: record.worktreePath,
      repoName: `${record.org}/${record.repo}`,
    });
  }
  const container = record.container!;
  const code = await attachTmux(container, `/workspace/${record.repo}`);
  if (!(await hasTmuxSession(container))) {
    await stopContainerNow(container).catch(() => undefined);
  }
  return code;
}

export interface OpenOptions extends CreateOptions {
  noCreate?: boolean;
}

export async function openWorktree(name: string, opts: OpenOptions = {}): Promise<WorktreeRecord> {
  const state = await readState();
  const record =
    state.worktrees[name] ??
    (await adoptCurrentDirWorktree(name, state)) ??
    (opts.noCreate ? undefined : await createFromLocalBranch(name, process.cwd()));
  if (!record) {
    throw new Error(`no worktree named "${name}" — run "wkt add <branch>" first`);
  }

  if (record.mode === 'host') {
    // Nothing to start — the worktree directory on disk is the whole thing.
    return record;
  }

  const container = record.container!;
  const volume = record.volume!;
  const status = await containerState(container);
  if (status === 'absent') {
    if (opts.noCreate) {
      throw new Error(`container for "${name}" doesn't exist and --no-create was given`);
    }
    if (!(await volumeExists(volume))) {
      throw new Error(
        `volume for "${name}" is missing — run "wkt rm ${name}" then "wkt add" again`,
      );
    }
    await createContainerFor(record as typeof record & { volume: string; container: string }, opts);
  } else if (status === 'stopped') {
    await startContainer(container);
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
  running: boolean;
  volumeSize?: string;
  // Not in state.json — discovered by scanning $PWD, not created via `wkt add`.
  unmanaged?: boolean;
  // Not a worktree at all yet — a local branch `wkt open`'s picker offers to
  // turn into one on the spot. record.worktreePath is meaningless here.
  creatable?: boolean;
}

// Sandbox containers run with --rm, so they're removed automatically once
// their last tmux session ends — "no container" just means "not running
// right now", not "gone". Every tracked worktree is listed regardless, with
// a running/not column; `wkt open` recreates the container on demand. Host
// worktrees have no container/volume at all — "running" reflects whether
// their host tmux session is currently alive, "size" is the directory size.
export async function listWorktrees(): Promise<ListEntry[]> {
  const state = await readState();
  const entries: ListEntry[] = [];
  for (const record of Object.values(state.worktrees)) {
    if (record.mode === 'host') {
      const sessionName = tmuxSessionName(record.org, record.repo, record.branch, record.worktreePath);
      const [running, size] = await Promise.all([
        hasHostTmuxSession(sessionName),
        directorySize(record.worktreePath),
      ]);
      entries.push({ record, running, volumeSize: size });
      continue;
    }
    const status = await containerState(record.container!);
    const size = await volumeSize(record.volume!);
    entries.push({ record, running: status === 'running', volumeSize: size });
  }
  return entries;
}

// org/repo falls back to "?"/the directory name when there's no origin
// remote (e.g. a scratch repo) — shared by findCurrentDirEntry and adoption
// below so both agree on what to call an untracked checkout.
async function identifyCurrentDir(
  root: string,
): Promise<{ org: string; repo: string; branch: string }> {
  let org = '?';
  let repo = path.basename(root);
  try {
    const originUrl = await getOriginUrl(root);
    ({ org, repo } = parseOrgRepo(originUrl));
  } catch {
    // no origin remote — fall back to the directory name above.
  }
  const branch = await getCurrentBranch(root);
  return { org, repo, branch };
}

// If $PWD is inside a git worktree that isn't tracked in state.json at all
// (e.g. the repo's original checkout), surface it as one extra host-mode
// row so `wkt list` is useful even from an untracked location.
export async function findCurrentDirEntry(
  entries: ListEntry[],
  cwd: string = process.cwd(),
): Promise<ListEntry | undefined> {
  let root: string;
  try {
    root = await getRepoRoot(cwd);
  } catch {
    return undefined;
  }

  const realRoot = await fs.realpath(root).catch(() => root);
  for (const entry of entries) {
    const realTracked = await fs
      .realpath(entry.record.worktreePath)
      .catch(() => entry.record.worktreePath);
    if (realTracked === realRoot) {
      return undefined;
    }
  }

  const { org, repo, branch } = await identifyCurrentDir(root);
  const size = await directorySize(root);

  return {
    record: {
      name: worktreeName(org, repo, branch),
      org,
      repo,
      branch,
      repoRoot: root,
      worktreePath: root,
      mode: 'host',
      createdAt: '',
    },
    running: false,
    volumeSize: size,
    unmanaged: true,
  };
}

// `wkt open <name>` on a name that isn't tracked yet: if $PWD is itself the
// worktree that name refers to (the untracked row `wkt list` shows), adopt
// it as a real host-mode record instead of failing — there's already a
// perfectly good git worktree sitting right here, it just never went
// through `wkt add`. Never creates a new git worktree; only registers the
// existing directory.
async function adoptCurrentDirWorktree(
  name: string,
  state: WktState,
  cwd: string = process.cwd(),
): Promise<WorktreeRecord | undefined> {
  let root: string;
  try {
    root = await getRepoRoot(cwd);
  } catch {
    return undefined;
  }
  const { org, repo, branch } = await identifyCurrentDir(root);
  if (worktreeName(org, repo, branch) !== name) {
    return undefined;
  }

  const record: WorktreeRecord = {
    name,
    org,
    repo,
    branch,
    repoRoot: root,
    worktreePath: root,
    mode: 'host',
    createdAt: new Date().toISOString(),
  };
  state.worktrees[name] = record;
  await writeState(state);
  return record;
}

// `wkt open <name>` on a name that isn't tracked and doesn't match $PWD:
// if it names a local branch of the repo at $PWD that isn't checked out
// anywhere, create a brand-new host worktree for it (same as `wkt add
// <branch>`) instead of failing. This is what lets `wkt open`'s picker
// double as "create a worktree from a branch already on the host".
async function createFromLocalBranch(
  name: string,
  cwd: string,
): Promise<WorktreeRecord | undefined> {
  let ctx: RepoContext;
  try {
    ctx = await resolveRepoContext(cwd);
  } catch {
    return undefined;
  }
  const prefix = `${worktreeName(ctx.org, ctx.repo, '')}`;
  if (!name.startsWith(prefix)) {
    return undefined;
  }
  const branch = name.slice(prefix.length);
  if (!branch || !(await branchExists(ctx.root, branch))) {
    return undefined;
  }
  return addWorktree(branch, cwd, {});
}

// Local branches of the repo at `cwd` that aren't already a worktree
// anywhere (this one or any other) and aren't already one of `existingNames`
// — candidates `wkt open`'s picker offers to turn into a new host worktree.
export async function listCreatableBranches(
  existingNames: Set<string>,
  cwd: string = process.cwd(),
): Promise<ListEntry[]> {
  let ctx: RepoContext;
  try {
    ctx = await resolveRepoContext(cwd);
  } catch {
    return [];
  }
  const [branches, checkedOut] = await Promise.all([
    listLocalBranches(ctx.root),
    listWorktreeBranches(ctx.root),
  ]);

  const entries: ListEntry[] = [];
  for (const branch of branches) {
    if (checkedOut.has(branch)) {
      continue;
    }
    const name = worktreeName(ctx.org, ctx.repo, branch);
    if (existingNames.has(name)) {
      continue;
    }
    entries.push({
      record: {
        name,
        org: ctx.org,
        repo: ctx.repo,
        branch,
        repoRoot: ctx.root,
        worktreePath: '',
        mode: 'host',
        createdAt: '',
      },
      running: false,
      creatable: true,
    });
  }
  return entries;
}

// The entry (tracked or the untracked current-dir row) whose checkout is the
// repo root containing `cwd`, if any.
export async function findPwdEntry(
  entries: ListEntry[],
  cwd: string = process.cwd(),
): Promise<ListEntry | undefined> {
  let root: string;
  try {
    root = await getRepoRoot(cwd);
  } catch {
    return undefined;
  }
  const realRoot = await fs.realpath(root).catch(() => root);
  for (const entry of entries) {
    if (entry.creatable) {
      continue;
    }
    const real = await fs.realpath(entry.record.worktreePath).catch(() => entry.record.worktreePath);
    if (real === realRoot) {
      return entry;
    }
  }
  return undefined;
}

export async function removeWorktree(name: string): Promise<void> {
  const state = await readState();
  const record = getRecord(state, name);

  if (record.mode === 'host') {
    await killHostTmuxSession(tmuxSessionName(record.org, record.repo, record.branch, record.worktreePath)).catch(
      () => undefined,
    );
  } else {
    await removeContainer(record.container!).catch(() => undefined);
    await removeVolume(record.volume!).catch(() => undefined);
  }
  await worktreeRemove(record.repoRoot, record.worktreePath).catch(() => undefined);

  delete state.worktrees[name];
  await writeState(state);
}

export interface SyncOptions {
  dryRun?: boolean;
  delete?: boolean;
}

function assertSandbox(record: WorktreeRecord, action: string): void {
  if (record.mode === 'host') {
    throw new Error(`"${record.name}" already runs on the host — there's nothing to ${action}`);
  }
}

export async function syncWorktree(name: string, opts: SyncOptions = {}): Promise<string> {
  const state = await readState();
  const record = getRecord(state, name);
  assertSandbox(record, 'sync');
  return syncVolumeToHost({
    volume: record.volume!,
    hostWorktreePath: record.worktreePath,
    dryRun: opts.dryRun,
    delete: opts.delete,
  });
}

export type PromoteResult = 'created' | 'up-to-date';

export async function promoteWorktree(name: string): Promise<PromoteResult> {
  const state = await readState();
  const record = getRecord(state, name);
  assertSandbox(record, 'promote');

  const hostTip = await revParse(record.repoRoot, record.branch);
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wkt-bundle-'));
  const scratchRef = `refs/wkt/promote/${record.branch}`;
  try {
    const result = await createPromoteBundle({
      volume: record.volume!,
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

// Host mode has no separate container copy to bundle commits from — the
// worktree on disk already is the one true copy — so skip straight to a
// plain push.
export async function pushWorktree(name: string): Promise<number> {
  const state = await readState();
  const record = getRecord(state, name);
  if (record.mode !== 'host') {
    await promoteWorktree(name);
  }
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
  assertSandbox(record, 'reset');

  const originUrl = sanitizeRemoteUrl(await getOriginUrl(record.repoRoot));
  const volume = record.volume!;

  await removeContainer(record.container!).catch(() => undefined);
  await removeVolume(volume).catch(() => undefined);

  await createVolume(volume);
  try {
    await seedSanitizedClone({
      hostRepoRoot: record.repoRoot,
      volume,
      branch: record.branch,
      originUrl,
    });
    await createContainerFor(record as typeof record & { volume: string; container: string }, {});
  } catch (err) {
    await removeVolume(volume).catch(() => undefined);
    throw err;
  }
}

// Removes every wkt container (Docker refuses to remove a volume still
// referenced by a container, even a stopped one), then deletes and
// recreates the shared home volume from scratch. Containers themselves are
// cheap: `wkt open` recreates whichever ones are used again. Host worktrees
// have no container and share nothing with wkt-home, so they're skipped.
export async function resetHome(): Promise<void> {
  const state = await readState();
  for (const record of Object.values(state.worktrees)) {
    if (record.mode === 'host') {
      continue;
    }
    const status = await containerState(record.container!);
    if (status !== 'absent') {
      await removeContainer(record.container!).catch(() => undefined);
    }
  }
  await removeVolume(HOME_VOLUME).catch(() => undefined);
  await createVolume(HOME_VOLUME);
}

export interface CleanReport {
  stoppedContainersRemoved: string[];
  orphanedVolumesRemoved: string[];
  imagePruneOutput: string;
}

// Only ever touches: (1) containers/volumes whose names carry the wkt-*
// naming convention (never a container/volume this tool didn't create),
// and (2) image layers labeled dev.wkt.image=true. See project plan
// decision #6 — cleanup must never reach unrelated Docker resources.
export async function cleanResources(opts: { dryRun?: boolean } = {}): Promise<CleanReport> {
  const state = await readState();
  const trackedVolumes = new Set(Object.values(state.worktrees).map((r) => r.volume));

  const containers = await listContainersByPrefix('wkt-');
  const stoppedContainersRemoved: string[] = [];
  for (const container of containers) {
    if (container.running) {
      continue;
    }
    // A stopped container that's still tracked is safe to remove too: the
    // volume (the real data) is untouched, and `wkt open` recreates it.
    if (!opts.dryRun) {
      await removeContainer(container.name).catch(() => undefined);
    }
    stoppedContainersRemoved.push(container.name);
  }

  const volumes = await listVolumesByPrefix('wkt-vol-');
  const orphanedVolumesRemoved: string[] = [];
  for (const volume of volumes) {
    if (trackedVolumes.has(volume)) {
      continue;
    }
    if (!opts.dryRun) {
      await removeVolume(volume).catch(() => undefined);
    }
    orphanedVolumesRemoved.push(volume);
  }

  const imagePruneOutput = opts.dryRun ? '' : await pruneDanglingImages();

  return { stoppedContainersRemoved, orphanedVolumesRemoved, imagePruneOutput };
}
