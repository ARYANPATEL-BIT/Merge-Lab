# Video Demo Script: Merge Lab (3:00)

**Target Duration**: 3:00 (180 seconds)  
**Target Speaking Pace**: ~140 words per minute (~2.3 words per second)  
**Total Spoken Word Count**: 416 words  

---

## Pre-Recording Checklist & Staging Setup

Before starting the recording, ensure the following environment is pre-staged:

1. **Terminal 1 (Dev A)**:
   - Working directory: `demo-orders-dev-a`
   - Git branch: `feat/user-api`
   - Dirty working tree with uncommitted files:
     - `types.ts` (`export interface User { user_id: string; ... }`)
     - `user.ts` (imports `axios`, exports `getUser(id: string): Promise<User>`)
     - `package.json` (contains `"axios": "^1.7.0"`)
   - Font size raised to 18pt+, high contrast theme.

2. **Terminal 2 (Dev B / Claude Code / Cursor)**:
   - Working directory: `demo-orders-dev-b`
   - Git branch: `feat/profile-ui`
   - Font size raised to 18pt+, clear terminal buffer.

3. **Browser Window (Merge Lab Board)**:
   - URL: `http://localhost:5173/` (or live deployed URL)
   - Zoomed to 125% for high readability on 1080p video.
   - Connected to the workspace.

4. **Environment Variables**:
   - `MERGELAB_TOKEN` configured in environment or `~/.mergelab/config.json`.

---

## Script Breakdown

### [0:00 - 0:20] Section 1: The Problem
- **Duration**: 20 seconds
- **Word Count**: 46 words
- **Pre-staged**: Split-screen showing two developer IDEs with uncommitted changes on different branches.
- **On Screen**: Split screen of Terminal 1 (`feat/user-api`) and Terminal 2 (`feat/profile-ui`). In Terminal 1, highlight `user_id` in `types.ts` and `axios` in `package.json`. In Terminal 2, highlight an agent drafting `userId` and `node-fetch`.
- **Exact Terminal Commands to Type**: None (show existing uncommitted files).

> **Spoken Narration**:  
> "Yesterday my teammate and I worked on the same repo across different branches. In five minutes, she chose Axios and named a field `user_id` in snake_case. Meanwhile, my AI agent drafted code using `node-fetch` and camelCase `userId`. Neither of us pushed for hours. By merge time, everything broke."

---

### [0:20 - 0:35] Section 2: One-Sentence Positioning
- **Duration**: 15 seconds
- **Word Count**: 35 words
- **Pre-staged**: Browser window displaying the Merge Lab Projector UI showing empty or incoming contract state.
- **On Screen**: Cut to the Merge Lab Board UI. Clean dark-mode interface showing the project headline: *"The pre-push context layer."*
- **Exact Terminal Commands to Type**: None.

> **Spoken Narration**:  
> "Merge Lab is a pre-push interface contract registry that linters your teammates' unpushed decisions by publishing declarations - never source code - so your AI agent catches drift and breaking changes the exact second it tries to write."

---

### [0:35 - 1:20] Section 3: The Working Run
- **Duration**: 45 seconds
- **Word Count**: 104 words
- **Pre-staged**: Dev A has dirty working tree ready in `demo-orders-dev-a`.
- **On Screen**:
  1. Switch to Terminal 1 (`demo-orders-dev-a`). Operator runs `mergelab publish`.
  2. Switch to Browser: The Merge Lab Board updates instantly, showing contracts for `User`, `getUser`, and `axios`.
  3. Switch to Terminal 2 (`demo-orders-dev-b`). Operator runs `mergelab hook session-start` to show the injected context block.
- **Exact Terminal Commands to Type**:
  - *Terminal 1 (Dev A)*:
    ```bash
    mergelab publish
    ```
  - *Terminal 2 (Dev B)*:
    ```bash
    mergelab hook session-start
    ```

