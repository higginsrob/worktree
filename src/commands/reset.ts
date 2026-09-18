import readline from 'node:readline/promises';
import { resetWorktree, resolveDefaultName } from '../worktree.js';

export interface ResetCliOptions {
  yes?: boolean;
}

export async function resetAction(
  name: string | undefined,
  options: ResetCliOptions,
): Promise<void> {
  const resolvedName = name ?? (await resolveDefaultName());

  if (!options.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `This discards any uncommitted or unpromoted work inside "${resolvedName}"'s container ` +
        `and re-seeds it from the host worktree. Continue? [y/N] `,
    );
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Aborted.');
      return;
    }
  }

  await resetWorktree(resolvedName);
  console.log(`Reset ${resolvedName}`);
}
