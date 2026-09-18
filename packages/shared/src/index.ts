// @handshake/shared — canonical DECLARATION contract types.
// P1-owned. Everyone imports from here.
//
// Hard rule: declarations carry names and types ONLY — never source code,
// diffs, or literal values.
//
// NOTE: this is a placeholder shape. The full declaration schema
// (signatures, data shapes, deps, env var names, routes) is not yet
// designed — that is a separate task. Kept minimal so the workspace
// typechecks and consumers have something to import.

export const SCHEMA_VERSION = 0;

/** A single published interface contract for one module in a working tree. */
export interface Declaration {
  /** Extractor schema version that produced this declaration. */
  schemaVersion: number;
  /** Workspace-relative module path the declarations came from. */
  module: string;
  // TODO: signatures, shapes, deps, envVars, routes.
}
