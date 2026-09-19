import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveIdentity } from "./identity.js";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

/** A throwaway git repo with one commit on branch `feat/user-api`. */
function makeRepo(): string {
  // realpath so macOS/Windows temp symlinks match git's --show-toplevel.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hs-id-")));
  git(["init", "-b", "feat/user-api"], dir);
  git(["config", "user.name", "Dev A"], dir);
  git(["config", "user.email", "dev-a@example.com"], dir);
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("resolveIdentity", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeRepo();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads branch and owner from git", () => {
    const id = resolveIdentity(dir);
    expect(id.branch).toBe("feat/user-api");
    expect(id.owner).toBe("Dev A");
    // root is git-canonicalized to a posix path; just confirm it resolves.
    expect(id.root).toContain("hs-id-");
    expect(id.root).not.toContain("\\");
  });

  it("normalizes the origin remote as the repo id, stripping .git", () => {
    git(["remote", "add", "origin", "git@github.com:acme/widgets.git"], dir);
    expect(resolveIdentity(dir).repo).toBe("git@github.com:acme/widgets");
  });

  it("falls back to a stable path hash when there is no remote", () => {
    const repo = resolveIdentity(dir).repo;
    expect(repo).toMatch(/^path:[0-9a-f]{12}$/);
    // Deterministic for the same tree.
    expect(resolveIdentity(dir).repo).toBe(repo);
  });

  it("lets a config owner override git config user.name", () => {
    expect(resolveIdentity(dir, "override-bot").owner).toBe("override-bot");
  });
});
