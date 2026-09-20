import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changedSourceFiles, headFileText } from "./git.js";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function write(dir: string, rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ml-git-")));
  git(["init", "-b", "main"], dir);
  git(["config", "user.name", "Dev A"], dir);
  git(["config", "user.email", "dev-a@example.com"], dir);
  return dir;
}

describe("changedSourceFiles", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeRepo();
    write(dir, "src/a.ts", "export const a = 1;\n");
    write(dir, "package.json", JSON.stringify({ name: "x", dependencies: { axios: "1.6.0" } }));
    write(dir, ".gitignore", "ignored/\n");
    git(["add", "."], dir);
    git(["commit", "-m", "init"], dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes uncommitted edits and untracked source files", () => {
    write(dir, "src/a.ts", "export const a = 2;\n"); // tracked, modified
    write(dir, "src/b.tsx", "export const b = 3;\n"); // untracked
    expect(changedSourceFiles(dir)).toEqual(["src/a.ts", "src/b.tsx"]);
  });

  it("filters out non-source extensions", () => {
    write(dir, "notes.md", "# hi\n");
    write(dir, "src/b.ts", "export const b = 3;\n");
    expect(changedSourceFiles(dir)).toEqual(["src/b.ts"]);
  });

  it("respects .gitignore for untracked files", () => {
    write(dir, "ignored/c.ts", "export const c = 4;\n");
    write(dir, "src/b.ts", "export const b = 3;\n");
    expect(changedSourceFiles(dir)).toEqual(["src/b.ts"]);
  });

  it("respects .mergelabignore patterns", () => {
    write(dir, ".mergelabignore", "vendor/\n");
    write(dir, "vendor/d.ts", "export const d = 5;\n");
    write(dir, "src/b.ts", "export const b = 3;\n");
    expect(changedSourceFiles(dir)).toEqual(["src/b.ts"]);
  });

  it("returns nothing when the tree is clean", () => {
    expect(changedSourceFiles(dir)).toEqual([]);
  });
});

describe("headFileText", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeRepo();
    write(dir, "package.json", '{"name":"x"}');
    git(["add", "."], dir);
    git(["commit", "-m", "init"], dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the committed contents, not the dirty working copy", () => {
    write(dir, "package.json", '{"name":"y"}');
    expect(headFileText(dir, "package.json")).toBe('{"name":"x"}');
  });

  it("returns null for a path absent at HEAD", () => {
    expect(headFileText(dir, "nope.json")).toBeNull();
  });
});
