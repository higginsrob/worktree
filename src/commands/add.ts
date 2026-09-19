import { addWorktree, attach } from '../worktree.js';

export interface AddCliOptions {
  sandbox?: boolean;
}

export async function addAction(branch: string, options: AddCliOptions): Promise<void> {
  const record = await addWorktree(branch, process.cwd(), { sandbox: options.sandbox });
  const detail = record.mode === 'sandbox' ? `container ${record.container}` : 'host';
  console.log(`Created ${record.name} (${detail})`);
  const code = await attach(record);
  process.exitCode = code;
}
