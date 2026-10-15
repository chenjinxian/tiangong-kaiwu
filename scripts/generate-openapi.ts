/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 契约中心 v1（RW1-T4）：RpcInterface → OpenAPI 3.0 生成管线。
 *
 * 用 TypeScript Compiler API（零新依赖，typescript 已是 packages/shared 的 devDependency）
 * 解析 packages/shared 的 RpcInterface 抽象类，产出机器可消费契约：
 *   - path 形态：/<interfaceName>-<interfaceVersion>/<methodName>
 *     （对照 itwinjs-core BentleyCloudRpcProtocol.supplyPathForOperation 的 operationId 构造：
 *       `${interfaceName}-${interfaceVersion}-${operationName}`；本管线按任务裁定改为两级 path）
 *   - 每方法 → post 操作：requestBody = 位置参数 JSON 数组（同 BentleyCloudRpcProtocol 的
 *     base64(parameters) 数组语义），200 响应 = 返回类型 schema
 *   - 参数/返回类型映射：string/number/boolean 原生；字面量联合 → enum；T[]/Array<T> → array；
 *     具名 DTO（含跨文件 import，单包内相对路径递归跟随）→ $ref + components.schemas 字段展开；
 *     Record<K,V> → object+additionalProperties；Uint8Array → string/byte；unknown/any → 空 schema
 *
 * 显式排除（v1 登记）：
 *   - OpenCloudIpcInterface：非 RpcInterface 形态（IpcApp 自定义 IPC 通道 open-cloud-ipc），不走
 *     BentleyCloudRpcProtocol HTTP 寻址，不进本契约
 *   - 服务端 zod 注册表（私有仓 luban-backend FeatureTypeRegistry）的 op 参数 schema：v1 不接入，
 *     后续波次（RW3 AI 服务总线前置）再并轨
 *
 * 产物 docs/api-specs/luban-rpc.json 提交入库；drift 门：
 *   pnpm gen:openapi && git diff --exit-code docs/api-specs/luban-rpc.json
 * 输出完全确定性（无时间戳、声明序），保证 diff 逐字节稳定。
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
type TS = any;
type Schema = Record<string, any>;

// typescript 不是本文件位置可达的依赖（仓根 scripts/ 无 node_modules）：
// 经 createRequire 锚定 luban-cad workspace 根（首选）或 packages/shared 加载。
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function loadTypeScript(): TS {
  const candidates = [
    path.join(repoRoot, 'luban-cad', 'package.json'),
    path.join(repoRoot, 'luban-cad', 'packages', 'shared', 'package.json'),
  ];
  for (const anchor of candidates) {
    try {
      return createRequire(anchor)('typescript');
    } catch {
      // try next anchor
    }
  }
  throw new Error('generate-openapi: cannot resolve "typescript" — run `pnpm install` under luban-cad/');
}

const ts: TS = loadTypeScript();

// ---------------------------------------------------------------------------
// AST 模型
// ---------------------------------------------------------------------------

interface ParamInfo {
  name: string;
  optional: boolean;
  rest: boolean;
  schema: Schema;
}

interface MethodInfo {
  name: string;
  summary: string | undefined;
  params: ParamInfo[];
  /** undefined 表示 void */
  returns: Schema | undefined;
}

interface RpcInterfaceInfo {
  className: string;
  interfaceName: string;
  interfaceVersion: string;
  file: string;
  methods: MethodInfo[];
}

interface NamedDecl {
  name: string;
  file: string;
  decl: any; // InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration
}

// ---------------------------------------------------------------------------
// 模块图：按需解析 + 符号表 + 具名类型解析（单包内相对 import 递归跟随）
// ---------------------------------------------------------------------------

class ModuleGraph {
  private readonly program = new Map<string, any>(); // resolvedPath -> SourceFile
  private readonly decls = new Map<string, Map<string, any>>(); // file -> name -> decl
  private readonly typeImports = new Map<string, Map<string, { file: string; name: string }>>();

