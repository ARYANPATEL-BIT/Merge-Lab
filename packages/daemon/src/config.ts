// ~/.handshake/config.json — apiUrl + bearer token, optional owner override.
// The token lives here, in the developer's home, and is never read from the
// repo: publishing must not depend on a secret being checked in.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

export const ConfigSchema = z.object({
  apiUrl: z.string().min(1),
  token: z.string().min(1),
  owner: z.string().min(1).optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

export function configPath(): string {
  return join(homedir(), ".handshake", "config.json");
}

export async function loadConfig(): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch {
    throw new Error(
      `no config at ${configPath()} — run: handshake init --api-url <url> --token <token>`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`config at ${configPath()} is not valid JSON`);
  }
  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`config at ${configPath()} is missing apiUrl or token`);
  }
  return parsed.data;
}

export async function writeConfig(config: Config): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