> **Spoken Narration**:  
> "Watch how it works. On Dev A's machine, we run `mergelab publish`. In milliseconds, our AST extractor reads her local working tree, strips literals and private logic, and publishes only the exported signatures, shapes, and dependencies.
> 
> Now, on Dev B's machine, when an agent starts a session, the `session-start` hook queries Merge Lab. Look at stdout: instead of commands, it injects pure factual declarations into the prompt: 'HTTP client is axios. Object fields are snake_case.' The agent immediately adopts these conventions without any nagging."

---

### [1:20 - 1:50] Section 4: The Block Firing & Agent Self-Correction
- **Duration**: 30 seconds
- **Word Count**: 69 words
- **Pre-staged**: Staged payload or file where Dev B attempts to write a mismatched field (`userId`).
- **On Screen**: Terminal 2 (`demo-orders-dev-b`). Run `mergelab hook pre-write` with a drifted payload, showing exit code 2 and the JSON deny message. Then show the agent re-running with `user_id` and succeeding (exit code 0).
- **Exact Terminal Commands to Type**:
  - *Terminal 2 (Dev B)*:
    ```bash
    echo '{"cwd":".","tool_name":"Write","tool_input":{"file_path":"profile.ts","content":"export interface Profile { userId: string; }"}}' | mergelab hook pre-write
    echo $LASTEXITCODE
    ```
    *(In bash use: `echo $?`)*

> **Spoken Narration**:  
> "Now, what happens if an agent drifts? Suppose Dev B's agent tries to write a `Profile` interface with camelCase `userId`. 
> 
> The `PreToolUse` hook intercepts the write. The verdict service returns an immediate block with exit code 2. The reason travels straight to the agent: 'Field userId drifts from user_id in User'. The agent sees the contract, corrects itself to `user_id`, and the write succeeds."

---

### [1:50 - 2:10] Section 5: The Contrast Run Ending in Undefined
- **Duration**: 20 seconds
- **Word Count**: 45 words
- **Pre-staged**: A quick node snippet demonstrating what happens in production without Merge Lab.
- **On Screen**: Terminal 2. Run a small node evaluation showing `user.userId` evaluating to `undefined`.
- **Exact Terminal Commands to Type**:
  - *Terminal 2 (Dev B)*:
    ```bash
    node -e 'const user = { user_id: "usr_42" }; console.log("Profile User ID:", user.userId);'
    ```

> **Spoken Narration**:  
> "Here is the contrast. Without Merge Lab, both developers keep coding for hours. TypeScript compiles, the PR merges, and in staging: `user.userId` evaluates to `undefined`. A silent runtime bug, all because two branches made conflicting naming decisions before pushing."

---

### [2:10 - 2:45] Section 6: Architecture & AWS Services Named Aloud
- **Duration**: 35 seconds
- **Word Count**: 82 words
- **Pre-staged**: Full-screen slide or live diagram of the AWS architecture.
- **On Screen**: Full architecture diagram displaying Amazon API Gateway, AWS Lambda, Amazon DynamoDB, and Amazon Bedrock. Highlight the sub-300ms deterministic path versus the asynchronous advisory path.
- **Exact Terminal Commands to Type**: None.

> **Spoken Narration**:  
> "Under the hood, Merge Lab runs entirely on AWS in ap-south-1. Amazon API Gateway routes developer traffic to AWS Lambda functions running Node 20 on Graviton arm64. Our state lives in Amazon DynamoDB using a single-table design for sub-ten-millisecond lookups, keeping our verdict hook well within its 300-millisecond budget. 
> 
> Meanwhile, Amazon Bedrock runs Claude 3 Haiku asynchronously in the background, identifying semantic duplicate functions like `getUser` and `fetchUserById` without ever blocking the critical path."

---

### [2:45 - 3:00] Section 7: What We Learned
- **Duration**: 15 seconds
- **Word Count**: 35 words
- **Pre-staged**: Return camera to presenter or live board showing active green contracts.
- **On Screen**: Presenter on camera or closing slide with GitHub repository link.
- **Exact Terminal Commands to Type**: None.

> **Spoken Narration**:  
> "Our biggest takeaway: when steering AI agents, phrase injected context as factual declarations, not instructions. State what exists, let deterministic rules guard the boundaries, and agents coordinate seamlessly before code ever leaves the laptop."