  public constructor(private readonly warnings: string[]) {}

  public sourceFile(file: string): any {
    const resolved = path.resolve(file);
    let sf = this.program.get(resolved);
    if (!sf) {
      const text = fs.readFileSync(resolved, 'utf8');
      sf = ts.createSourceFile(resolved, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
      this.program.set(resolved, sf);
      this.indexFile(resolved, sf);
    }
    return sf;
  }

  private indexFile(file: string, sf: any): void {
    const declMap = new Map<string, any>();
    const importMap = new Map<string, { file: string; name: string }>();
    this.decls.set(file, declMap);
    this.typeImports.set(file, importMap);

    for (const stmt of sf.statements) {
      // import ... from 'relative-path'（含 `import type`）；@itwin 等外部包不跟随
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const spec = stmt.moduleSpecifier.text;
        if (!spec.startsWith('.')) continue;
        const target = this.resolveModule(file, spec);
        if (!target) continue;
        const clause = stmt.importClause;
        if (!clause) continue;
        const named = clause.namedBindings;
        if (named && ts.isNamedImports(named)) {
          for (const el of named.elements) {
            importMap.set(el.name.text, { file: target, name: (el.propertyName ?? el.name).text });
          }
        }
        continue;
      }
      const decl = stmt;
      const isTarget =
        ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl) || ts.isEnumDeclaration(decl);
      if (isTarget && decl.name) declMap.set(decl.name.text, decl);
    }
  }

  private resolveModule(fromFile: string, spec: string): string | undefined {
    const base = path.resolve(path.dirname(fromFile), spec);
    const candidates = [
      base,
      base.endsWith('.js') ? base.replace(/\.js$/, '.ts') : `${base}.ts`,
      path.join(base, 'index.ts'),
    ];
    for (const cand of candidates) {
      if (cand.endsWith('.ts') && fs.existsSync(cand)) return cand;
    }
    return undefined;
  }

  /** 按名解析具名类型声明（本文件 → import 链，带访问环保护） */
  public resolveType(name: string, fromFile: string, visited = new Set<string>()): NamedDecl | undefined {
    const key = `${fromFile}::${name}`;
    if (visited.has(key)) return undefined;
    visited.add(key);

    this.sourceFile(fromFile); // ensure the file is parsed & indexed (cached)

    const local = this.decls.get(path.resolve(fromFile));
    const decl = local?.get(name);
    if (decl) return { name, file: path.resolve(fromFile), decl };

    const imp = this.typeImports.get(path.resolve(fromFile))?.get(name);
    if (imp) return this.resolveType(imp.name, imp.file, visited);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 类型节点 → OpenAPI schema
// ---------------------------------------------------------------------------

class SchemaEmitter {
  public readonly components = new Map<string, Schema>();
  private readonly pending: NamedDecl[] = [];
  private readonly queued = new Set<string>();

  public constructor(private readonly graph: ModuleGraph, private readonly warnings: string[]) {}

  /** 具名类型 → schema；字面量联合别名内联，其余具名 DTO → $ref（并把展开任务入队） */
  public namedRef(name: string, fromFile: string): Schema {
    const target = this.graph.resolveType(name, fromFile);
    if (!target) {
      this.warnings.push(`unresolved type '${name}' in ${path.relative(repoRoot, fromFile)} — emitted as free-form object`);
      return { type: 'object', 'x-unresolved': name };
    }
    // 纯字面量联合（枚举语义）按别名内联，避免为枚举型别名单建 components
    if (ts.isTypeAliasDeclaration(target.decl) && isLiteralUnion(target.decl.type)) {
      return this.fromTypeNode(target.decl.type, target.file);
    }
    if (!this.components.has(target.name) && !this.queued.has(target.name)) {
      this.queued.add(target.name);
      this.pending.push(target);
    }
    return { $ref: `#/components/schemas/${target.name}` };
  }

  /** 消费展开队列直到耗尽 */
  public drain(): void {
    for (;;) {
      const next = this.pending.shift();
      if (!next) return;
      this.components.set(next.name, this.expandDecl(next));
    }
  }

  private expandDecl(named: NamedDecl): Schema {
    const decl = named.decl;
    if (ts.isInterfaceDeclaration(decl)) return this.objectFromMembers(decl.members, named.file);
    if (ts.isEnumDeclaration(decl)) {
      const values: Array<string | number> = [];
      for (const m of decl.members) {
        if (m.initializer && ts.isStringLiteral(m.initializer)) values.push(m.initializer.text);
        else if (m.initializer && ts.isNumericLiteral(m.initializer)) values.push(Number(m.initializer.text));
        else values.push(m.name.getText());
      }
      return values.every((v) => typeof v === 'string')
        ? { type: 'string', enum: values }
        : { type: 'number', enum: values };
    }
    if (ts.isTypeAliasDeclaration(decl)) {
      // 别名直指另一个具名类型（BriefcaseInfo = Briefcase）：沿链展开并以别名落 components，
      // 避免只装一个透传 $ref 的冗余 schema
      if (ts.isTypeReferenceNode(decl.type)) {
        const targetName = decl.type.typeName?.getText();
        if (targetName) {
          const target = this.graph.resolveType(targetName, named.file);
          if (target && target.name !== named.name && !isLiteralUnion(target.decl?.type)) {
            return this.expandDecl(target);
          }
        }
      }
      return this.fromTypeNode(decl.type, named.file);
    }
    return { type: 'object' };
  }

  private objectFromMembers(members: any, file: string): Schema {
    const properties: Schema = {};
    const required: string[] = [];
    for (const m of members) {
      if (!ts.isPropertySignature(m) || !m.name) continue;
      const propName = ts.isStringLiteral(m.name) || ts.isNumericLiteral(m.name)
        ? m.name.text
        : m.name.getText();
      properties[propName] = m.type ? this.fromTypeNode(m.type, file) : {};
      if (!m.questionToken) required.push(propName);
    }
    const schema: Schema = { type: 'object', properties };
    if (required.length) schema.required = required;
    return schema;
  }

  public fromTypeNode(node: any, file: string): Schema {
    if (!node) return {};

    switch (node.kind) {
      case ts.SyntaxKind.StringKeyword: return { type: 'string' };
      case ts.SyntaxKind.NumberKeyword: return { type: 'number' };
      case ts.SyntaxKind.BooleanKeyword: return { type: 'boolean' };
      case ts.SyntaxKind.VoidKeyword:
      case ts.SyntaxKind.UndefinedKeyword:
        return {};
      case ts.SyntaxKind.AnyKeyword:
      case ts.SyntaxKind.UnknownKeyword:
      case ts.SyntaxKind.ObjectKeyword:
        return {};
      case ts.SyntaxKind.NullKeyword: return { nullable: true };
      case ts.SyntaxKind.ParenthesizedType: return this.fromTypeNode(node.type, file);
      case ts.SyntaxKind.ArrayType:
        return { type: 'array', items: this.fromTypeNode(node.elementType, file) };
      case ts.SyntaxKind.TypeLiteral:
        return this.objectFromMembers(node.members, file);
      case ts.SyntaxKind.LiteralType: {
        const lit = node.literal;
        if (ts.isStringLiteral(lit)) return { type: 'string', enum: [lit.text] };
        if (ts.isNumericLiteral(lit)) return { type: 'number', enum: [Number(lit.text)] };
        if (lit.kind === ts.SyntaxKind.TrueKeyword) return { type: 'boolean', enum: [true] };
        if (lit.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean', enum: [false] };
        return {};
      }
      case ts.SyntaxKind.UnionType: {
        const all = node.types as any[];
        const members = all.filter((t: any) => t.kind !== ts.SyntaxKind.UndefinedKeyword && t.kind !== ts.SyntaxKind.NullKeyword);
        const nullable = members.length !== all.length;
        let schema: Schema;
        if (members.length > 0 && members.every((t: any) => ts.isLiteralTypeNode(t))) {
          const enums: any[] = [];
          let primType = 'string';
          for (const t of members) {
            const mapped = this.fromTypeNode(t, file);
            if (mapped.enum) {
              enums.push(...mapped.enum);
              if (mapped.type === 'number') primType = 'number';
              if (mapped.type === 'boolean') primType = 'boolean';
            }
          }
          schema = enums.length ? { type: primType, enum: enums } : {};
        } else if (members.length === 1) {
          schema = this.fromTypeNode(members[0], file);
        } else if (members.length === 0) {
          schema = {};
        } else {
          schema = { oneOf: members.map((t: any) => this.fromTypeNode(t, file)) };
        }
        if (nullable) {
          // OpenAPI 3.0：$ref 的兄弟键被忽略——纯 $ref 联合 undefined/null 时
          // {...$ref, nullable} 会静默丢 nullable，须以 anyOf 包裹（RW2-T1）
          const pureRef = Object.keys(schema).length === 1 && typeof schema.$ref === 'string';
          schema = pureRef ? { anyOf: [schema], nullable: true } : { ...schema, nullable: true };
        }
        return schema;
      }
      case ts.SyntaxKind.TypeReference: {
        const name = node.typeName?.getText() ?? '';
        const args: any[] = node.typeArguments ?? [];
        if (name === 'Array' && args.length === 1)
          return { type: 'array', items: this.fromTypeNode(args[0], file) };
        if (name === 'Promise' && args.length === 1)
          return this.fromTypeNode(args[0], file);
        if (name === 'Record' && args.length === 2)
          return { type: 'object', additionalProperties: this.fromTypeNode(args[1], file) };
        if ((name === 'Partial' || name === 'Readonly' || name === 'Required') && args.length === 1)
          return this.fromTypeNode(args[0], file);
        if ((name === 'Pick' || name === 'Omit' || name === 'Exclude' || name === 'Extract') && args.length >= 1) {
          this.warnings.push(`derived type '${node.getText()}' emitted as free-form object — see source declaration`);
          return { type: 'object', 'x-unsupported': node.getText() };
        }
        if (name === 'Uint8Array') return { type: 'string', format: 'byte' };
        if (name === 'Date') return { type: 'string', format: 'date-time' };
        return this.namedRef(name, file);
      }
      default:
        this.warnings.push(`unsupported type syntax '${node.getText?.() ?? ts.SyntaxKind[node.kind]}' — emitted as free-form object`);
        return { type: 'object' };
    }
  }
}

// ---------------------------------------------------------------------------
// RpcInterface 类解析
// ---------------------------------------------------------------------------

/** 类型节点是否为纯字面量联合（枚举语义）：'a' | 'b'，可含 undefined/null 成员 */
function isLiteralUnion(node: any): boolean {
  if (!node) return false;
  if (ts.isLiteralTypeNode(node)) return true;
  if (ts.isUnionTypeNode(node)) {
    return node.types.every(
      (t: any) =>
        ts.isLiteralTypeNode(t) ||
        t.kind === ts.SyntaxKind.UndefinedKeyword ||
        t.kind === ts.SyntaxKind.NullKeyword,
    );
  }
  return false;
}

function firstJsDocParagraph(node: any): string | undefined {  const docs: any[] = (node as any).jsDoc ?? [];
  const doc = docs[0];
  if (!doc) return undefined;
  const raw = typeof doc.comment === 'string'
    ? doc.comment
    : doc.comment ? doc.comment.map((c: any) => c.text ?? '').join('') : '';
  const first = raw.split(/\r?\n\s*\r?\n/)[0].trim().replace(/\s*\r?\n\s*/g, ' ');
  return first || undefined;
}

function parseRpcInterface(
  sf: any,
  file: string,
  graph: ModuleGraph,
  emitter: SchemaEmitter,
): RpcInterfaceInfo | undefined {
  let cls: any;
  for (const stmt of sf.statements) {
    if (!ts.isClassDeclaration(stmt)) continue;
    const heritage = (stmt.heritageClauses ?? []).flatMap((h: any) => h.types ?? []);
    if (heritage.some((h: any) => h.expression?.getText(sf) === 'RpcInterface')) { cls = stmt; break; }
  }
  if (!cls) return undefined;

  let interfaceName = cls.name?.text ?? 'UnknownInterface';
  let interfaceVersion = '0.0.0';
  for (const m of cls.members) {
    if (!ts.isPropertyDeclaration(m) || !m.modifiers?.some((mod: any) => mod.kind === ts.SyntaxKind.StaticKeyword)) continue;
    if (!m.initializer || !ts.isStringLiteral(m.initializer)) continue;
    if (m.name.getText() === 'interfaceName') interfaceName = m.initializer.text;
    if (m.name.getText() === 'interfaceVersion') interfaceVersion = m.initializer.text;
  }

  const methods: MethodInfo[] = [];
  for (const m of cls.members) {
    if (!ts.isMethodDeclaration(m)) continue;
    if (m.modifiers?.some((mod: any) => mod.kind === ts.SyntaxKind.StaticKeyword)) continue;
    const name = m.name.getText(sf);
    if (name === 'getClient' || name === 'constructor') continue;
    if (m.modifiers && !m.modifiers.some((mod: any) => mod.kind === ts.SyntaxKind.PublicKeyword)) continue;

    const params: ParamInfo[] = [];
    for (const p of m.parameters ?? []) {
      const rawName = p.name.getText(sf);
      const schema = p.type ? emitter.fromTypeNode(p.type, file) : {};
      params.push({
        name: rawName.replace(/^_/, ''),
        optional: !!p.questionToken,
        rest: !!p.dotDotDotToken,
        schema,
      });
    }

    let returns: Schema | undefined;
    if (m.type && ts.isTypeReferenceNode(m.type) && m.type.typeName?.getText(sf) === 'Promise') {
      const arg = m.type.typeArguments?.[0];
      if (arg && arg.kind !== ts.SyntaxKind.VoidKeyword) returns = emitter.fromTypeNode(arg, file);
      else if (!arg) returns = {};
    } else if (m.type && m.type.kind !== ts.SyntaxKind.VoidKeyword) {
      returns = emitter.fromTypeNode(m.type, file);
    }

    methods.push({ name, summary: firstJsDocParagraph(m), params, returns });
  }

  return { className: cls.name?.text ?? interfaceName, interfaceName, interfaceVersion, file, methods };
}

// ---------------------------------------------------------------------------
// OpenAPI 文档组装
// ---------------------------------------------------------------------------

function buildDocument(
  interfaces: RpcInterfaceInfo[],
  sourceFiles: string[],
  components: Map<string, Schema>,
): Schema {
  const paths: Schema = {};
  for (const iface of interfaces) {
    for (const method of iface.methods) {
      const op: Schema = {
        operationId: `${iface.interfaceName}-${iface.interfaceVersion}-${method.name}`,
      };
      if (method.summary) op.summary = method.summary;

      const paramList = method.params
        .map((p) => `${p.rest ? '...' : ''}${p.name}${p.optional ? '?' : ''}`)
        .join(', ');
      const paramSchemas = method.params.map((p) => p.schema);
      op.requestBody = {
        required: true,
        description: `Positional parameters: ${paramList || '(none)'}`,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: paramSchemas.length ? { anyOf: paramSchemas } : {},
            },
          },
        },
      };

      const responses: Schema = {};
      if (method.returns) {
        responses['200'] = {
          description: 'Success',
          content: { 'application/json': { schema: method.returns } },
        };
      } else {
        responses['200'] = { description: 'Success' };
      }
      responses.default = {
        description: 'Error',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/RpcError' } },
        },
      };
      op.responses = responses;

      paths[`/${iface.interfaceName}-${iface.interfaceVersion}/${method.name}`] = { post: op };
    }
  }

  const schemas: Schema = {
    RpcError: {
      type: 'object',
      properties: {
        errorNumber: { type: 'number' },
        name: { type: 'string' },
        message: { type: 'string' },
      },
      description: 'Standard iTwin.js RpcRequest rejection payload',
    },
  };
  for (const [k, v] of components) {
    if (k !== 'RpcError') schemas[k] = v;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'LubanCAD RpcInterface Contracts',
      version: '1.0.0',
      description: [
        'Machine-generated from packages/shared RpcInterface definitions (scripts/generate-openapi.ts).',
        'Do not edit by hand; regenerate via `pnpm gen:openapi` and commit the result.',
        '',
        'Excluded from v1 (registered):',
        '- OpenCloudIpcInterface: non-RpcInterface IPC channel (IpcApp open-cloud-ipc), not HTTP-addressable.',
        '- Server-side zod registry (luban-backend FeatureTypeRegistry) op parameter schemas: later wave.',
      ].join('\n'),
    },
    paths,
    components: { schemas },
    'x-luban-excluded': [
      {
        interface: 'OpenCloudIpcInterface',
        file: 'luban-cad/packages/shared/src/OpenCloudIpcInterface.ts',
        reason: '非 RpcInterface 形态（IpcApp 自定义 IPC 通道），v1 显式排除',
      },
    ],
    'x-luban-sources': sourceFiles.map((f) => path.relative(repoRoot, f).replace(/\\/g, '/')),
  };
}

