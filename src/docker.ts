import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { IMAGE_NAME } from './config.js';

const execFileAsync = promisify(execFile);

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
// This module runs from dist/ at runtime; the docker/ build context ships
// alongside dist/ and bin/ at the package root (see package.json "files").
const PACKAGE_ROOT = path.resolve(MODULE_DIR, '..');
export const DOCKER_CONTEXT_DIR = path.join(PACKAGE_ROOT, 'docker');

async function run(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('docker', args);
  return stdout.trim();
}

function runInherit(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
    return true;
  } catch {
    return false;
  }
}

export async function dockerVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'version',
      '--format',
      '{{.Server.Version}}',
    ]);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

export async function imageExists(image: string = IMAGE_NAME): Promise<boolean> {
  try {
    await run(['image', 'inspect', image]);
    return true;
  } catch {
    return false;
  }
}

export async function volumeExists(name: string): Promise<boolean> {
  try {
    await run(['volume', 'inspect', name]);
    return true;
  } catch {
    return false;
  }
}

export async function createVolume(name: string): Promise<void> {
  await run(['volume', 'create', name]);
}

export async function removeVolume(name: string): Promise<void> {
  await run(['volume', 'rm', '-f', name]);
}

export async function volumeSize(
  name: string,
  image: string = IMAGE_NAME,
): Promise<string | undefined> {
  try {
    const out = await run(['run', '--rm', '-v', `${name}:/vol:ro`, image, 'du', '-sh', '/vol']);
    return out.split(/\s+/)[0];
  } catch {
    return undefined;
  }
}

export type ContainerState = 'running' | 'stopped' | 'absent';

export async function containerState(name: string): Promise<ContainerState> {
  try {
    const out = await run(['inspect', '-f', '{{.State.Running}}', name]);
    return out === 'true' ? 'running' : 'stopped';
  } catch {
    return 'absent';
  }
}

export async function removeContainer(name: string): Promise<void> {
  await run(['rm', '-f', name]);
}

export async function startContainer(name: string): Promise<void> {
  await run(['start', name]);
}

export async function stopContainer(name: string): Promise<void> {
  await run(['stop', name]);
}

// True while the container's tmux server still has a session (e.g. after a
// detach, or another terminal is attached). `tmux ls` exits non-zero once the
// last session is gone.
export async function hasTmuxSession(containerName: string): Promise<boolean> {
  try {
    await run(['exec', containerName, 'tmux', 'ls']);
    return true;
  } catch {
    return false;
  }
}

// PID 1 is `sleep infinity` and ignores SIGTERM, so don't wait out the
// default 10s grace period.
export async function stopContainerNow(name: string): Promise<void> {
  await run(['stop', '-t', '1', name]);
}

export interface ContainerSummary {
  name: string;
  running: boolean;
}

// Anchored (`^prefix`) so the name filter can't substring-match an
// unrelated container — see project plan decision #6 (never touch
// non-wkt-managed Docker resources).
export async function listContainersByPrefix(prefix: string): Promise<ContainerSummary[]> {
  const out = await run([
    'ps',
    '-a',
    '--filter',
    `name=^${prefix}`,
    '--format',
    '{{.Names}}\t{{.State}}',
  ]);
  if (!out) {
    return [];
  }
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, state] = line.split('\t');
      return { name: name!, running: state === 'running' };
    });
}

export async function listVolumesByPrefix(prefix: string): Promise<string[]> {
  const out = await run(['volume', 'ls', '--filter', `name=^${prefix}`, '--format', '{{.Name}}']);
  return out ? out.split('\n').filter(Boolean) : [];
}

// Scoped to images built from docker/Dockerfile (see its dev.wkt.image
// label) so this can never prune an unrelated dangling image on the host.
export async function pruneDanglingImages(): Promise<string> {
  return run(['image', 'prune', '-f', '--filter', 'label=dev.wkt.image=true']);
}

export interface RunContainerOptions {
  name: string;
  projectVolume: string;
  workspacePath: string;
  homeVolume: string;
  env?: Record<string, string>;
  ports?: string[];
  networkHost?: boolean;
  image?: string;
}

export async function runContainer(opts: RunContainerOptions): Promise<void> {
  const args = [
    'run',
    '-d',
    // Everything persistent lives in the volumes, so a stopped container has
    // nothing worth keeping; removing it means the next open gets a fresh one
    // built from the current image (and a fresh tmux server/config).
    '--rm',
    '--name',
    opts.name,
    '--read-only',
    '--security-opt',
    'no-new-privileges',
    '--tmpfs',
    '/tmp',
    '--tmpfs',
    '/var/tmp',
    '-v',
    `${opts.projectVolume}:${opts.workspacePath}`,
    '-v',
    `${opts.homeVolume}:/home/dev`,
  ];
  for (const [key, value] of Object.entries(opts.env ?? {})) {
    args.push('-e', `${key}=${value}`);
  }
  for (const port of opts.ports ?? []) {
    args.push('-p', port);
  }
  if (opts.networkHost) {
    args.push('--network', 'host');
  }
  args.push(opts.image ?? IMAGE_NAME);
  await run(args);
}

