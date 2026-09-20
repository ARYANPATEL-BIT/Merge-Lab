import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Mode } from "@mergelab/daemon";
import { preWrite, sessionStart } from "./index.js";

type Handler = (path: string, respond: (status: number, body: unknown) => void) => void;

let server: Server;
let apiUrl: string;
let handler: Handler;
let repoDir: string;
let configDir: string;
const savedConfigDir = process.env.MERGELAB_CONFIG_DIR;

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function setConfig(mode: Mode, url = apiUrl): void {
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ apiUrl: url, token: "t", owner: "dev-b", mode }),
  );
}

/** An unused loopback port: bind one, read it, release it. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  repoDir = realpathSync(mkdtempSync(join(tmpdir(), "ml-hook-repo-")));
  git(["init", "-b", "feat/orders"], repoDir);
  git(["config", "user.name", "Dev B"], repoDir);
  git(["config", "user.email", "dev-b@example.com"], repoDir);
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repoDir, stdio: "ignore" });

  configDir = mkdtempSync(join(tmpdir(), "ml-hook-cfg-"));
  process.env.MERGELAB_CONFIG_DIR = configDir;

  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      handler(req.url ?? "", (status, body) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      apiUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (savedConfigDir === undefined) delete process.env.MERGELAB_CONFIG_DIR;
  else process.env.MERGELAB_CONFIG_DIR = savedConfigDir;
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
});

afterEach(() => {
  handler = () => {
    throw new Error("no handler set for this test");
  };
});

const CONTRACT = {
  kind: "function", symbol: "getUser",
  signature: "getUser(id: string) -> Promise<User>",
  shape: { user_id: "string", full_name: "string" },
  provides: ["getUser"], consumes: [], deps: ["axios@1.7.2"],
  source_ref: "src/user.ts:14", origin: "working_tree", confidence: 1,
  contract_id: "t1", repo: "x", branch: "feat/user-api", owner: "dev-a",
  version: 1, status: "declared", declared_at: "2026-09-19T00:00:00.000Z",
};

function sessionPayload(): string {
  return JSON.stringify({ session_id: "s1", transcript_path: "/t.jsonl", cwd: repoDir });
}

function writePayload(file = "src/orders.ts"): string {
  return JSON.stringify({
    tool_name: "Write",
    cwd: repoDir,
    tool_input: {
      file_path: join(repoDir, file),
      content: "export function createOrder(id: string): number { return 1 }\n",
    },
  });
}

describe("session-start hook", () => {
  it("prints the rendered context block when contracts exist", async () => {
    setConfig("warn");
    handler = (path, respond) => {
      expect(path).toContain("/v1/context");
      expect(path).toContain("exclude_owner=dev-b");
      respond(200, { contracts: [CONTRACT] });
    };
    const out = await sessionStart(sessionPayload());
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("Merge Lab - repo");
    expect(out.stdout).toContain("- getUser(id: string) -> { user_id: string, full_name: string }");
  });

  it("prints nothing when there are no contracts", async () => {
    setConfig("warn");
    handler = (_path, respond) => respond(200, { contracts: [] });
    const out = await sessionStart(sessionPayload());
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });

  it("prints nothing when the API is down", async () => {
    setConfig("warn", `http://127.0.0.1:${await freePort()}`);
    const out = await sessionStart(sessionPayload());
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });
});

describe("pre-write hook", () => {
  it("allows silently on an allow verdict", async () => {
    setConfig("warn");
    handler = (path, respond) => {
      expect(path).toBe("/v1/verdict");
      respond(200, { verdict: "allow", findings: [] });
    };
    const out = await preWrite(writePayload());
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });

  it("allows non-source files without calling the API", async () => {
    setConfig("block");
    const out = await preWrite(writePayload("README.md"));
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });

  it("surfaces a warn verdict as additional context, allowing the write", async () => {
    setConfig("warn");
    handler = (_path, respond) =>
      respond(200, {
        verdict: "warn",
        findings: [{ rule: "NAMING_DRIFT", severity: "warn", reason: "camelCase among snake_case", contract_ids: ["t1"] }],
      });
    const out = await preWrite(writePayload());
    expect(out.exitCode).toBe(0);
    const body = JSON.parse(out.stdout);
    expect(body.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(body.hookSpecificOutput.additionalContext).toBe("camelCase among snake_case");
  });

  it("denies with exit code 2 on a block verdict under mode block", async () => {
    setConfig("block");
    handler = (_path, respond) =>
      respond(200, {
        verdict: "block",
        findings: [{ rule: "SHAPE_MISMATCH", severity: "block", reason: "shape of Order drifted", contract_ids: ["t1"] }],
      });
    const out = await preWrite(writePayload());
    expect(out.exitCode).toBe(2);
    const body = JSON.parse(out.stdout);
    expect(body.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(body.hookSpecificOutput.permissionDecisionReason).toBe("shape of Order drifted");
  });

  it("downgrades a block verdict to a warning under mode warn", async () => {
    setConfig("warn");
    handler = (_path, respond) =>
      respond(200, {
        verdict: "block",
        findings: [{ rule: "SHAPE_MISMATCH", severity: "block", reason: "shape of Order drifted", contract_ids: ["t1"] }],
      });
    const out = await preWrite(writePayload());
    expect(out.exitCode).toBe(0);
    const body = JSON.parse(out.stdout);
    expect(body.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(body.hookSpecificOutput.additionalContext).toBe("shape of Order drifted");
  });

  it("allows silently when mode is off, without calling the API", async () => {
    setConfig("off");
    const out = await preWrite(writePayload());
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });

  it("aborts and allows when the verdict exceeds the 300ms budget", async () => {
    setConfig("block");
    // Server would eventually send a block verdict; the 300ms budget must abort
    // first, so we return silently well before this fires.
    handler = (_path, respond) => {
      setTimeout(() => respond(200, { verdict: "block", findings: [] }), 2000);
    };
    const start = Date.now();
    const out = await preWrite(writePayload());
    expect(out).toEqual({ stdout: "", exitCode: 0 });
    expect(Date.now() - start).toBeLessThan(1200);
  });

  it("allows silently when the API is down", async () => {
    setConfig("block", `http://127.0.0.1:${await freePort()}`);
    const out = await preWrite(writePayload());
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });
});
