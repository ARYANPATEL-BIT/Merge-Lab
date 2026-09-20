# Builder Center Blog: Enforcing Pre-Push Contracts Across AI Agents

*By the Merge Lab Team (AWS Builder Center Submission)*

Merge Lab is a pre-push context layer. It watches developers' working trees and publishes interface decisions - exported signatures, data shapes, dependencies, environment variable names, and routes - before they are even committed. 

But publishing the context is only half the battle. The real magic happens when teammates' AI agents consume these contracts and are blocked from deviating from them in real-time. In this post, we’ll explore the technical challenges of building LLM-driven hook contracts across Claude Code, Codex, and Antigravity, and the most surprising constraint we discovered along the way.

## The Challenge: Unified Hook Contracts

Our goal was to inject teammates' unpushed decisions into an agent's context at `SessionStart`, and block writes that drift from those decisions at `PreToolUse`. But agents are different.

- **Claude Code** provides a structured `.claude/settings.json` hook system that lets us easily intercept `SessionStart` and the `Write` tool.
- **Codex and Antigravity** have different surface areas for tool interception and context injection.

To solve this, we unified the contract behind a single local CLI (`merge-lab hook session-start` and `merge-lab hook pre-write`). This abstracted away the differences between the agents. The daemon handles the heavy lifting of parsing the working tree with `ts-morph` and deterministic drift resolution, allowing the agent-specific adapters to remain razor-thin.

## The Hard Lesson: Factual Phrasing vs. Instructions

The most critical learning came from how we injected context during `SessionStart`. 

Initially, we tried injecting explicit instructions to the agent. We emitted strings like:
*"Do not use fetch; dev-a just introduced axios. You must use axios."*

**The result? The agents fought us.** 
When text is framed as an out-of-band command, modern LLMs' prompt-injection defenses trip. Instead of using the context invisibly to write better code, the agent would surface the instruction directly to the user: *"I was told not to use fetch, so I will use axios instead."* This broke the seamless magic of the tool.

We learned a hard constraint: **Injected context must be phrased as factual statements, not instructions.**

Instead of commanding the agent, we changed our renderer to emit plain declarations:
```typescript
// From dev-a's working tree (feat/user-api)
export function getUser(id: string): Promise<User>;
import axios from "axios";
```

By presenting the context as indisputable facts about the current environment, the models effortlessly absorbed the information. Without being told what to do, an agent generating a new dependent function would naturally pick up `axios` and match the exact signature of `getUser`, because it perceived them as established ground truths of the codebase.

## Conclusion

Building Merge Lab taught us that when enforcing guardrails on AI agents, deterministic constraints (like our `PreToolUse` drift rules) paired with factually framed context (at `SessionStart`) outperform prompt engineering every time. 

By removing the LLM from the enforcement path and treating it purely as a consumer of facts, we built a system that fails open, stays fast (sub-300ms budget), and actually prevents integration bugs before they are even committed.
