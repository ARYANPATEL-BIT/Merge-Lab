// @handshake/shared — canonical DECLARATION contract types.
// P1-owned. Everyone imports from here.
//
// A Declaration is the ONLY thing Handshake ever transmits about a module.
// Hard rule: names and types ONLY — never source code, diffs, or literal
// values. Enum member values, env values, and default argument values are
// omitted by construction: there is no field on these types that can carry
// them.

/** Bumped whenever the shape below changes. The extractor stamps each Declaration. */
export const SCHEMA_VERSION = 1;

/** The five kinds of declaration a module can publish. */
export const DECLARATION_KINDS = [
  "signatures",
  "shapes",
  "deps",
  "envVars",
  "routes",
] as const;
export type DeclarationKind = (typeof DECLARATION_KINDS)[number];

/**
 * Normalized, printed type text — names and structure only, never values.
 * e.g. "string", "Promise<Declaration[]>", "(owner: string) => ResolvedContract".
 * The extractor widens value-literal types so no literal value survives here
 * (a `"sk-123"` value type becomes `string`); type-level string unions such as
 * an HTTP method stay as types.
 */
export type TypeText = string;

// ---- signatures -----------------------------------------------------------

export type SignatureKind =
  | "function"
  | "method"
  | "constructor"
  | "getter"
  | "setter";

export interface Param {
  name: string;
  type: TypeText;
  optional: boolean;
  /** true for a `...rest` parameter. */
  rest: boolean;
}

/** An exported callable signature. Default argument values are never carried. */
export interface SignatureDecl {
  /** Exported name, or `Class.method` for methods. */
  name: string;
  kind: SignatureKind;
  /** Generic type parameter names, e.g. ["T", "K"]. */
  typeParams: string[];
  params: Param[];
  returnType: TypeText;
  async: boolean;
}

// ---- data shapes ----------------------------------------------------------

export type ShapeKind = "interface" | "type" | "enum" | "class";

export interface Field {
  name: string;
  /** Field type text. Empty for enum members — member names only, no values. */
  type: TypeText;
  optional: boolean;
  readonly: boolean;
}

/** An exported data shape: interface, type alias, enum, or class shape. */
export interface ShapeDecl {
  name: string;
  kind: ShapeKind;
  typeParams: string[];
  fields: Field[];
  /** Base type / implemented interface names. */
  extends: string[];
}

// ---- deps -----------------------------------------------------------------

export type DepKind = "runtime" | "dev" | "peer";

/** An external module the module depends on. Versions are never carried. */
export interface DepDecl {
  /** Package or module specifier, e.g. "ts-morph". */
  name: string;
  kind: DepKind;
  /** true for `import type` / type-only usage. */
  typeOnly: boolean;
}

// ---- env vars -------------------------------------------------------------

/** An environment variable the module reads. The value is never carried. */
export interface EnvVarDecl {
  /** Variable name, e.g. "AWS_REGION". */
  name: string;
  required: boolean;
  /** Coerced type the module treats it as, e.g. "string" or "number". */
  type: TypeText;
}

// ---- routes ---------------------------------------------------------------

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/** An HTTP route the module exposes. */
export interface RouteDecl {
  method: HttpMethod;
  /** Route pattern, e.g. "/contracts/:owner". */
  path: string;
  /** Exported handler name bound to this route. */
  handler: string;
  /** Name of a ShapeDecl describing the request body, if typed. */
  requestShape?: string;
  /** Name of a ShapeDecl describing the response body, if typed. */
  responseShape?: string;
}

// ---- envelope -------------------------------------------------------------

/** Everything Handshake publishes about a single module in a working tree. */
export interface Declaration {
  schemaVersion: number;
  /** Workspace-relative module path, e.g. "services/resolver/src/index.ts". */
  module: string;
  signatures: SignatureDecl[];
  shapes: ShapeDecl[];
  deps: DepDecl[];
  envVars: EnvVarDecl[];
  routes: RouteDecl[];
}

/** An empty Declaration for `module`, stamped with the current schema version. */
export function emptyDeclaration(module: string): Declaration {
  return {
    schemaVersion: SCHEMA_VERSION,
    module,
    signatures: [],
    shapes: [],
    deps: [],
    envVars: [],
    routes: [],
  };
}
