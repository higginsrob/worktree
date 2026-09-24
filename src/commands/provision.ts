import path from 'node:path';
import { multiSelect } from '../ui/multi-select.js';
import { ITEMS, type Item } from '../provision/items.js';
import { confirm, detectSystem, runShell, type SystemInfo } from '../provision/system.js';

export interface ProvisionCliOptions {
  yes?: boolean;
  dryRun?: boolean;
  list?: boolean;
}

// Installers drop binaries in places a fresh shell hasn't put on PATH yet;
// add them so post-install detection (and later steps) can see them.
function augmentPath(sys: SystemInfo): void {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', path.join(sys.home, '.local', 'bin')];
  const current = (process.env.PATH ?? '').split(':');
  process.env.PATH = [...extra.filter((p) => !current.includes(p)), ...current].join(':');
}

type Outcome = 'ok' | 'failed' | 'manual' | 'skipped';

async function provisionItem(item: Item, opts: ProvisionCliOptions): Promise<Outcome> {
  // Re-detected per item: installing Homebrew earlier in the run changes which
  // package manager later items should use.
  const sys = await detectSystem();
  console.log(`\n\x1b[1m${item.label}\x1b[0m`);

  let manual = false;
  for (const step of item.plan(sys)) {
    if (step.kind === 'manual') {
      console.log(`  ${step.text}`);
      manual = true;
      continue;
    }
    const shown = step.kind === 'shell' ? `$ ${step.cmd}` : step.describe;
    console.log(`  ${shown}`);
    if (opts.dryRun) {
      continue;
    }
    if (!opts.yes && !(await confirm('  Run this?', true))) {
      return 'skipped';
    }
    try {
      if (step.kind === 'shell') {
        const code = await runShell(step.cmd);
        if (code !== 0) {
          console.log(`  \x1b[31mFailed (exit ${code}).\x1b[0m`);
          return 'failed';
        }
      } else {
        await step.run();
      }
    } catch (err) {
      console.log(`  \x1b[31mFailed: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
      return 'failed';
    }
    augmentPath(sys);
  }

  if (opts.dryRun) {
    return 'skipped';
  }
  if (manual) {
    return 'manual';
  }
  if (await item.detect(sys)) {
    console.log('  \x1b[32mDone.\x1b[0m');
    return 'ok';
  }
  console.log(
    '  \x1b[33mInstalled, but not detected yet — you may need to restart your shell.\x1b[0m',
  );
  return 'ok';
}

export async function provisionAction(options: ProvisionCliOptions): Promise<void> {
  const sys = await detectSystem();
  const items = ITEMS.filter((item) => item.applies(sys));
  const installed = await Promise.all(items.map((item) => item.detect(sys)));

  console.log(`System: ${sys.os === 'mac' ? 'macOS' : 'Linux'}${sys.pkg ? ` (${sys.pkg})` : ''}\n`);
  items.forEach((item, i) => {
    console.log(`  ${installed[i] ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${item.label}`);
  });

  const missing = items.filter((_, i) => !installed[i]);
  if (missing.length === 0) {
    console.log('\nEverything is already set up.');
    return;
  }
  if (options.list) {
    console.log(`\n${missing.length} item(s) missing. Run \`wkt provision\` to set them up.`);
    return;
  }

  let chosen = missing.filter((item) => !item.optional);
  if (!options.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('wkt provision needs an interactive terminal (or pass --yes).');
    }
    const picked = await multiSelect(
      'Select what to install/configure:',
      missing.map((item) => ({
        label: item.label,
        hint: item.optional ? 'optional' : undefined,
        selected: !item.optional,
      })),
    );
    if (!picked || picked.length === 0) {
      console.log('\nNothing selected.');
      return;
    }
    chosen = picked.map((i) => missing[i]!);
  }
  if (chosen.length === 0) {
    console.log('\nNothing to install without opting in (run without --yes to choose).');
    return;
  }

  const results: [Item, Outcome][] = [];
  for (const item of chosen) {
    results.push([item, await provisionItem(item, options)]);
  }

  if (options.dryRun) {
    console.log('\nDry run: nothing was changed.');
    return;
  }
  console.log('\nSummary:');
  const marks: Record<Outcome, string> = {
    ok: '\x1b[32m✓\x1b[0m',
    failed: '\x1b[31m✗\x1b[0m',
    manual: '\x1b[33m!\x1b[0m',
    skipped: '-',
  };
  for (const [item, outcome] of results) {
    console.log(`  ${marks[outcome]} ${item.label} (${outcome})`);
  }
  if (results.some(([, outcome]) => outcome === 'failed')) {
    process.exitCode = 1;
  }
}
