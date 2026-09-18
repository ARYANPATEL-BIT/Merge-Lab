// services/resolver — pure, deterministic contract logic. P1-owned library.
// No AWS SDK, no Lambda handler, no HTTP, no env vars, no LLM. P2 wraps it.

export { runRules, type Binding } from "./rules.js";
export {
  resolve,
  type Resolution,
  type ResolutionAction,
  type ResolveResult,
} from "./resolve.js";
