#!/usr/bin/env node
import { Command } from 'commander';
import { doctorAction } from './commands/doctor.js';
import { buildImageAction } from './commands/build-image.js';
import { addAction } from './commands/add.js';
import { openAction } from './commands/open.js';
import { cloneAction } from './commands/clone.js';
import { listAction } from './commands/list.js';
import { switchAction } from './commands/switch.js';
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
import { setupHostAction } from './commands/setup-host.js';
import { provisionAction } from './commands/provision.js';
import { notImplemented } from './commands/stub.js';

const program = new Command();

program
  .name('wkt')
  .description(
    'git worktree sessions with a consistent tmux+vim environment — on the host by ' +
      'default, sandboxed in an isolated Docker container with --sandbox.',
  )
  .version('0.1.0');

program
  .command('add <branch>')
  .description('git worktree add + tmux session (creates + opens); add --sandbox to run in Docker')
  .option('--sandbox', 'run in an isolated Docker container instead of directly on the host')
  .action(addAction);

program
  .command('open [name]')
  .description('attach to an existing worktree (recreating its sandbox container if missing)')
  .option('--no-create', "fail instead of creating if the volume doesn't exist (--sandbox only)")
  .option('--branch', "picker: show only the current directory's worktree and its local branches")
  .option('--no-branch', "picker: show only worktrees, not the current directory's local branches")
  .option('--pull', 'check the image digest on Docker Hub before starting (--sandbox only)')
  .option(
    '--rebuild',
    'rebuild the local devcontainer image from docker/Dockerfile (--sandbox only)',
  )
  .option(
    '-p, --port <spec>',
    'publish ports (docker run -p semantics, repeatable, --sandbox only)',
    collect,
    [],
  )
  .option('--publish <spec>', 'alias for --port (--sandbox only)', collect, [])
  .option('--network-host', '--network=host (--sandbox only)')
  .action(openAction);

program
  .command('clone <repo>')
  .description('git clone org/repo (or a URL) into ~/Github/<org>/<repo>, then wkt open there')
  .action(cloneAction);

program
  .command('list')
  .description(
    'table: every tracked worktree (host/sandbox mode, running/not, size, last synced), ' +
      "plus the current directory's worktree if it isn't tracked",
  )
  .action(listAction);

program
  .command('switch [name]', { hidden: true })
  .description('used by the tmux statusline: switch this session\'s client to another worktree')
  .option('--list', 'print tracked worktrees as tab-separated lines (for the statusline menu)')
  .option('--session <name>', 'tmux session being switched away from')
  .action(switchAction);

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
  .description('build higginsrob/worktree:latest locally from docker/Dockerfile (--sandbox only)')
  .action(buildImageAction);

program
  .command('setup-host')
  .description('pre-clone the bundled vim plugin set into the host vim runtime (one-time)')
  .action(setupHostAction);

program
  .command('provision')
  .description('an interactive developer setup guide after a fresh system install')
  .option('--yes', 'install everything that is missing without prompting')
  .option('--dry-run', 'show the commands that would run without running them')
  .option('--list', 'only show what is installed and what is missing')
  .action(provisionAction);

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
