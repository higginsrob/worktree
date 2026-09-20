import readline from 'node:readline';
import { removeWorktree, type ListEntry } from '../worktree.js';
import { WORKTREE_COLUMNS, columnWidths, worktreeRows } from './worktree-table.js';

const NOTE = 'wkt open - Create, attach or delete a worktree workspace. Type "D" to delete'

// Only a real tracked worktree can be deleted — not the untracked current-dir
// row (that's just your own checkout) and not a creatable-branch row (there's
// no worktree there yet to delete).
function isDeletable(entry: ListEntry): boolean {
  return !entry.unmanaged && !entry.creatable;
}

// Interactive picker for `wkt open` with no name given: same columns as
// `wkt list`, navigated with arrow keys or vim j/k, Enter to confirm, Esc/q/
// Ctrl-C to cancel, D to delete the highlighted worktree. Caller must
// confirm stdin/stdout are a TTY first — this assumes an interactive
// terminal and doesn't check itself.
export async function selectWorktree(initialEntries: ListEntry[]): Promise<string | null> {
  let entries = initialEntries;
  let cursor = 0;
  let linesDrawn = 0;
  let status = '';
  let confirmDelete = false;
  let busy = false;

  const pad = (values: string[], widths: number[]): string =>
    values.map((v, i) => v.padEnd(widths[i]!)).join('  ');

  const renderLines = (): string[] => {
    const rows = worktreeRows(entries);
    const widths = columnWidths(rows);
    const header = pad(
      WORKTREE_COLUMNS.map((c) => c.label),
      widths,
    );
    const body = rows.map((row, i) => {
      const text = pad(
        WORKTREE_COLUMNS.map((c) => String(row[c.key])),
        widths,
      );
      const dim = entries[i]!.creatable;
      if (i === cursor) {
        return `\x1b[${dim ? '2;' : ''}7m> ${text}\x1b[0m`;
      }
      return dim ? `\x1b[2m  ${text}\x1b[0m` : `  ${text}`;
    });
    const lines = ['', `\x1b[33m${NOTE}\x1b[0m`, '', `\x1b[1;36m  ${header}\x1b[0m`, ...body];
    if (confirmDelete) {
      lines.push(`Delete "${entries[cursor]!.record.name}"? [y/N]`);
    } else if (status) {
      lines.push(status);
    }
    return lines;
  };

  const draw = (): void => {
    if (linesDrawn > 0) {
      process.stdout.write(`\x1b[${linesDrawn}A`);
    }
    const lines = renderLines();
    for (const line of lines) {
      process.stdout.write(`\x1b[2K${line}\n`);
    }
    linesDrawn = lines.length;
  };

  const clear = (): void => {
    process.stdout.write(`\x1b[${linesDrawn}A`);
    for (let i = 0; i < linesDrawn; i++) {
      process.stdout.write('\x1b[2K\n');
    }
    process.stdout.write(`\x1b[${linesDrawn}A`);
  };

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw ?? false;
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write('\x1b[?25l');

    const finish = (result: string | null): void => {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      clear();
      process.stdout.write('\x1b[?25h');
      resolve(result);
    };

    const performDelete = async (): Promise<void> => {
      const target = entries[cursor]!;
      busy = true;
      status = `Deleting "${target.record.name}"…`;
      draw();
      try {
        await removeWorktree(target.record.name);
        entries = entries.filter((e) => e !== target);
        cursor = Math.min(cursor, Math.max(entries.length - 1, 0));
        status = `Deleted "${target.record.name}".`;
      } catch (err) {
        status = `Error deleting "${target.record.name}": ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        busy = false;
        if (entries.length === 0) {
          finish(null);
        } else {
          draw();
        }
      }
    };

    const onKeypress = (str: string | undefined, key: readline.Key | undefined): void => {
      if (!key || busy) {
        return;
      }

      if (confirmDelete) {
        confirmDelete = false;
        if (key.name === 'y') {
          void performDelete();
        } else {
          status = '';
          draw();
        }
        return;
      }

      if (key.name === 'up' || key.name === 'k') {
        cursor = (cursor - 1 + entries.length) % entries.length;
        status = '';
        draw();
      } else if (key.name === 'down' || key.name === 'j') {
        cursor = (cursor + 1) % entries.length;
        status = '';
        draw();
      } else if (key.name === 'return') {
        finish(entries[cursor]!.record.name);
      } else if ((key.name === 'd' && key.shift) || str === 'D') {
        if (isDeletable(entries[cursor]!)) {
          confirmDelete = true;
          draw();
        } else {
          status = "Can't delete — not a tracked worktree.";
          draw();
        }
      } else if (key.name === 'escape' || key.name === 'q' || (key.ctrl && key.name === 'c')) {
        finish(null);
      }
    };

    stdin.on('keypress', onKeypress);
    draw();
  });
}
