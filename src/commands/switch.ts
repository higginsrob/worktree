import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { HANDOFF_DIR } from '../config.js';
import { handoffPath, hostSessionName, listWorktrees, openWorktree } from '../worktree.js';
import { WORKTREE_COLUMNS, columnWidths, worktreeRows } from '../ui/worktree-table.js';

const execFileAsync = promisify(execFile);

export interface SwitchCliOptions {
  menu?: boolean;
  session?: string;
  client?: string;
}

// Names are embedded in a tmux command string (double-quoted) that then goes
// through sh (single-quoted), so skip the rare names that can't survive both.
const UNQUOTABLE = /["'$`\\\n]/;

async function tmux(args: string[]): Promise<void> {
  await execFileAsync('tmux', args);
}

async function notify(message: string): Promise<void> {
  await tmux(['display-message', '--', message]).catch(() => undefined);
}

// tmux display-menu with the same columns as `wkt list`; picking a row runs
// `wkt switch <name> --session <current>`. Up/Down/Enter/Esc and the mouse
// are handled by tmux itself.
async function showMenu(session: string, client: string | undefined): Promise<void> {
  const entries = (await listWorktrees()).filter((e) => !e.creatable);
  const rows = worktreeRows(entries);
  const widths = columnWidths(rows);
  const pad = (values: string[]): string => values.map((v, i) => v.padEnd(widths[i]!)).join('  ');
  const esc = (s: string): string => s.replace(/#/g, '##');

  const items: string[] = [`-${esc('  ' + pad(WORKTREE_COLUMNS.map((c) => c.label)))}`, '', ''];
  let shortcut = 1;
  entries.forEach((entry, i) => {
    const name = entry.record.name;
    if (UNQUOTABLE.test(name) || UNQUOTABLE.test(session)) {
      return;
    }
    const current = entry.record.mode === 'host' && hostSessionName(entry.record) === session;
    const text = pad(WORKTREE_COLUMNS.map((c) => String(rows[i]![c.key])));
    const key = shortcut <= 9 ? String(shortcut++) : '';
    items.push(
      `${current ? '* ' : '  '}${esc(text)}`,
      key,
      `run-shell -b "wkt switch '${name}' --session '${session}'"`,
    );
  });
  if (items.length === 3) {
    await notify('wkt: no worktrees to switch to');
    return;
  }

  await tmux([
    'display-menu',
    ...(client ? ['-c', client] : []),
    '-T',
    '#[align=centre] Switch workspace ',
    '-x',
    'R',
    '-y',
    'S',
    ...items,
  ]);
}

// Detach this session's client and ask the `wkt` process that attached it to
// attach the target worktree next (see attach() in worktree.ts).
async function switchTo(name: string, session: string): Promise<void> {
  const record = await openWorktree(name); // starts a sandbox container if needed
  if (record.mode === 'host' && hostSessionName(record) === session) {
    return;
  }
  await fs.mkdir(HANDOFF_DIR, { recursive: true });
  await fs.writeFile(handoffPath(session), name);
  await tmux(['detach-client', '-s', session]);
}

export async function switchAction(
  name: string | undefined,
  options: SwitchCliOptions,
): Promise<void> {
  const session = options.session ?? '';
  try {
    if (options.menu) {
      await showMenu(session, options.client);
    } else if (name) {
      await switchTo(name, session);
    } else {
      throw new Error('give a worktree name, or --menu');
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
