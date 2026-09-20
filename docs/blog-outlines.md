# AWS Builder Center Blog Outlines

Four article outlines authored by the Merge Lab team for the AWS Builder Center, exploring the architectural, agentic, and serverless engineering lessons from building a pre-push interface contract registry.

---

## Blog 1: Unifying Agent Guardrails: Normalizing Hook Contracts Across Claude Code, Cursor, and Codex

**Author**: Team Member 1  
**Target Audience**: DevTools Engineers, AI Platform Architects, Full-Stack Developers  

### Section 1: The Fragmentation of Developer Agent Hooks
- **Key Point**: As AI coding assistants move from passive chat sidebars to autonomous file-modifying agents, each tool has introduced incompatible lifecycle hooks, differing interception points, and distinct payload schemas.
- **Details**: Contrasting how Claude Code's PreToolUse, Cursor's file editing events, and Codex LSP-based completions intercept developer operations at fundamentally different layers of the stack.

### Section 2: Claude Code’s Hook Architecture (`SessionStart` & `PreToolUse`)
- **Key Point**: Claude Code provides a structured command-hook protocol in `.claude/settings.json`, using process exit codes (`exit 2` for deny, `exit 0` for allow) and JSON standard output schemas.
- **Details**: Deep dive into the `hookSpecificOutput` structure, analyzing `permissionDecision` and how `permissionDecisionReason` is injected into the agent's scratchpad to prompt immediate self-correction.

### Section 3: Cursor’s Lifecycle Hooks (`sessionStart`, `preToolUse`, `afterFileEdit`)
- **Key Point**: Cursor manages hooks via `.cursor/hooks.json`, executing shell commands with differing arguments, stdin formats, and asynchronous edit tracking.
- **Details**: Exploring how Cursor's `afterFileEdit` enables non-blocking background AST extraction (`mergelab publish`) while `preToolUse` handles synchronous file-write gating.

### Section 4: Codex, Language Servers, and In-Flight Interception
- **Key Point**: Codex and traditional Copilot integrations lack native pre-write execution hooks, requiring either Language Server Protocol (LSP) diagnostics or custom IDE wrapper extensions to enforce boundaries.
- **Details**: Comparing the pros and cons of process-level tool blocking versus LSP diagnostic squiggles for preventing branch drift.

### Section 5: The Normalization Pattern: A Single Thin CLI Entrypoint
- **Key Point**: By funneling all IDE hooks through a unified CLI (`mergelab hook <subcommand>`), the `@mergelab/hooks` package isolates IDE-specific JSON parsing from the core business logic.
- **Details**: How `@mergelab/daemon` shares identity resolution, AST extraction (`ts-morph`), and HTTP transport across every supported IDE adapter.

### Section 6: The Fail-Open Mandate in Developer Tooling
- **Key Point**: Developer guardrails must never prevent work when unexpected conditions occur; fail-open design is a mandatory prerequisite for developer trust.
- **Details**: Demonstrating how Merge Lab guarantees `exit 0` and empty stdout on any network timeout, invalid payload, syntax error, or blown latency budget.

---

## Blog 2: Talking to Agents: Why Injected Pre-Push Context Must Be Factual, Not Imperative

**Author**: Team Member 2  
**Target Audience**: Prompt Engineers, LLM Systems Architects, Applied AI Researchers  

### Section 1: The Intuitive Anti-Pattern: Commanding the Model
- **Key Point**: When developers attempt to inject external guardrails into an LLM session, their initial instinct is imperative phrasing: *"Do not use node-fetch; dev-a selected axios. You must use axios."*
- **Details**: Why imperative system prompts feel natural to human engineers but introduce fatal side effects when injected into autonomous coding agents.

### Section 2: How Commands Trip Frontier Prompt-Injection Defenses
- **Key Point**: Modern frontier models (such as Claude 3.5 Sonnet) are trained with aggressive instruction-hierarchy safeguards to ignore or highlight out-of-band commands.
- **Details**: Analyzing real agent failure modes where imperative injected context bled into user-facing chat responses (*"I was instructed not to use fetch, so I am switching to axios"*), destroying seamless user experience.

### Section 3: Inverting Commands into Factual Ground Truths
- **Key Point**: Injected context operates flawlessly when framed as indisputable, declarative facts about the current environment rather than rules to obey.
- **Details**: Examining Merge Lab's context renderer: transforming rules into statements like `"Merge Lab - repo acme/app. HTTP client is axios. Object fields are snake_case."`

### Section 4: Token Budgeting and Priority-Based Information Degradation
- **Key Point**: Agent context windows are finite and expensive; injected contract layers must maintain a strict token ceiling with deterministic degradation tiers.
- **Details**: Walking through Merge Lab's 600-token budget algorithm: dropping repo conventions first, then truncating contract lists from the tail, while guaranteeing that the header and reporting branch summary always survive.

### Section 5: Empirical Evidence: Natural Model Alignment
- **Key Point**: When presented with exported type shapes and function signatures as ambient facts, agents naturally match casing, return types, and libraries without any explicit instructions.
- **Details**: Demonstrating how an agent consuming `getUser(id: string): Promise<User>` with `{ user_id: string }` automatically writes snake_case field accessors without needing to be told.

