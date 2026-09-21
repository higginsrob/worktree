import readline from 'node:readline';

export interface MultiSelectOption {
  label: string;
  hint?: string;
}

// Checklist picker: arrows or j/k to move, Space to toggle, a to toggle all,
// Enter to confirm, Esc/q/Ctrl-C to cancel. Returns the chosen indexes, or
// null when cancelled. Caller must confirm stdin/stdout are a TTY first.
export async function multiSelect(
  title: string,
  options: MultiSelectOption[],
  initiallySelected = true,
): Promise<number[] | null> {
  const selected = new Set<number>(initiallySelected ? options.map((_, i) => i) : []);
  let cursor = 0;
  let linesDrawn = 0;

  const renderLines = (): string[] => {
    const lines = [
      '',
      `\x1b[1;36m${title}\x1b[0m`,
      '\x1b[2m↑/↓ move · space toggle · a all · enter confirm · q cancel\x1b[0m',
      '',
    ];
    options.forEach((opt, i) => {
      const box = selected.has(i) ? '[x]' : '[ ]';
      const hint = opt.hint ? `  \x1b[2m${opt.hint}\x1b[0m` : '';
      const text = `${box} ${opt.label}${hint}`;
      lines.push(i === cursor ? `\x1b[7m> ${box} ${opt.label}\x1b[0m${hint}` : `  ${text}`);
    });
    return lines;
  };

  const draw = (): void => {
    if (linesDrawn > 0) {
      process.stdout.write(`\x1b[${linesDrawn}A`);
    }
    const lines = renderLines();
    for (const line of lines) {
      process.stdout.write(`\x1b[2K${line}\n`);
    }
    linesDrawn = lines.length;
  };

  const clear = (): void => {
    process.stdout.write(`\x1b[${linesDrawn}A`);
    for (let i = 0; i < linesDrawn; i++) {
      process.stdout.write('\x1b[2K\n');
    }
    process.stdout.write(`\x1b[${linesDrawn}A`);
  };

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw ?? false;
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write('\x1b[?25l');

    const finish = (result: number[] | null): void => {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      clear();
      process.stdout.write('\x1b[?25h');
      resolve(result);
    };

    const onKeypress = (str: string | undefined, key: readline.Key | undefined): void => {
      if (!key) {
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        cursor = (cursor - 1 + options.length) % options.length;
      } else if (key.name === 'down' || key.name === 'j') {
        cursor = (cursor + 1) % options.length;
      } else if (key.name === 'space' || str === ' ') {
        if (!selected.delete(cursor)) {
          selected.add(cursor);
        }
      } else if (key.name === 'a') {
        if (selected.size === options.length) {
          selected.clear();
        } else {
          options.forEach((_, i) => selected.add(i));
        }
      } else if (key.name === 'return') {
        finish([...selected].sort((a, b) => a - b));
        return;
      } else if (key.name === 'escape' || key.name === 'q' || (key.ctrl && key.name === 'c')) {
        finish(null);
        return;
      }
      draw();
    };

    stdin.on('keypress', onKeypress);
    draw();
  });
}
