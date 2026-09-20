# Merge Lab: Camera Demo Operator Runbook

This runbook provides step-by-step instructions for the demo operator driving Merge Lab during a live recording or video shoot.

---

## 1. Pre-Flight Checklist

Complete every item before rolling camera:

- [ ] **1. API Reachability**:
  - If testing against deployed AWS backend:
    ```bash
    curl -s -I -H "Authorization: Bearer $MERGELAB_TOKEN" https://<api-id>.execute-api.ap-south-1.amazonaws.com/v1/context
    ```
    Ensure HTTP response code is `200` or `404` (not connection refused).
  - If running locally with the Board dev server:
    Ensure dev server is running (`npx pnpm --filter @mergelab/board dev`) and accessible at `http://localhost:5173`.
- [ ] **2. Workspace Token Configured**:
  - Verify `MERGELAB_TOKEN` is exported in your shell session or configured in `~/.mergelab/config.json`:
    ```bash
    # Test token loading
    node ./packages/daemon/dist/cli.cjs init --help
    ```
- [ ] **3. Repositories Seeded & Dirty**:
  - Run the automated setup script from the root workspace:
    ```powershell
    # On Windows PowerShell
    .\demo-setup.ps1
    ```
    *(Or on Linux/macOS: `./demo-setup.sh`)*
  - Confirm `demo-orders-dev-a` is on branch `feat/user-api` with uncommitted changes in `types.ts`, `user.ts`, `package.json`.
  - Confirm `demo-orders-dev-b` is on branch `feat/profile-ui`.
- [ ] **4. Board Window Open**:
  - Open Chrome/browser to `http://localhost:5173/` (or live URL).
  - Zoom browser viewport to **125%** so text and contract badges are clear on 1080p recording.
  - Position browser on the right half of the screen (or secondary monitor).
- [ ] **5. Terminal Configuration**:
  - Set terminal font to **Consolas, Fira Code, or JetBrains Mono**, minimum **18pt** font size.
  - Set window theme to High Contrast Dark.
  - Clear terminal history: `clear` (Linux/macOS) or `cls` (PowerShell).

---

## 2. Step-by-Step Recording Sequence

### Step 1: Initialize / Reset Demo Repositories (Pre-Camera)
Run before the take:
```powershell
.\demo-setup.ps1
```
**Expected Output**:
```text
Cleaning up old demo directories...
Creating base demo-orders repository...
Cloning for Dev A...
Cloning for Dev B...
Demo repositories created successfully!
  - Dev A (feat/user-api): C:\aws\Merge-Lab\demo-orders-dev-a
  - Dev B (feat/profile-ui): C:\aws\Merge-Lab\demo-orders-dev-b
```

---

### Step 2: Show Dev A's Working Tree (On Camera: 0:00 - 0:20)
Navigate to Dev A's repository in Terminal 1:
```bash
cd demo-orders-dev-a
git status -s
```
**Expected Output**:
```text
 M package.json
?? routes.ts
?? types.ts
?? user.ts
```

Show uncommitted interface decisions:
```bash
head -n 6 types.ts
head -n 4 user.ts
```
**Expected Output**:
```typescript
export interface User {
  user_id: string;
  full_name: string;
  created_at: string;
}
import axios from "axios";
import { User } from "./types";

export async function getUser(id: string): Promise<User> {
```

---

### Step 3: Dev A Publishes Declarations (On Camera: 0:35 - 1:00)
In Terminal 1 (`demo-orders-dev-a`):
```bash
node ../packages/daemon/dist/cli.cjs publish
```
*(Or `mergelab publish` if linked to PATH)*

**Expected Output**:
```text
Published 3 declarations for acme/demo-orders on feat/user-api (dev-a)
```
*(Switch camera focus to Browser Board: Show `getUser`, `User`, and `axios` contracts appearing in real time on the Projector UI).*

---

### Step 4: Dev B Starts Session & Inspects Injected Context (On Camera: 1:00 - 1:20)
Switch to Terminal 2 (`demo-orders-dev-b`):
```bash
cd ../demo-orders-dev-b
node ../packages/daemon/dist/cli.cjs hook session-start <<EOF
{"cwd": "."}
EOF
```
*(On Windows PowerShell, pass payload via standard input)*:
```powershell
'{"cwd":"."}' | node ..\packages\daemon\dist\cli.cjs hook session-start
```

