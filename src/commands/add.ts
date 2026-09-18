import { addWorktree, attach } from '../worktree.js';

export async function addAction(branch: string): Promise<void> {
  const record = await addWorktree(branch);
  console.log(`Created ${record.name} (container ${record.container})`);
  const code = await attach(record);
  process.exitCode = code;
}
