import { pullImage, buildImage } from '../docker.js';
import {
  openWorktree,
  resolveDefaultName,
  attach,
  listWorktrees,
  findCurrentDirEntry,
  listCreatableBranches,
} from '../worktree.js';
import { selectWorktree } from '../ui/select-worktree.js';

export interface OpenCliOptions {
  create?: boolean; // commander sets this to false for --no-create
  pull?: boolean;
  rebuild?: boolean;
  port?: string[];
  publish?: string[];
  networkHost?: boolean;
}

async function resolveName(
  name: string | undefined,
  opts: { noCreate?: boolean },
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
  const entries = await listWorktrees();
  // Lets the picker adopt-and-open the current checkout even if it was
  // never `wkt add`ed — openWorktree does the actual adoption by name.
  const current = await findCurrentDirEntry(entries);
  if (current) {
    entries.push(current);
  }
  if (!opts.noCreate) {
    // Local branches at $PWD's repo that aren't a worktree yet — picking one
    // creates it on the spot (openWorktree does the actual creation by name).
    const existingNames = new Set(entries.map((e) => e.record.name));
    entries.push(...(await listCreatableBranches(existingNames)));
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

  const resolvedName = await resolveName(name, { noCreate: options.create === false });
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