/** 解析给定 RpcInterface 源文件并产出 OpenAPI 3.0 文档（纯函数，便于单测） */
export function generateOpenApiFromFiles(files: string[]): Schema {
  const warnings: string[] = [];
  const graph = new ModuleGraph(warnings);
  const emitter = new SchemaEmitter(graph, warnings);

  const interfaces: RpcInterfaceInfo[] = [];
  for (const file of files) {
    const sf = graph.sourceFile(file);
    const info = parseRpcInterface(sf, path.resolve(file), graph, emitter);
    if (info) interfaces.push(info);
  }
  if (!interfaces.length)
    throw new Error(`generate-openapi: no RpcInterface subclass found in ${files.join(', ')}`);

  emitter.drain();
  const doc = buildDocument(interfaces, files.map((f) => path.resolve(f)), emitter.components);
  (doc as any)['x-luban-warnings'] = warnings;
  return doc;
}

/** CLI 入口：生成 docs/api-specs/luban-rpc.json */
function main(): void {
  const defaultFiles = [
    path.join(repoRoot, 'luban-cad', 'packages', 'shared', 'src', 'rpc', 'OpenCloudRpcInterface.ts'),
    path.join(repoRoot, 'luban-cad', 'packages', 'shared', 'src', 'rpc', 'LubanFeatureRpcInterface.ts'),
  ];
  const files = process.argv.slice(2);
  const targets = files.length ? files.map((f) => path.resolve(process.cwd(), f)) : defaultFiles;

  const doc = generateOpenApiFromFiles(targets);
  const outFile = path.join(repoRoot, 'docs', 'api-specs', 'luban-rpc.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  const methodCount = Object.keys(doc.paths).length;
  const typeCount = Object.keys(doc.components.schemas).length;
  console.log(`generate-openapi: ${methodCount} methods, ${typeCount} schemas -> ${path.relative(repoRoot, outFile)}`);
  for (const w of doc['x-luban-warnings'] as string[]) console.warn(`  warning: ${w}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
