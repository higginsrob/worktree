import { listWorktrees } from '../worktree.js';

export interface ListCliOptions {
  all?: boolean;
}

export async function listAction(options: ListCliOptions): Promise<void> {
  const entries = await listWorktrees({ all: options.all });

  if (entries.length === 0) {
    console.log('No worktrees yet — run "wkt add <branch>" to create one.');
    return;
  }

  const rows = entries.map((entry) => ({
    name: entry.record.name,
    branch: entry.record.branch,
    status: entry.status,
    size: entry.volumeSize ?? '-',
    lastSynced: entry.record.lastSyncedAt ?? '-',
  }));

  const columns: Array<{ key: keyof (typeof rows)[number]; label: string }> = [
    { key: 'name', label: 'NAME' },
    { key: 'branch', label: 'BRANCH' },
    { key: 'status', label: 'STATUS' },
    { key: 'size', label: 'SIZE' },
    { key: 'lastSynced', label: 'LAST SYNCED' },
  ];

  const widths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((row) => String(row[col.key]).length)),
  );

  const formatRow = (values: string[]): string =>
    values.map((value, i) => value.padEnd(widths[i]!)).join('  ');

  console.log(formatRow(columns.map((col) => col.label)));
  for (const row of rows) {
    console.log(formatRow(columns.map((col) => String(row[col.key]))));
  }
}
