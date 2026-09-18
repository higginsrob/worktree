export function notImplemented(command: string): (...args: unknown[]) => void {
  return () => {
    console.error(`wkt ${command}: not implemented yet`);
    process.exitCode = 1;
  };
}
