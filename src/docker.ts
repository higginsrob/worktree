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

// Stubs — implemented in milestone 3 (worktree lifecycle) / 2 (image build).
export async function runContainer(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
}

export async function execInContainer(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
}

export async function createVolume(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
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
