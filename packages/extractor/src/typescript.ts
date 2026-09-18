// TypeScript/JavaScript extractor built on ts-morph.

import { Node, Project, SyntaxKind } from "ts-morph";
import type { Declaration } from "@handshake/shared";
import type { Extractor } from "./index.js";
import { bumpExtractFailed } from "./counter.js";
import { redact } from "./redactor.js";

const ROUTE_METHODS = new Set(["get", "post", "put", "delete"]);
const ROUTE_OBJECTS = new Set(["app", "router"]);

/** Structural shapes for ts-morph nodes we read text off of. */
type TextNode = { getText(): string };
type TypedNode = {
  getName(): string;
  getTypeNode(): TextNode | undefined;
  getType(): TextNode;
};
type ReturningNode = {
  getReturnTypeNode(): (Node & TextNode) | undefined;
  getReturnType(): TextNode;
};

/** Prefer the written type annotation; fall back to the inferred type text. */
function typeTextOf(node: Pick<TypedNode, "getTypeNode" | "getType">): string {
  return node.getTypeNode()?.getText() ?? node.getType().getText();
}

function returnTextOf(node: ReturningNode): string {
  return node.getReturnTypeNode()?.getText() ?? node.getReturnType().getText();
}

function signatureOf(name: string, params: TypedNode[], ret: string): string {
  const paramText = params
    .map((p) => `${p.getName()}: ${typeTextOf(p)}`)
    .join(", ");
  return `${name}(${paramText}) -> ${ret}`;
}

/**
 * If the return type references an interface/alias collected in this file,
 * inline that shape one level deep. Field values stay as type text; nested
 * interfaces are not expanded further.
 */
function inlinedShape(
  returnNode: Node | undefined,
  shapes: Map<string, Record<string, string>>,
): Record<string, string> | undefined {
  if (!returnNode) return undefined;
  const direct = shapes.get(returnNode.getText());
  if (direct) return { ...direct };
  for (const id of returnNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const shape = shapes.get(id.getText());
    if (shape) return { ...shape };
  }
  return undefined;
}

function isExternal(spec: string): boolean {
  return !spec.startsWith(".") && !spec.startsWith("/");
}

/** name -> first-seen line, sorted by line, de-duplicated. */
function orderedNames(entries: { name: string; line: number }[]): string[] {
  const sorted = [...entries].sort((a, b) => a.line - b.line);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of sorted) {
    if (!seen.has(e.name)) {
      seen.add(e.name);
      out.push(e.name);
    }
  }
  return out;
}

type Raw =
  | { kind: "function"; symbol: string; signature: string; shape?: Record<string, string>; line: number }
  | { kind: "type"; symbol: string; shape: Record<string, string>; line: number }
  | { kind: "dependency"; symbol: string; line: number }
  | { kind: "env"; symbol: string; line: number }
  | { kind: "route"; symbol: string; line: number };

