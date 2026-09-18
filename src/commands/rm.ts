import readline from 'node:readline/promises';
import { removeWorktree } from '../worktree.js';

export interface RmCliOptions {
  yes?: boolean;
}

export async function rmAction(name: string, options: RmCliOptions): Promise<void> {
  if (!options.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Remove worktree "${name}" (container, volume, and git worktree)? [y/N] `,
    );
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Aborted.');
      return;
    }
  }

  await removeWorktree(name);
  console.log(`Removed ${name}`);
}