**Expected Output**:
```text
Merge Lab - repo acme/demo-orders, branch feat/profile-ui, as of 18:30.

Contracts this branch can consume:
- getUser(id: string) -> { user_id: string, full_name: string, created_at: string }
  owner dev-a, branch feat/user-api, status declared.
- User { user_id: string, full_name: string, created_at: string }
  owner dev-a, branch feat/user-api, status declared.

Conventions in force on this repo:
- HTTP client is axios.
- Object fields are snake_case.

Reporting branches: feat/user-api (dev-a). Others may exist but are not reporting.
```

---

### Step 5: Dev B Drifts - PreToolUse Block Firing (On Camera: 1:20 - 1:35)
In Terminal 2 (`demo-orders-dev-b`), simulate an agent attempting to write a drifted interface with camelCase `userId` instead of `user_id`:

```powershell
'{"cwd":".","tool_name":"Write","tool_input":{"file_path":"profile.ts","content":"export interface Profile { userId: string; email: string; }"}}' | node ..\packages\daemon\dist\cli.cjs hook pre-write
$LASTEXITCODE
```
*(Or in bash)*:
```bash
echo '{"cwd":".","tool_name":"Write","tool_input":{"file_path":"profile.ts","content":"export interface Profile { userId: string; email: string; }"}}' | node ../packages/daemon/dist/cli.cjs hook pre-write
echo $?
```

**Expected Output**:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Field userId drifts from user_id in User (declared by dev-a on feat/user-api); match the existing casing."}}
2
```
*Note: Exit code `2` is Claude Code's hard tool deny signal.*

---

### Step 6: Agent Self-Corrects & Retries Write (On Camera: 1:35 - 1:50)
Now simulate the agent receiving the reason and correcting its field to `user_id`:

```powershell
'{"cwd":".","tool_name":"Write","tool_input":{"file_path":"profile.ts","content":"export interface Profile { user_id: string; }"}}' | node ..\packages\daemon\dist\cli.cjs hook pre-write
$LASTEXITCODE
```

**Expected Output**:
*(Empty stdout, silent pass)*
```text
0
```
*Note: Exit code `0` allows the agent tool execution to continue immediately.*

---

### Step 7: The Contrast Run - The Unchecked Failure (On Camera: 1:50 - 2:10)
In Terminal 2, demonstrate the runtime defect that happens without Merge Lab:

```bash
node -e 'const user = { user_id: "usr_42" }; console.log("Profile User ID is:", user.userId);'
```

**Expected Output**:
```text
Profile User ID is: undefined
```

---

## 3. Mid-Take Troubleshooting & Recovery

If any step fails mid-take, do not panic. Use these recovery actions:

| Issue | Cause | Rapid Fix |
|---|---|---|
| `Exit code 1: Unknown command` | `mergelab` binary not compiled or on PATH | Run using explicit node path: `node ../packages/daemon/dist/cli.cjs <command>` or run `pnpm --filter @mergelab/daemon build`. |
| `pre-write` returns exit `0` instead of `2` | Mode is set to `warn` or `off` | Run `node ../packages/daemon/dist/cli.cjs init --mode block` in the test directory, or check `~/.mergelab/config.json`. |
| `demo-orders` working tree is dirty or messed up | Accidental file edits or git commits | Re-run `.\demo-setup.ps1`. It wipes and regenerates fresh clones in under 3 seconds. |
| Board UI shows "Backend Disconnected" | Dev server or API Gateway is down | Add `?demo=1` to the browser URL (e.g., `http://localhost:5173/?demo=1`). The board falls back to the in-memory demo fixture using the exact same `assembleBoard` resolver logic. |
| Bedrock advisory takes > 5 seconds | Bedrock rate limits or cold invocations | Bedrock is strictly asynchronous. The demo does not require waiting for Bedrock to complete the verdict run - point out that the verdict finished in under 10ms regardless of Bedrock. |
