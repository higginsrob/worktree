import { pullImage, buildImage } from '../docker.js';
import {
  openWorktree,
  resolveDefaultName,
  attach,
  listWorktrees,
  findCurrentDirEntry,
  listCreatableBranches,
  findPwdEntry,
  type ListEntry,
} from '../worktree.js';
import { ensureProject, isUntrackedProject } from './clone.js';
import { selectWorktree } from '../ui/select-worktree.js';

export interface OpenCliOptions {
  create?: boolean; // commander sets this to false for --no-create
  pull?: boolean;
  rebuild?: boolean;
  port?: string[];
  publish?: string[];
  networkHost?: boolean;
  branch?: boolean; // --branch: true, --no-branch: false, neither: undefined
}

async function resolveName(
  name: string | undefined,
  opts: { noCreate?: boolean; branch?: boolean },
): Promise<string | undefined> {
  if (name) {
    return name;
  }
  // Non-interactive (piped/scripted) stdin can't drive the picker, so keep
  // the old deterministic behavior: auto-pick if there's exactly one
  // worktree, otherwise fail with the full list of names to choose from.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return resolveDefaultName();
  }
  let entries = await listWorktrees();
  // Lets the picker adopt-and-open the current checkout even if it was
  // never `wkt add`ed — openWorktree does the actual adoption by name.
  const current = await findCurrentDirEntry(entries);
  if (current) {
    entries.push(current);
  }
  // --no-branch hides $PWD's branch rows; --branch shows only $PWD's group.
  if (!opts.noCreate && opts.branch !== false) {
    // Local branches at $PWD's repo that aren't a worktree yet — picking one
    // creates it on the spot (openWorktree does the actual creation by name).
    const existingNames = new Set(entries.map((e) => e.record.name));
    entries.push(...(await listCreatableBranches(existingNames)));
  }

  // The $PWD checkout plus its local branches form their own group, listed
  // first; the remaining worktrees follow.
  const pwdEntry = await findPwdEntry(entries);
  const group: ListEntry[] = [
    ...(pwdEntry ? [pwdEntry] : []),
    ...entries.filter((e) => e.creatable),
  ];
  const others = entries.filter((e) => !group.includes(e));
  if (opts.branch === true) {
    if (group.length === 0) {
      throw new Error('--branch: current directory is not in a git repository');
    }
    entries = group;
  } else {
    entries = [...group, ...others];
  }
  if (entries.length === 0) {
    throw new Error('no worktrees exist yet — run "wkt add <branch>" first');
  }
  const picked = await selectWorktree(entries);
  return picked ?? undefined;
}

export async function openAction(name: string | undefined, options: OpenCliOptions): Promise<void> {
  if (options.rebuild) {
    await buildImage();
  } else if (options.pull) {
    await pullImage();
  }

  // `wkt open org/repo`: clone to $HOME/Github/<org>/<repo> if missing, cd
  // there, then continue as a bare `wkt open` in that project.
  if (name && (await isUntrackedProject(name))) {
    await ensureProject(name);
    name = undefined;
  }

  const resolvedName = await resolveName(name, {
    noCreate: options.create === false,
    branch: options.branch,
  });
  if (!resolvedName) {
    console.log('Cancelled.');
    return;
  }

  const record = await openWorktree(resolvedName, {
    noCreate: options.create === false,
    ports: [...(options.port ?? []), ...(options.publish ?? [])],
    networkHost: options.networkHost,
  });

  const sandboxOnlyOptionGiven =
    options.pull ||
    options.rebuild ||
    (options.port?.length ?? 0) > 0 ||
    (options.publish?.length ?? 0) > 0 ||
    options.networkHost;
  if (record.mode !== 'sandbox' && sandboxOnlyOptionGiven) {
    console.log(
      'Note: --pull/--rebuild/--port/--publish/--network-host only apply to --sandbox worktrees — ignored.',
    );
  }

  const code = await attach(record);
  process.exitCode = code;
}
