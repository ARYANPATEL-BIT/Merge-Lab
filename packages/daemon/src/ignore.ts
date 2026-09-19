// .handshakeignore support. A pragmatic subset of .gitignore semantics: blank
// lines and `#` comments are skipped; a leading `/` anchors to the repo root; a
// trailing `/` matches a directory and everything under it; `*` matches within
// a path segment and `**` across segments; a pattern with no slash matches by
// basename at any depth; a leading `!` re-includes. Later patterns win, matching
// git's last-match-wins rule.

import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Rule {
  negated: boolean;
  regex: RegExp;
}

function escapeLiteral(segment: string): string {
  return segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** Translate one glob (with `**`, `*`, `?`) into a regex source fragment. */
function globToRegex(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += escapeLiteral(ch);
    }
  }
  return out;
}

function compileRule(raw: string): Rule | null {
  let pattern = raw.trim();
  if (pattern === "" || pattern.startsWith("#")) return null;

  const negated = pattern.startsWith("!");
  if (negated) pattern = pattern.slice(1);

  const dirOnly = pattern.endsWith("/");
  if (dirOnly) pattern = pattern.slice(0, -1);

  const anchored = pattern.startsWith("/");
  if (anchored) pattern = pattern.slice(1);

  const body = globToRegex(pattern);
  const rooted = anchored || pattern.includes("/");
  const prefix = rooted ? "^" : "(^|/)";
  // A directory rule matches everything beneath it; a file rule matches the
  // path itself or anything nested under it (a dir named like the pattern).
  const suffix = dirOnly ? "/" : "(/|$)";
  return { negated, regex: new RegExp(`${prefix}${body}${suffix}`) };
}

/** Parse .handshakeignore text into a predicate over repo-relative posix paths. */
export function parseHandshakeIgnore(text: string): (path: string) => boolean {
  const rules: Rule[] = [];
  for (const line of text.split(/\r?\n/)) {
    const rule = compileRule(line);
    if (rule) rules.push(rule);
  }
  if (rules.length === 0) return () => false;
  return (path: string) => {
    let ignored = false;
    for (const rule of rules) {
      if (rule.regex.test(path)) ignored = !rule.negated;
    }
    return ignored;
  };
}

/** Load `<root>/.handshakeignore`. Absent file → nothing is ignored. */
export function compileHandshakeIgnore(root: string): (path: string) => boolean {
  let text: string;
  try {
    text = readFileSync(join(root, ".handshakeignore"), "utf8");
  } catch {
    return () => false;
  }
  return parseHandshakeIgnore(text);
}
