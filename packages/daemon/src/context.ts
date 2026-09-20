// `mergelab context` - fetch this branch's consumable contracts (teammates'
// only) and print the rendered block. The same render is reused by the future
// SessionStart hook.

import { ApiError, getContext } from "./api.js";
import { loadConfig } from "./config.js";
import { resolveIdentity } from "./identity.js";
import { info, warn } from "./log.js";
import { renderContext } from "./render.js";

export async function cmdContext(): Promise<void> {
  const cfg = await loadConfig();
  const { repo, branch, owner } = resolveIdentity(process.cwd(), cfg.owner);

  let response;
  try {
    response = await getContext(cfg, { repo, branch, exclude_owner: owner });
  } catch (e) {
    if (e instanceof ApiError) {
      warn(`context unavailable (${e.message})`);
      return;
    }
    throw e;
  }

  info(renderContext({ repo, branch, contracts: response.contracts, now: new Date() }));
}
