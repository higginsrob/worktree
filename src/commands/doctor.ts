import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { isDockerAvailable, dockerVersion } from '../docker.js';
import { isGitAvailable, gitVersion } from '../git.js';

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

async function checkDocker(): Promise<Check> {
  const ok = await isDockerAvailable();
  const version = ok ? await dockerVersion() : undefined;
  return {
    name: 'docker',
    ok,
    detail: ok ? (version ?? 'available') : 'not found or daemon unreachable',
  };
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
  const checks = await Promise.all([checkNode(), checkDocker(), checkGit(), checkDiskSpace()]);

  let allOk = true;
  for (const check of checks) {
    allOk &&= check.ok;
    const badge = check.ok ? 'OK' : 'FAIL';
    console.log(`[${badge}] ${check.name}: ${check.detail}`);
  }

  if (!allOk) {
    process.exitCode = 1;
  }
}
