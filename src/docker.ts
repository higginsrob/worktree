import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

export async function buildImage(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
}
