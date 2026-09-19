import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_DIR, STATE_FILE } from './config.js';

export type WorktreeMode = 'host' | 'sandbox';

export interface WorktreeRecord {
  name: string;
  org: string;
  repo: string;
  branch: string;
  repoRoot: string;
  worktreePath: string;
  mode: WorktreeMode;
  volume?: string;
  container?: string;
  createdAt: string;
  lastSyncedAt?: string;
}

export interface WktState {
  worktrees: Record<string, WorktreeRecord>;
}

const EMPTY_STATE: WktState = { worktrees: {} };

export async function readState(): Promise<WktState> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const state = JSON.parse(raw) as WktState;
    // Migration: every record predating `mode` always had a container/volume
    // (sandbox was the only option), so backfilling is unambiguous.
    for (const record of Object.values(state.worktrees)) {
      record.mode ??= 'sandbox';
    }
    return state;
  } catch (err) {
    if (isNotFound(err)) {
      return { ...EMPTY_STATE, worktrees: {} };
    }
    throw err;
  }
}

export async function writeState(state: WktState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}
