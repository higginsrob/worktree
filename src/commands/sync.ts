import readline from 'node:readline/promises';
import { syncWorktree, resolveDefaultName } from '../worktree.js';

export interface SyncCliOptions {
  dryRun?: boolean;
  delete?: boolean;
  yes?: boolean;
}

export async function syncAction(name: string | undefined, options: SyncCliOptions): Promise<void> {
  const resolvedName = name ?? (await resolveDefaultName());

  if (options.delete && !options.dryRun && !options.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `--delete will remove host files not present in "${resolvedName}"'s container. Continue? [y/N] `,
    );
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Aborted.');
      return;
    }
  }

  const output = await syncWorktree(resolvedName, {
    dryRun: options.dryRun,
    delete: options.delete,
  });
  if (output) {
    console.log(output);
  }
  console.log(options.dryRun ? 'Dry run complete — no files changed.' : `Synced ${resolvedName}`);
}
