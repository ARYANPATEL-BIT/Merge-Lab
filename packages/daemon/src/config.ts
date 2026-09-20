// ~/.mergelab/config.json - apiUrl + bearer token, optional owner override,
// and the hook enforcement mode. The token lives here, in the developer's home,
// and is never read from the repo: publishing must not depend on a secret being
// checked in. The directory is overridable via MERGELAB_CONFIG_DIR so tests
// (and sandboxes) never touch the real home.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

/** How far pre-write enforcement escalates: silent / surface / hard-block. */
export const ModeSchema = z.enum(["off", "warn", "block"]);
export type Mode = z.infer<typeof ModeSchema>;

export const ConfigSchema = z.object({
  apiUrl: z.string().min(1),
  token: z.string().min(1),
  owner: z.string().min(1).optional(),
  mode: ModeSchema.default("warn"),
});
export type Config = z.infer<typeof ConfigSchema>;

export function configDir(): string {
  return process.env.MERGELAB_CONFIG_DIR ?? join(homedir(), ".mergelab");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export async function loadConfig(): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch {
    throw new Error(
      `no config at ${configPath()} - run: mergelab init --api-url <url> --token <token>`,
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