function extractTs(path: string, content: string): Declaration[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true },
  });
  const sf = project.createSourceFile(path, content, { overwrite: true });

  // Syntax errors only — ignore semantic errors (missing modules/types) so
  // that referencing an uninstalled package is not treated as a parse failure.
  const syntactic = project
    .getProgram()
    .compilerObject.getSyntacticDiagnostics(sf.compilerNode);
  if (syntactic.length > 0) {
    bumpExtractFailed();
    return [];
  }

  const shapes = new Map<string, Record<string, string>>();
  const provides: { name: string; line: number }[] = [];
  const consumes: { name: string; line: number }[] = [];
  const raws: Raw[] = [];

  // interfaces & object-shaped type aliases -> shapes
  const typeRaws: Raw[] = [];
  for (const i of sf.getInterfaces()) {
    if (!i.isExported()) continue;
    const shape: Record<string, string> = {};
    for (const p of i.getProperties()) shape[p.getName()] = typeTextOf(p);
    shapes.set(i.getName(), shape);
    const line = i.getStartLineNumber();
    typeRaws.push({ kind: "type", symbol: i.getName(), shape, line });
    provides.push({ name: i.getName(), line });
  }
  for (const ta of sf.getTypeAliases()) {
    if (!ta.isExported()) continue;
    const node = ta.getTypeNode();
    if (!node || !Node.isTypeLiteral(node)) continue;
    const shape: Record<string, string> = {};
    for (const p of node.getProperties()) shape[p.getName()] = typeTextOf(p);
    shapes.set(ta.getName(), shape);
    const line = ta.getStartLineNumber();
    typeRaws.push({ kind: "type", symbol: ta.getName(), shape, line });
    provides.push({ name: ta.getName(), line });
  }

  // imports -> external deps + consumed symbols
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const line = imp.getStartLineNumber();
    const local: string[] = [];
    const def = imp.getDefaultImport();
    if (def) local.push(def.getText());
    const ns = imp.getNamespaceImport();
    if (ns) local.push(ns.getText());
    for (const ni of imp.getNamedImports()) local.push(ni.getName());
    for (const name of local) consumes.push({ name, line });
    if (isExternal(spec)) raws.push({ kind: "dependency", symbol: spec, line });
  }

  // exported function declarations
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!fn.isExported() || !name) continue;
    const line = fn.getStartLineNumber();
    raws.push({
      kind: "function",
      symbol: name,
      signature: signatureOf(name, fn.getParameters(), returnTextOf(fn)),
      shape: inlinedShape(fn.getReturnTypeNode(), shapes),
      line,
    });
    provides.push({ name, line });
  }

  // exported const arrow/function-expression values
  for (const vs of sf.getVariableStatements()) {
    if (!vs.isExported()) continue;
    for (const d of vs.getDeclarations()) {
      const init = d.getInitializer();
      if (!init || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        continue;
      }
      const name = d.getName();
      const line = d.getStartLineNumber();
      raws.push({
        kind: "function",
        symbol: name,
        signature: signatureOf(name, init.getParameters(), returnTextOf(init)),
        shape: inlinedShape(init.getReturnTypeNode(), shapes),
        line,
      });
      provides.push({ name, line });
    }
  }

  // methods of exported classes
  for (const cls of sf.getClasses()) {
    if (!cls.isExported()) continue;
    for (const m of cls.getMethods()) {
      const name = m.getName();
      const line = m.getStartLineNumber();
      raws.push({
        kind: "function",
        symbol: name,
        signature: signatureOf(name, m.getParameters(), returnTextOf(m)),
        shape: inlinedShape(m.getReturnTypeNode(), shapes),
        line,
      });
      provides.push({ name, line });
    }
  }

  raws.push(...typeRaws);

  // process.env.X references
  const seenEnv = new Set<string>();
  for (const pae of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (pae.getExpression().getText() !== "process.env") continue;
    const name = pae.getName();
    if (seenEnv.has(name)) continue;
    seenEnv.add(name);
    const line = pae.getStartLineNumber();
    raws.push({ kind: "env", symbol: name, line });
    consumes.push({ name, line });
  }

  // app.get/post/put/delete + router.* routes
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;
    const method = expr.getName().toLowerCase();
    if (!ROUTE_METHODS.has(method)) continue;
    if (!ROUTE_OBJECTS.has(expr.getExpression().getText())) continue;
    const arg0 = call.getArguments()[0];
    if (!arg0 || !Node.isStringLiteral(arg0)) continue;
    raws.push({
      kind: "route",
      symbol: `${method.toUpperCase()} ${arg0.getLiteralValue()}`,
      line: call.getStartLineNumber(),
    });
  }

  const providesList = orderedNames(provides);
  const consumesList = orderedNames(consumes);
  return raws
    .map((r) => toDeclaration(r, path, providesList, consumesList))
    .map(redact)
    .filter((d): d is Declaration => d !== null);
}

function toDeclaration(
  r: Raw,
  path: string,
  provides: string[],
  consumes: string[],
): Declaration {
  const base = {
    symbol: r.symbol,
    provides,
    consumes,
    deps: [] as string[],
    source_ref: `${path}:${r.line}`,
    origin: "working_tree" as const,
    confidence: 1,
  };
  switch (r.kind) {
    case "function":
      return {
        kind: "function",
        ...base,
        signature: r.signature,
        ...(r.shape ? { shape: r.shape } : {}),
      };
    case "type":
      return { kind: "type", ...base, shape: r.shape };
    case "dependency":
      return { kind: "dependency", ...base, deps: [r.symbol] };
    case "env":
      return { kind: "env", ...base };
    case "route":
      return { kind: "route", ...base };
  }
}

export const typescriptExtractor: Extractor = {
  extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  extract(path, content) {
    try {
      return extractTs(path, content);
    } catch {
      bumpExtractFailed();
      return [];
    }
  },
};
