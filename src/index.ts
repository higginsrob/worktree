#!/usr/bin/env node
import { Command } from 'commander';
import { doctorAction } from './commands/doctor.js';
import { buildImageAction } from './commands/build-image.js';
import { addAction } from './commands/add.js';
import { openAction } from './commands/open.js';
import { listAction } from './commands/list.js';
import { rmAction } from './commands/rm.js';
import { syncAction } from './commands/sync.js';
import {
  promoteAction,
  pushAction,
  pullAction,
  fetchAction,
  statusAction,
} from './commands/git.js';
import { resetAction } from './commands/reset.js';
import { resetHomeAction } from './commands/reset-home.js';
import { cleanAction } from './commands/clean.js';
import { notImplemented } from './commands/stub.js';

const program = new Command();

program
  .name('wkt')
  .description('Locked-down, isolated Docker development environments built around git worktree.')
  .version('0.1.0');

program
  .command('add <branch>')
  .description('git worktree add + volume + container + tmux session (creates + opens)')
  .action(addAction);

program
  .command('open [name]')
  .description('attach to an existing worktree (or create if missing)')
  .option('--no-create', "fail instead of creating if the volume doesn't exist")
  .option('--pull', 'check the image digest on Docker Hub before starting')
  .option('--rebuild', 'rebuild the local devcontainer image from docker/Dockerfile')
  .option('-p, --port <spec>', 'publish ports (docker run -p semantics, repeatable)', collect, [])
  .option('--publish <spec>', 'alias for --port', collect, [])
  .option('--host', '--network=host')
  .action(openAction);

program
  .command('list')
  .description('table: name, branch, container status, volume size, last synced')
  .option('--all', 'include stopped/orphaned entries')
  .action(listAction);

program
  .command('sync [name]')
  .description('rsync file changes: volume → host worktree (not .git)')
  .option('--dry-run', 'show what would change without syncing')
  .option('--delete', 'delete files on the host that were removed in the volume')
  .option('--yes', 'skip confirmation')
  .action(syncAction);

const gitCmd = program.command('git').description('git operations scoped to a worktree');

gitCmd
  .command('promote [name]')
  .description('bundle in-container commits → fetch onto host worktree')
  .action(promoteAction);

gitCmd.command('push [name]').description('promote, then git push on host').action(pushAction);

gitCmd
  .command('pull [name]')
  .description('ordinary host git pull scoped to that worktree')
  .action(pullAction);

gitCmd
  .command('fetch [name]')
  .description('ordinary host git fetch scoped to that worktree')
  .action(fetchAction);

gitCmd
  .command('status [name]')
  .description('ordinary host git status scoped to that worktree')
  .action(statusAction);

program
  .command('reset [name]')
  .description('host worktree → volume (re-seed, re-clone sanitized .git)')
  .option('--yes', 'skip confirmation')
  .action(resetAction);

program
  .command('reset-home')
  .description('delete + recreate the shared wkt-home volume (removes all containers first)')
  .option('--yes', 'skip confirmation')
  .action(resetHomeAction);

program
  .command('rm <name>')
  .description('remove container + volume (+ managed git worktree if wkt created it)')
  .option('--yes', 'skip confirmation')
  .action(rmAction);

program
  .command('clean')
  .description(
    'prune only wkt-managed stopped containers / orphaned volumes / dangling image layers',
  )
  .option('--yes', 'skip confirmation')
  .option('--dry-run', 'show what would be removed without removing it')
  .action(cleanAction);

program
  .command('doctor')
  .description('check host deps: docker, git, node, disk space')
  .action(doctorAction);

program
  .command('build-image')
  .description('build higginsrob/worktree:latest locally from docker/Dockerfile')
  .action(buildImageAction);

program
  .command('exec [cmd...]')
  .description("docker exec helper into the current/named worktree's container")
  .action(notImplemented('exec'));

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
