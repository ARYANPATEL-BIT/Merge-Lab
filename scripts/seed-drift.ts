#!/usr/bin/env node
// scripts/seed-drift.ts
// Seeds the contrast run (Run 1) drift variants on feat/profile-ui:
// 1. DEP_CONFLICT: introduces node-fetch when axios is active on feat/user-api.
// 2. NAMING_DRIFT: introduces userId casing when user_id is declared in User.
//
// Usage:
//   pnpm demo:drift [path-to-profile-ui-tree]
// Default path: ../demo-orders-profile-ui (or ../demo-orders)

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function main() {
  const targetArg = process.argv[2];
  let targetPath = resolve(process.cwd(), targetArg || "../demo-orders-profile-ui");

  if (!existsSync(targetPath)) {
    const altPath = resolve(process.cwd(), "../demo-orders");
    if (existsSync(altPath)) {
      targetPath = altPath;
    } else {
      console.error(`Error: target directory does not exist: ${targetPath}`);
      console.error(`Please run 'pnpm demo:setup' first.`);
      process.exit(1);
    }
  }

  console.log(`\n🌪️ Seeding Drift Variants for Run 1 (Contrast Run)`);
  console.log(`=================================================`);
  console.log(`Target working tree: ${targetPath}\n`);

  // 1. Update package.json with node-fetch
  const pkgPath = resolve(targetPath, "package.json");
  let pkg: any = {};
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      pkg = {};
    }
  }
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies["node-fetch"] = "^3.3.2";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`✓ Added "node-fetch": "^3.3.2" to package.json (triggers DEP_CONFLICT)`);

  // 2. Write drift implementation to src/profile.ts
  const profilePath = resolve(targetPath, "src/profile.ts");
  const driftCode = `import fetch from "node-fetch";

export interface ProfileView {
  userId: string;
}

export async function renderProfile(userId: string): Promise<ProfileView> {
  const res = await fetch(\`https://api.example.com/users/\${userId}\`);
  const data = (await res.json()) as { userId: string };
  return { userId: data.userId };
}
`;
  writeFileSync(profilePath, driftCode, "utf8");
  console.log(`✓ Updated src/profile.ts with userId casing & node-fetch (triggers NAMING_DRIFT & DEP_CONFLICT)`);

  // 3. Show git diff
  console.log(`\n=================================================`);
  console.log(`📄 Seeded Drift Diff:`);
  console.log(`=================================================`);
  try {
    console.log(run("git diff src/profile.ts package.json", targetPath) || "Files created as untracked.");
  } catch {
    // ignore
  }

  console.log(`\n=================================================`);
  console.log(`🎯 Test the Block:`);
  console.log(`=================================================`);
  console.log(`Run:`);
  console.log(`  cd "${targetPath}"`);
  console.log(`  mergelab check src/profile.ts\n`);
  console.log(`Expected output from PreToolUse verdict:`);
  console.log(`  [BLOCK] DEP_CONFLICT: This repo uses axios for HTTP (dev-a, feat/user-api). Adding node-fetch means two HTTP clients.`);
  console.log(`  [BLOCK] NAMING_DRIFT: Field userId drifts from user_id in User (declared by dev-a on feat/user-api); match the existing casing.\n`);
}

main().catch((err) => {
  console.error("seed-drift failed:", err);
  process.exit(1);
});
