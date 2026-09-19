import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configPath, loadConfig, writeConfig } from "./config.js";

// Every test here redirects the config dir so nothing ever touches ~/.handshake.
describe("config with HANDSHAKE_CONFIG_DIR", () => {
  let dir: string;
  const saved = process.env.HANDSHAKE_CONFIG_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hs-cfg-"));
    process.env.HANDSHAKE_CONFIG_DIR = dir;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.HANDSHAKE_CONFIG_DIR;
    else process.env.HANDSHAKE_CONFIG_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it("points configPath at the override, not the home directory", () => {
    expect(configPath()).toBe(join(dir, "config.json"));
  });

  it("round-trips a written config and defaults mode to warn", async () => {
    await writeConfig({ apiUrl: "http://localhost:1", token: "t", mode: "warn" });
    const cfg = await loadConfig();
    expect(cfg.apiUrl).toBe("http://localhost:1");
    expect(cfg.mode).toBe("warn");
  });

  it("fills mode with warn when the file omits it", async () => {
    await writeConfig({ apiUrl: "http://localhost:1", token: "t", mode: "block" });
    // Simulate an older config file without a mode field.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiUrl: "http://localhost:1", token: "t" }));
    const cfg = await loadConfig();
    expect(cfg.mode).toBe("warn");
  });
});