export function attachTmux(containerName: string, workdir: string): Promise<number> {
  return runInherit([
    'exec',
    '-it',
    containerName,
    'tmux',
    'new-session',
    '-A',
    '-s',
    'main',
    '-c',
    workdir,
  ]);
}

export interface SeedCloneOptions {
  hostRepoRoot: string;
  volume: string;
  branch: string;
  originUrl?: string;
  image?: string;
}

// Clones the host repo (bind-mounted read-only) into the project volume,
// checked out to `branch`, then strips credentials so the in-container
// clone can never push anywhere (see project plan §3, "sanitized clone").
export async function seedSanitizedClone(opts: SeedCloneOptions): Promise<void> {
  const script = `
set -e
git config --global --add safe.directory '*'
git clone --branch "$1" file:///src /dest
if [ -n "$2" ]; then
  git -C /dest remote set-url origin "$2"
else
  git -C /dest remote remove origin 2>/dev/null || true
fi
git -C /dest config --unset-all credential.helper 2>/dev/null || true
chown -R 1000:1000 /dest
`;
  await run([
    'run',
    '--rm',
    '--user',
    '0:0',
    '-v',
    `${opts.hostRepoRoot}:/src:ro`,
    '-v',
    `${opts.volume}:/dest`,
    opts.image ?? IMAGE_NAME,
    'sh',
    '-c',
    script,
    'sh',
    opts.branch,
    opts.originUrl ?? '',
  ]);
}

export interface SyncOptions {
  volume: string;
  hostWorktreePath: string;
  dryRun?: boolean;
  delete?: boolean;
  image?: string;
}

// Copies working-tree files (never .git) from the project volume onto the
// host worktree path, so the host side reflects what's inside the container.
export async function syncVolumeToHost(opts: SyncOptions): Promise<string> {
  const rsyncArgs = ['-a', '-i', '--exclude=.git'];
  if (opts.dryRun) {
    rsyncArgs.push('--dry-run');
  }
  if (opts.delete) {
    rsyncArgs.push('--delete');
  }
  rsyncArgs.push('/src/', '/dest/');
  return run([
    'run',
    '--rm',
    '-v',
    `${opts.volume}:/src:ro`,
    '-v',
    `${opts.hostWorktreePath}:/dest`,
    opts.image ?? IMAGE_NAME,
    'rsync',
    ...rsyncArgs,
  ]);
}

export interface PromoteBundleOptions {
  volume: string;
  branch: string;
  hostTip: string;
  bundleHostDir: string;
  image?: string;
}

export type PromoteBundleResult = 'created' | 'up-to-date';

// Bundles commits reachable from `branch` inside the volume's clone, but not
// yet reachable from `hostTip`, into promote.bundle under bundleHostDir.
export async function createPromoteBundle(
  opts: PromoteBundleOptions,
): Promise<PromoteBundleResult> {
  const script = `
set -e
cd /src
if git bundle create /out/promote.bundle "$1..$2" 2>/tmp/bundle.err; then
  echo CREATED
else
  if grep -q "Refusing to create empty bundle" /tmp/bundle.err; then
    echo UP_TO_DATE
  else
    cat /tmp/bundle.err >&2
    exit 1
  fi
fi
`;
  const out = await run([
    'run',
    '--rm',
    '-v',
    `${opts.volume}:/src:ro`,
    '-v',
    `${opts.bundleHostDir}:/out`,
    opts.image ?? IMAGE_NAME,
    'sh',
    '-c',
    script,
    'sh',
    opts.hostTip,
    opts.branch,
  ]);
  return out.trim() === 'UP_TO_DATE' ? 'up-to-date' : 'created';
}

export async function pullImage(tag: string = IMAGE_NAME): Promise<void> {
  const code = await runInherit(['pull', tag]);
  if (code !== 0) {
    throw new Error(`docker pull exited with code ${code}`);
  }
}

export function buildImage(tag: string = IMAGE_NAME): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['build', '-t', tag, '-f', path.join(DOCKER_CONTEXT_DIR, 'Dockerfile'), DOCKER_CONTEXT_DIR],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker build exited with code ${code}`));
    });
  });
}

// Stub — implemented alongside `wkt exec` (post-milestone-3).
export async function execInContainer(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
}
