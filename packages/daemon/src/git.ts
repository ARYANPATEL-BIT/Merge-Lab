// Git plumbing. All reads go through the CLI so the daemon sees the working
// tree exactly as the developer left it - including uncommitted and untracked
// work, which is the entire point of Merge Lab.

import { execFileSync } from "node:child_process";
import { compileMergelabIgnore } from "./ignore.js";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** Run git, returning trimmed stdout. Throws on non-zero exit or missing git. */
export function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** Run git, returning trimmed stdout, or null if the command fails. */
export function tryGit(args: string[], cwd: string): string | null {
  try {
    return runGit(args, cwd);
  } catch {
    return null;
  }
}

/** Absolute repo root of the tree containing `cwd`. Throws if not a repo. */
export function repoRoot(cwd: string): string {
  const root = tryGit(["rev-parse", "--show-toplevel"], cwd);
  if (!root) {
    throw new Error("not a git repository (run mergelab inside a repo)");
  }
  return toPosix(root);
}

/** Forward slashes on every platform - declaration source_refs must be stable. */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function isSourceFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && SOURCE_EXTENSIONS.includes(path.slice(dot).toLowerCase());
}

/**
 * Repo-relative paths of changed source files: tracked modifications since HEAD
 * (`git diff HEAD`) plus untracked files (`git ls-files --others`). Untracked
 * respects .gitignore via --exclude-standard; both lists are then filtered to
 * source extensions and passed through .mergelabignore.
 */
export function changedSourceFiles(root: string): string[] {
  const tracked = tryGit(["diff", "HEAD", "--name-only"], root) ?? "";
  const untracked = tryGit(["ls-files", "--others", "--exclude-standard"], root) ?? "";

  const paths = new Set<string>();
  for (const line of `${tracked}\n${untracked}`.split(/\r?\n/)) {
    const p = line.trim();
    if (p) paths.add(p);
  }

  const ignored = compileMergelabIgnore(root);
  return [...paths]
    .filter(isSourceFile)
    .filter((p) => !ignored(p))
    .sort();
}

/** Contents of a file at HEAD, or null if it does not exist there. */
export function headFileText(root: string, relPath: string): string | null {
  return tryGit(["show", `HEAD:${relPath}`], root);
}
