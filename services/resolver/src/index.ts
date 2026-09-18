// services/resolver — resolves the authoritative contract set teammates read
// at SessionStart. P1-owned. Runs as a Lambda behind API Gateway (ap-south-1).

import type { Declaration } from "@handshake/shared";

/**
 * Resolve the authoritative set of declarations for a workspace.
 * TODO: read published contracts from DynamoDB and merge by owner.
 */
export async function resolve(): Promise<Declaration[]> {
  return [];
}
