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
