import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostSessionName, listWorktrees, openWorktree, requestHandoff } from '../worktree.js';

const execFileAsync = promisify(execFile);

export interface SwitchCliOptions {
  list?: boolean;
  session?: string;
}

async function tmux(args: string[]): Promise<void> {
  await execFileAsync('tmux', args);
}

async function notify(message: string): Promise<void> {
  await tmux(['display-message', '--', message]).catch(() => undefined);
}

// Machine-readable worktree list for the statusline workspace menu
// (wkt-workspace-menu): one tab-separated "name, branch, mode, running" per line.
async function printList(): Promise<void> {
  const entries = (await listWorktrees()).filter((e) => !e.creatable);
  for (const { record, running } of entries) {
    console.log([record.name, record.branch, record.mode, running ? 'yes' : 'no'].join('\t'));
  }
}

// Detach this session's client and ask the `wkt` process that attached it to
// attach the target worktree next (see attach() in worktree.ts).
async function switchTo(name: string, session: string): Promise<void> {
  const record = await openWorktree(name); // starts a sandbox container if needed
  if (record.mode === 'host' && hostSessionName(record) === session) {
    return;
  }
  await requestHandoff(name, session);
}

export async function switchAction(
  name: string | undefined,
  options: SwitchCliOptions,
): Promise<void> {
  const session = options.session ?? '';
  try {
    if (options.list) {
      await printList();
    } else if (name) {
      await switchTo(name, session);
    } else {
      throw new Error('give a worktree name, or --list');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.stdout.isTTY) {
      throw err;
    }
    await notify(`wkt switch: ${message}`);
    process.exitCode = 1;
  }
}
