import readline from 'node:readline/promises';
import { cleanResources } from '../worktree.js';

export interface CleanCliOptions {
  yes?: boolean;
  dryRun?: boolean;
}

export async function cleanAction(options: CleanCliOptions): Promise<void> {
  if (!options.dryRun && !options.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      'Remove wkt-managed stopped containers, orphaned volumes, and dangling wkt image ' +
        'layers? [y/N] ',
    );
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Aborted.');
      return;
    }
  }

  const report = await cleanResources({ dryRun: options.dryRun });
  const verb = options.dryRun ? 'Would remove' : 'Removed';

  if (report.stoppedContainersRemoved.length > 0) {
    console.log(`${verb} ${report.stoppedContainersRemoved.length} stopped container(s):`);
    for (const name of report.stoppedContainersRemoved) {
      console.log(`  ${name}`);
    }
  }

  if (report.orphanedVolumesRemoved.length > 0) {
    console.log(`${verb} ${report.orphanedVolumesRemoved.length} orphaned volume(s):`);
    for (const name of report.orphanedVolumesRemoved) {
      console.log(`  ${name}`);
    }
  }

  if (report.stoppedContainersRemoved.length === 0 && report.orphanedVolumesRemoved.length === 0) {
    console.log('No stopped containers or orphaned volumes to clean up.');
  }

  if (report.imagePruneOutput) {
    console.log(report.imagePruneOutput);
  }
}
