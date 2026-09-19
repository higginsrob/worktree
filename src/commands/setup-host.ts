import { ensureVimRuntime } from '../host.js';

export async function setupHostAction(): Promise<void> {
  await ensureVimRuntime();
  console.log('Host vim environment ready.');
}