### Section 6: Conclusion: Models as Context Compilers
- **Key Point**: The most reliable agent workflows treat the LLM as an ambient context compiler rather than an obedient subordinate that requires micro-management.
- **Details**: Guidelines for enterprise platform teams designing context injection pipelines for developer workflows.

---

## Blog 3: Sub-10ms Serverless Drift Checks: Single-Table DynamoDB Design for Developer Hooks

**Author**: Team Member 3  
**Target Audience**: Cloud Architects, Database Engineers, Serverless Practitioners  

### Section 1: The Latency Constraint: The 300ms PreToolUse Budget
- **Key Point**: A developer or agent waiting on a tool call will perceive any latency over 300ms as lag; the verdict service must return an answer in under 50ms total server time.
- **Details**: Deconstructing the network and compute budget between a local IDE hook, Amazon API Gateway, AWS Lambda execution, and database lookups.

### Section 2: Mapping Merge Lab’s Core Access Patterns
- **Key Point**: Before modeling a single DynamoDB key, every read and write pattern in the system was explicitly cataloged and prioritized.
- **Details**: Outlining the 4 primary access patterns: token authorization by hash, loading all active repo contracts, querying branch-specific contracts, and fetching advisory semantic duplicate findings.

### Section 3: Modeling Composite Primary Keys (`PK` and `SK`)
- **Key Point**: Single-table design enables heterogeneous entity types to coexist within a single table, queried via efficient partition scans using `begins_with`.
- **Details**: Dissecting key patterns: `REPO#<repo>` / `CONTRACT#<branch>#<id>` for contracts, `TOKEN#<hash>` / `WORKSPACE` for auth, and `REPO#<repo>` / `FINDING#SEMANTIC#<branch>#<id>` for Bedrock findings.

### Section 4: GSI1: Branch-Level Partitions and Bulk Ingestion
- **Key Point**: When a developer branch republishes its working tree, the system must easily locate or supersede prior declarations for that specific branch.
- **Details**: Using `GSI1PK = REPO#<repo>#BRANCH#<branch>` and `GSI1SK = CONTRACT#<id>` to isolate branch-level queries without scanning the entire repository partition.

### Section 5: Why PAY_PER_REQUEST Is the Only Rational Choice for Developer Tooling
- **Key Point**: Developer activity is inherently bursty—teams do not push or write declarations continuously, making provisioned capacity inefficient.
- **Details**: Real-world cost analysis showing how DynamoDB on-demand billing delivers zero idle cost while handling instantaneous spikes when 10 agents trigger hooks simultaneously.

### Section 6: Honest Seams: Where Single-Table Design Adds Friction
- **Key Point**: Single-table architecture introduces complexity when dealing with relational lifecycles, such as cascading deletions and reverse dependency graphs.
- **Details**: Discussing why Merge Lab left `GSI2` and persisted coupling graphs as known seams, and the architectural trade-offs of application-level coordination.

---

## Blog 4: Deterministic Guardrails, Advisory Models: Why We Kept the LLM Out of the Blocking Path

**Author**: Team Member 4  
**Target Audience**: Software Engineering Leaders, AI Safety Researchers, DevOps Engineers  

### Section 1: The Siren Song of the "LLM Linter"
- **Key Point**: Relying on an LLM to decide whether code changes should be blocked seems flexible, but introduces non-deterministic judgments, latency variance, and hallucinations.
- **Details**: Why using an LLM in the critical path of a developer's file write creates unpredictable behavior and erodes user confidence.

### Section 2: The Developer Trust Threshold: Zero False-Positive Blocks
- **Key Point**: A developer tool that falsely denies a valid write even once will be uninstalled immediately; blocking mechanisms must be 100% reproducible.
- **Details**: How Merge Lab guarantees that every `block` verdict corresponds to an exact, verifiable violation of one of six deterministic rules.

### Section 3: The Six Deterministic Resolver Rules
- **Key Point**: Real interface drift can be captured through formal AST structural comparisons without needing artificial intelligence.
- **Details**: Walking through the implementation of `DEP_CONFLICT`, `NAMING_DRIFT`, `DUP_SYMBOL`, `ROUTE_COLLISION`, `SHAPE_MISMATCH`, and `STALE_BINDING` in pure TypeScript.

### Section 4: Latency Realities: 10ms AST Evaluation vs 800ms Model Inference
- **Key Point**: In-memory AST evaluation executes in single-digit milliseconds, whereas even the fastest cloud-hosted models require hundreds of milliseconds for token generation.
- **Details**: Benchmarking the deterministic rule engine against model invocation times to prove why inline LLM evaluation is infeasible within a 300ms hook budget.

### Section 5: The Proper Place for Generative AI: Asynchronous Advisory Intelligence
- **Key Point**: Generative models excel at fuzzy, cross-branch semantic analysis when placed outside the critical path where latency and strict determinism are not required.
- **Details**: How Merge Lab uses Amazon Bedrock (Claude 3 Haiku in `ap-south-1`) asynchronously to detect semantic duplicate functions (`getUser` vs `fetchUserById`) with severity strictly capped at `warn`.

### Section 6: Architectural Principle: The Deterministic Shield and the Generative Advisor
- **Key Point**: The future of AI-assisted software engineering lies in pairing deterministic static analysis as a blocking shield with generative models as asynchronous advisory intelligence.
- **Details**: A summary checklist for systems architects building guardrails for autonomous coding agents.
