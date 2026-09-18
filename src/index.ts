#!/usr/bin/env node
import { Command } from 'commander';
import { doctorAction } from './commands/doctor.js';
import { buildImageAction } from './commands/build-image.js';
import { notImplemented } from './commands/stub.js';

const program = new Command();

program
  .name('wkt')
  .description('Locked-down, isolated Docker development environments built around git worktree.')
  .version('0.1.0');

program
  .command('add <branch>')
  .description('git worktree add + volume + container + tmux session (creates + opens)')
  .action(notImplemented('add'));

program
  .command('open [name]')
  .description('attach to an existing worktree (or create if missing)')
  .option('--no-create', "fail instead of creating if the volume doesn't exist")
  .option('--pull', 'check the image digest on Docker Hub before starting')
  .option('--rebuild', 'rebuild the local devcontainer image from docker/Dockerfile')
  .option(
    '-p, --port, --publish <spec>',
    'publish ports (docker run -p semantics, repeatable)',
    collect,
    [],
  )
  .option('--host', '--network=host')
  .action(notImplemented('open'));

program
  .command('list')
  .description('table: name, branch, container status, volume size, last synced')
  .option('--all', 'include stopped/orphaned entries')
  .action(notImplemented('list'));

program
  .command('sync [name]')
  .description('rsync file changes: volume → host worktree (not .git)')
  .option('--dry-run', 'show what would change without syncing')
  .option('--delete', 'delete files on the host that were removed in the volume')
  .option('--yes', 'skip confirmation')
  .action(notImplemented('sync'));

const gitCmd = program.command('git').description('git operations scoped to a worktree');

gitCmd
  .command('promote [name]')
  .description('bundle in-container commits → fetch onto host worktree')
  .action(notImplemented('git promote'));

gitCmd
  .command('push [name]')
  .description('promote, then git push on host')
  .action(notImplemented('git push'));

gitCmd
  .command('pull [name]')
  .description('ordinary host git pull scoped to that worktree')
  .action(notImplemented('git pull'));

gitCmd
  .command('fetch [name]')
  .description('ordinary host git fetch scoped to that worktree')
  .action(notImplemented('git fetch'));

gitCmd
  .command('status [name]')
  .description('ordinary host git status scoped to that worktree')
  .action(notImplemented('git status'));

program
  .command('reset [name]')
  .description('host worktree → volume (re-seed, re-clone sanitized .git)')
  .option('--yes', 'skip confirmation')
  .action(notImplemented('reset'));

program
  .command('reset-home')
  .description('delete + recreate the shared wkt-home volume (stops all containers first)')
  .option('--yes', 'skip confirmation')
  .action(notImplemented('reset-home'));

program
  .command('rm <name>')
  .description('remove container + volume (+ managed git worktree if wkt created it)')
  .option('--yes', 'skip confirmation')
  .action(notImplemented('rm'));

program
  .command('clean')
  .description(
    'prune only wkt-managed stopped containers / orphaned volumes / dangling image layers',
  )
  .option('--yes', 'skip confirmation')
  .option('--dry-run', 'show what would be removed without removing it')
  .action(notImplemented('clean'));

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
