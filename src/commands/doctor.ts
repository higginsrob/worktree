import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { isDockerAvailable, dockerVersion } from '../docker.js';
import { isGitAvailable, gitVersion } from '../git.js';
import { isTmuxAvailable, tmuxVersion, isVimAvailable, vimVersion } from '../host.js';

const execFileAsync = promisify(execFile);

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkNode(): Promise<Check> {
  const version = process.version;
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  return {
    name: 'node',
    ok: major >= 20,
    detail: major >= 20 ? version : `${version} (requires >= 20)`,
  };
}

// Only required for `--sandbox` worktrees, so this doesn't gate `allOk`.
async function checkDocker(): Promise<Check> {
  const ok = await isDockerAvailable();
  const version = ok ? await dockerVersion() : undefined;
  return {
    name: 'docker (optional, needed for --sandbox)',
    ok,
    detail: ok ? (version ?? 'available') : 'not found or daemon unreachable',
  };
}

async function checkTmux(): Promise<Check> {
  const ok = await isTmuxAvailable();
  const version = ok ? await tmuxVersion() : undefined;
  return { name: 'tmux', ok, detail: ok ? (version ?? 'available') : 'not found' };
}

async function checkVim(): Promise<Check> {
  const ok = await isVimAvailable();
  const version = ok ? await vimVersion() : undefined;
  return { name: 'vim', ok, detail: ok ? (version ?? 'available') : 'not found' };
}

async function checkGit(): Promise<Check> {
  const ok = await isGitAvailable();
  const version = ok ? await gitVersion() : undefined;
  return {
    name: 'git',
    ok,
    detail: ok ? (version ?? 'available') : 'not found',
  };
}

async function checkDiskSpace(): Promise<Check> {
  try {
    const { stdout } = await execFileAsync('df', ['-h', os.homedir()]);
    const line = stdout.trim().split('\n').at(-1) ?? '';
    return { name: 'disk space', ok: true, detail: line.trim() };
  } catch {
    return { name: 'disk space', ok: false, detail: 'unable to determine' };
  }
}

export async function doctorAction(): Promise<void> {
  const [required, docker] = await Promise.all([
    Promise.all([checkNode(), checkGit(), checkTmux(), checkVim(), checkDiskSpace()]),
    checkDocker(),
  ]);

  let allOk = true;
  for (const check of required) {
    allOk &&= check.ok;
    const badge = check.ok ? 'OK' : 'FAIL';
    console.log(`[${badge}] ${check.name}: ${check.detail}`);
  }
  console.log(`[${docker.ok ? 'OK' : 'WARN'}] ${docker.name}: ${docker.detail}`);

  if (!allOk) {
    process.exitCode = 1;
  }
}
