import { listWorktrees, findCurrentDirEntry } from '../worktree.js';
import { WORKTREE_COLUMNS, columnWidths, worktreeRows } from '../ui/worktree-table.js';

export async function listAction(): Promise<void> {
  const entries = await listWorktrees();
  const current = await findCurrentDirEntry(entries);
  if (current) {
    entries.push(current);
  }

  if (entries.length === 0) {
    console.log('No worktrees yet — run "wkt add <branch>" to create one.');
    return;
  }

  const rows = worktreeRows(entries);
  const widths = columnWidths(rows);

  const formatRow = (values: string[]): string =>
    values.map((value, i) => value.padEnd(widths[i]!)).join('  ');

  console.log(formatRow(WORKTREE_COLUMNS.map((col) => col.label)));
  for (const row of rows) {
    console.log(formatRow(WORKTREE_COLUMNS.map((col) => String(row[col.key]))));
  }
}
