import type { ListEntry } from '../worktree.js';

export interface WorktreeRow {
  name: string;
  branch: string;
  mode: string;
  running: string;
  size: string;
  lastSynced: string;
}

export const WORKTREE_COLUMNS: Array<{ key: keyof WorktreeRow; label: string }> = [
  { key: 'name', label: 'NAME' },
  { key: 'branch', label: 'BRANCH' },
  { key: 'mode', label: 'MODE' },
  { key: 'running', label: 'RUNNING' },
  { key: 'size', label: 'SIZE' },
  { key: 'lastSynced', label: 'LAST SYNCED' },
];

export function worktreeRows(entries: ListEntry[]): WorktreeRow[] {
  return entries.map((entry) => ({
    name: entry.record.name,
    branch: entry.record.branch,
    mode: entry.creatable
      ? 'branch (new)'
      : entry.unmanaged
        ? `${entry.record.mode} (untracked)`
        : entry.record.mode,
    running: entry.creatable || entry.unmanaged ? '-' : entry.running ? 'yes' : 'no',
    size: entry.creatable ? '-' : (entry.volumeSize ?? '-'),
    lastSynced: entry.record.lastSyncedAt ?? '-',
  }));
}

export function columnWidths(rows: WorktreeRow[]): number[] {
  return WORKTREE_COLUMNS.map((col) =>
    Math.max(col.label.length, ...rows.map((row) => String(row[col.key]).length)),
  );
}
