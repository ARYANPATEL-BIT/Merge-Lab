// Reads a hook's JSON payload from stdin. Claude Code always pipes it in; if a
// human runs the subcommand in a terminal with no pipe, return "" rather than
// block forever waiting on the TTY.

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
