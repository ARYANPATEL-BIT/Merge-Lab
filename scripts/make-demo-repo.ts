#!/usr/bin/env node
// scripts/make-demo-repo.ts
// Scaffold reproducible demo repositories for Merge Lab with dirty working trees.
//
// Usage:
//   pnpm demo:setup [target-path]
// Default target path: ../demo-orders

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function writeFile(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

const claudeConfig = JSON.stringify(
  {
    hooks: {
      SessionStart: [
        {
          hooks: [{ type: "command", command: "mergelab hook session-start" }],
        },
      ],
      PreToolUse: [
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [{ type: "command", command: "mergelab hook pre-write" }],
        },
      ],
      PostToolUse: [
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [{ type: "command", command: "mergelab publish" }],
        },
      ],
    },
  },
  null,
  2,
);

const cursorConfig = JSON.stringify(
  {
    version: 1,
    hooks: {
      sessionStart: [{ command: "mergelab hook session-start" }],
      preToolUse: [{ command: "mergelab hook pre-write" }],
      afterFileEdit: [{ command: "mergelab publish" }],
    },
  },
  null,
  2,
);

async function main() {
  const targetArg = process.argv[2];
  const devAPath = resolve(process.cwd(), targetArg || "../demo-orders");
  const devBPath = `${devAPath}-profile-ui`;

  console.log(`\n📦 Merge Lab Demo Scaffold`);
  console.log(`=========================================`);
  console.log(`Dev A (feat/user-api):   ${devAPath}`);
  console.log(`Dev B (feat/profile-ui): ${devBPath}\n`);

  // 1. Clean up any existing directories
  if (existsSync(devBPath)) {
    console.log(`Removing old Dev B tree: ${devBPath}`);
    try {
      if (existsSync(devAPath)) run(`git worktree remove --force "${devBPath}"`, devAPath);
    } catch {
      // ignore if not a registered worktree
    }
    rmSync(devBPath, { recursive: true, force: true });
  }

  if (existsSync(devAPath)) {
    console.log(`Removing old Dev A repository: ${devAPath}`);
    rmSync(devAPath, { recursive: true, force: true });
  }

  ensureDir(devAPath);

  // 2. Initialize Git repo and baseline files on main
  console.log(`\n1. Initializing repository on main...`);
  run("git init -b main", devAPath);
  run("git config extensions.worktreeConfig true", devAPath);
  run('git config --worktree user.name "dev-a"', devAPath);
  run('git config --worktree user.email "dev-a@example.com"', devAPath);
  run("git remote add origin https://github.com/acme/demo-orders.git", devAPath);

  writeFile(
    resolve(devAPath, ".gitignore"),
    `node_modules/
.env*
*.log
.worktrees/
`,
  );

  writeFile(
    resolve(devAPath, "package.json"),
    JSON.stringify(
      {
        name: "demo-orders",
        version: "0.1.0",
        private: true,
        type: "module",
        description: "Scaffold repository for the Merge Lab demo",
      },
      null,
      2,
    ) + "\n",
  );

  writeFile(resolve(devAPath, ".claude/settings.json"), `${claudeConfig}\n`);
  writeFile(resolve(devAPath, ".cursor/hooks.json"), `${cursorConfig}\n`);

  run("git add .", devAPath);
  run('git commit -m "initial commit: package.json, gitignore, and agent hooks"', devAPath);

  // 3. Create branch feat/user-api and write uncommitted work for Dev A
  console.log(`2. Setting up feat/user-api (Dev A) with uncommitted work...`);
  run("git checkout -b feat/user-api", devAPath);
  run('git config --worktree user.name "dev-a"', devAPath);
  run('git config --worktree user.email "dev-a@example.com"', devAPath);

  writeFile(
    resolve(devAPath, "src/types.ts"),
    `export interface User {
  user_id: string;
  full_name: string;
  created_at: string;
}
`,
  );

  writeFile(
    resolve(devAPath, "src/api/user.ts"),
    `import axios from "axios";
import { User } from "../types.js";

export async function getUser(id: string): Promise<User> {
  const base = process.env.DATABASE_URL;
  const res = await axios.get(\`\${base}/users/\${id}\`);
  return res.data;
}
`,
  );

  writeFile(
    resolve(devAPath, "src/routes.ts"),
    `import express from "express";
import { getUser } from "./api/user.js";

export const app = express();

app.get("/api/users/:id", async (req, res) => {
  res.json(await getUser(req.params.id));
});

app.post("/api/users", async (req, res) => {
  res.status(201).json({ ok: true });
});
`,
  );

  writeFile(
    resolve(devAPath, "package.json"),
    JSON.stringify(
      {
        name: "demo-orders",
        version: "0.1.0",
        private: true,
        type: "module",
        description: "Scaffold repository for the Merge Lab demo",
        dependencies: {
          axios: "^1.7.2",
          express: "^4.19.2",
        },
      },
      null,
      2,
    ) + "\n",
  );

  // 4. Create linked worktree for feat/profile-ui (Dev B)
  console.log(`3. Setting up feat/profile-ui (Dev B) via linked worktree...`);
  run(`git worktree add "${devBPath}" -b feat/profile-ui main`, devAPath);
  run('git config --worktree user.name "dev-b"', devBPath);
  run('git config --worktree user.email "dev-b@example.com"', devBPath);

  writeFile(
    resolve(devBPath, "src/profile.ts"),
    `import { getUser } from "./api/user.js";

export async function renderProfile(id: string): Promise<string> {
  const user = await getUser(id);
  return \`\${user.full_name} (\${user.user_id})\`;
}
`,
  );

  // 5. Verify and display dirty trees
  console.log(`\n=========================================`);
  console.log(`🔍 Verification: Working Tree Statuses`);
  console.log(`=========================================`);

  console.log(`\n[Dev A Tree] ${devAPath} (branch: feat/user-api)`);
  console.log(run("git status -s", devAPath));

  console.log(`\n[Dev B Tree] ${devBPath} (branch: feat/profile-ui)`);
  console.log(run("git status -s", devBPath));

  // 6. Print command sequence for demo
  console.log(`\n=========================================`);
  console.log(`🎬 Demo Run Command Sequence`);
  console.log(`=========================================`);
  console.log(`
--- ONE-TIME SETUP ---
1. Initialize Merge Lab in Dev A's tree:
   cd "${devAPath}"
   mergelab init --api-url "<YOUR_API_URL>" --token "<YOUR_WORKSPACE_TOKEN>" --owner dev-a --mode block

2. Initialize Merge Lab in Dev B's tree:
   cd "${devBPath}"
   mergelab init --api-url "<YOUR_API_URL>" --token "<YOUR_WORKSPACE_TOKEN>" --owner dev-b --mode block

--- RUN 2: MERGE LAB ACTIVE (THE WINNING RUN) ---
1. Dev A publishes uncommitted declarations:
   cd "${devAPath}"
   mergelab publish

2. Dev B starts session (sees injected contracts in context):
   cd "${devBPath}"
   mergelab context
   # Or start Claude Code / Cursor session in "${devBPath}"

3. Dev B's code aligns seamlessly with Dev A's contract:
   mergelab check src/profile.ts

--- RUN 1: CONTRAST RUN (DRIFT SEEDED & BLOCKED) ---
1. Seed the drift variants (node-fetch + userId casing):
   pnpm demo:drift "${devBPath}"

2. Verify PreToolUse hard block:
   cd "${devBPath}"
   mergelab check src/profile.ts
   # Expected: BLOCKED with DEP_CONFLICT and NAMING_DRIFT reasons!
`);
}

main().catch((err) => {
  console.error("make-demo-repo failed:", err);
  process.exit(1);
});
