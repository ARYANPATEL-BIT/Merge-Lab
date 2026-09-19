// `handshake init` — write ~/.handshake/config.json from flags (or env). Kept
// non-interactive so it runs cleanly in a demo or CI: no prompts to hang on.
//   handshake init --api-url <url> --token <token> [--owner <name>]
// Falls back to HANDSHAKE_API_URL / HANDSHAKE_TOKEN. The token is never echoed.

import { configPath, writeConfig, type Config } from "./config.js";
import { info } from "./log.js";

/** Parse `--key value` and `--key=value`; later wins. Bare flags map to "". */
export function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[body] = argv[++i];
    } else {
      out[body] = "";
    }
  }
  return out;
}

export async function cmdInit(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  const apiUrl = flags["api-url"] || process.env.HANDSHAKE_API_URL;
  const token = flags["token"] || process.env.HANDSHAKE_TOKEN;
  const owner = flags["owner"] || undefined;

  if (!apiUrl || !token) {
    throw new Error(
      "usage: handshake init --api-url <url> --token <token> [--owner <name>]",
    );
  }

  const config: Config = { apiUrl, token, ...(owner ? { owner } : {}) };
  await writeConfig(config);
  info(`Wrote ${configPath()} (apiUrl ${apiUrl}${owner ? `, owner ${owner}` : ""}).`);
}
