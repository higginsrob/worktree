import { pullImage, buildImage } from '../docker.js';
import { openWorktree, resolveDefaultName, attach } from '../worktree.js';

export interface OpenCliOptions {
  create?: boolean; // commander sets this to false for --no-create
  pull?: boolean;
  rebuild?: boolean;
  port?: string[];
  publish?: string[];
  host?: boolean;
}

export async function openAction(name: string | undefined, options: OpenCliOptions): Promise<void> {
  if (options.rebuild) {
    await buildImage();
  } else if (options.pull) {
    await pullImage();
  }

  const resolvedName = name ?? (await resolveDefaultName());
  const record = await openWorktree(resolvedName, {
    noCreate: options.create === false,
    ports: [...(options.port ?? []), ...(options.publish ?? [])],
    networkHost: options.host,
  });
  const code = await attach(record);
  process.exitCode = code;
}
