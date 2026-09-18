import readline from 'node:readline/promises';
import { resetHome } from '../worktree.js';

export interface ResetHomeCliOptions {
  yes?: boolean;
}

export async function resetHomeAction(options: ResetHomeCliOptions): Promise<void> {
  if (!options.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      'This removes every wkt container (they recreate on next "wkt open") and deletes the ' +
        'shared wkt-home volume (npm globals, dotfiles, anything installed there). Continue? [y/N] ',
    );
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Aborted.');
      return;
    }
  }

  await resetHome();
  console.log('Reset wkt-home.');
}
