// TypeScript/JavaScript extractor built on ts-morph.

import { Node, Project, SyntaxKind, ts } from "ts-morph";
import type { Declaration } from "@mergelab/shared";
import type { Extractor } from "./index.js";
import { bumpExtractFailed } from "./counter.js";
import { redact } from "./redactor.js";

const ROUTE_METHODS = new Set(["get", "post", "put", "delete"]);
const ROUTE_OBJECTS = new Set(["app", "router"]);

/** Structural shapes for the ts-morph nodes we read text off of. */
type TextNode = { getText(): string };
type TypedNode = {
  getName(): string;
  getTypeNode(): TextNode | undefined;
  getType(): TextNode;
};
type ReturningNode = Node & {
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

function isExternal(spec: string): boolean {
  return !spec.startsWith(".") && !spec.startsWith("/");
}

/** Read the field shape of an interface or object type-alias declaration. */
function shapeOfTypeDeclaration(decl: Node): Record<string, string> | undefined {
  if (Node.isInterfaceDeclaration(decl)) {
    const shape: Record<string, string> = {};
    for (const p of decl.getProperties()) shape[p.getName()] = typeTextOf(p);
    return shape;
  }
  if (Node.isTypeAliasDeclaration(decl)) {
    const tn = decl.getTypeNode();
    if (tn && Node.isTypeLiteral(tn)) {
      const shape: Record<string, string> = {};
      for (const p of tn.getProperties()) shape[p.getName()] = typeTextOf(p);
      return shape;
    }
  }
  return undefined;
}

/**
 * Resolve an identifier (possibly imported) to the shape of the interface/alias
 * it names, following the import alias. Skips anything in node_modules.
 */
function shapeFromIdentifier(id: Node): Record<string, string> | undefined {
  if (!Node.isIdentifier(id)) return undefined;
  const symbol = id.getSymbol();
  if (!symbol) return undefined;
  const candidates = [symbol];
  let aliased;
  try {
    aliased = symbol.getAliasedSymbol();
  } catch {
    aliased = undefined;
  }
  if (aliased) candidates.push(aliased);
  for (const s of candidates) {
    for (const decl of s.getDeclarations()) {
      if (decl.getSourceFile().getFilePath().includes("node_modules")) continue;
      const shape = shapeOfTypeDeclaration(decl);
      if (shape) return shape;
    }
  }
  return undefined;
}

/**
 * Inline the shape of the interface/alias referenced by a return type, one
 * level deep, resolved across repo files via the Project. Unresolvable → none.
 */
function inlinedShape(returnNode: Node | undefined): Record<string, string> | undefined {
  if (!returnNode) return undefined;
  for (const id of returnNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const shape = shapeFromIdentifier(id);
    if (shape) return shape;
  }
  return undefined;
}

/**
 * Per-declaration consumes: imported symbols referenced by this node (in import
 * order) followed by env names referenced by it (in appearance order).
 */
function consumesOf(node: Node, importOrder: string[]): string[] {
  const referenced = new Set(
    node.getDescendantsOfKind(SyntaxKind.Identifier).map((i) => i.getText()),
  );
  const imports = importOrder.filter((n) => referenced.has(n));
  const envs: string[] = [];
  const seen = new Set<string>();
  for (const pae of node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (pae.getExpression().getText() !== "process.env") continue;
    const name = pae.getName();
    if (!seen.has(name)) {
      seen.add(name);
      envs.push(name);
    }
  }
  return [...imports, ...envs];
}

function extractTs(path: string, content: string): Declaration[] {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
  });
  const sf = project.createSourceFile(path, content, { overwrite: true });

  // Syntax errors only - a missing module/type is semantic, not a parse failure.
  const syntactic = project
    .getProgram()
    .compilerObject.getSyntacticDiagnostics(sf.compilerNode);
  if (syntactic.length > 0) {
    bumpExtractFailed();
    return [];
  }

  // Load sibling files (repo-relative only) so cross-file return types resolve.
  for (const imp of sf.getImportDeclarations()) {
    if (isExternal(imp.getModuleSpecifierValue())) continue;
    try {
      imp.getModuleSpecifierSourceFile();
    } catch {
      /* unresolvable sibling: the return type will simply carry no shape */
    }
  }

  const importOrder: string[] = [];
  const decls: Declaration[] = [];
  const ref = (line: number): string => `${path}:${line}`;

  // imports -> external dependency declarations + import-order for consumes
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const def = imp.getDefaultImport();
    if (def) importOrder.push(def.getText());
    const ns = imp.getNamespaceImport();
    if (ns) importOrder.push(ns.getText());
    for (const ni of imp.getNamedImports()) importOrder.push(ni.getName());
    if (isExternal(spec)) {
      decls.push({
        kind: "dependency",
        symbol: spec,
        provides: [],
        consumes: [],
        deps: [spec],
        source_ref: ref(imp.getStartLineNumber()),
        origin: "working_tree",
        confidence: 1,
      });
    }
  }

  const pushFunction = (
    name: string,
    params: TypedNode[],
    node: ReturningNode,
    line: number,
  ): void => {
    const shape = inlinedShape(node.getReturnTypeNode());
    decls.push({
      kind: "function",
      symbol: name,
      provides: [name],
      consumes: consumesOf(node, importOrder),
      deps: [],
      source_ref: ref(line),
      origin: "working_tree",
      confidence: 1,
      signature: signatureOf(name, params, returnTextOf(node)),
      ...(shape ? { shape } : {}),
    });
  };

  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!fn.isExported() || !name) continue;
    pushFunction(name, fn.getParameters(), fn, fn.getStartLineNumber());
  }
  for (const vs of sf.getVariableStatements()) {
    if (!vs.isExported()) continue;
    for (const d of vs.getDeclarations()) {
      const init = d.getInitializer();
      if (!init || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        continue;
      }
      pushFunction(d.getName(), init.getParameters(), init, d.getStartLineNumber());
    }
  }
  for (const cls of sf.getClasses()) {
    if (!cls.isExported()) continue;
    for (const m of cls.getMethods()) {
      pushFunction(m.getName(), m.getParameters(), m, m.getStartLineNumber());
    }
  }

  // interfaces & object type aliases -> type declarations
  const pushType = (
    name: string,
    shape: Record<string, string>,
    node: Node,
    line: number,
  ): void => {
    decls.push({
      kind: "type",
      symbol: name,
      provides: [name],
      consumes: consumesOf(node, importOrder),
      deps: [],
      source_ref: ref(line),
      origin: "working_tree",
      confidence: 1,
      shape,
    });
  };
  for (const i of sf.getInterfaces()) {
    if (!i.isExported()) continue;
    const shape: Record<string, string> = {};
    for (const p of i.getProperties()) shape[p.getName()] = typeTextOf(p);
    pushType(i.getName(), shape, i, i.getStartLineNumber());
  }
  for (const ta of sf.getTypeAliases()) {
    if (!ta.isExported()) continue;
    const tn = ta.getTypeNode();
    if (!tn || !Node.isTypeLiteral(tn)) continue;
    const shape: Record<string, string> = {};
    for (const p of tn.getProperties()) shape[p.getName()] = typeTextOf(p);
    pushType(ta.getName(), shape, ta, ta.getStartLineNumber());
  }

  // process.env.X reads -> env declarations
  const seenEnv = new Set<string>();
  for (const pae of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (pae.getExpression().getText() !== "process.env") continue;
    const name = pae.getName();
    if (seenEnv.has(name)) continue;
    seenEnv.add(name);
    decls.push({
      kind: "env",
      symbol: name,
      provides: [name],
      consumes: [],
      deps: [],
      source_ref: ref(pae.getStartLineNumber()),
      origin: "working_tree",
      confidence: 1,
    });
  }

  // app.get/post/put/delete + router.* -> route declarations
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;
    const method = expr.getName().toLowerCase();
    if (!ROUTE_METHODS.has(method)) continue;
    if (!ROUTE_OBJECTS.has(expr.getExpression().getText())) continue;
    const arg0 = call.getArguments()[0];
    if (!arg0 || !Node.isStringLiteral(arg0)) continue;
    const symbol = `${method.toUpperCase()} ${arg0.getLiteralValue()}`;
    decls.push({
      kind: "route",
      symbol,
      provides: [symbol],
      consumes: consumesOf(call, importOrder),
      deps: [],
      source_ref: ref(call.getStartLineNumber()),
      origin: "working_tree",
      confidence: 1,
    });
  }

  return decls.map(redact).filter((d): d is Declaration => d !== null);
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
