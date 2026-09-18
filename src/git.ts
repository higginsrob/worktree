import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

// Stubs — implemented in milestone 3 (lifecycle) / 4 (sync & promote).
export async function addWorktree(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
}

export async function seedSanitizedClone(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
}

export async function promoteCommits(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented yet');
}
