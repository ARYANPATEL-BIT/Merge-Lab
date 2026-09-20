// Tiny output helpers. stdout is the product's data; stderr is for warnings.
// Warnings are one line and never throw - the CLI fails open on the network.

export function info(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function warn(line: string): void {
  process.stderr.write(`mergelab: ${line}\n`);
}
