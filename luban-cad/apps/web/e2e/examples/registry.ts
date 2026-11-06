/**
 * Onshape 示例 registry（test-only contract）。
 *
 * 静态 registry 描述“要建什么”：document → Part Studio scope → expected
 * feature/body/volume。运行态 project/iModel/scope UUID 不写在这里；由
 * demo-artifacts/examples/state.json 记录（见 demo/session.ts）。
 *
 * 原始 features/坐标/截图留在私有 onshape-parity-data；本文件只消费
 * 脱敏后的 registry 与可选 scenarioPath（相对 ONSHAPE_PARITY_DATA）。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ExampleClassification =
  | 'replicable-now'
  | 'blocked-converter'
  | 'blocked-capability'
  | 'blocked-evidence'
  | 'blocked-selector'
  | 'blocked-sheet-metal'
  | 'excluded-import'
  | 'excluded-custom-feature'
  | 'excluded-specialized'
  | 'excluded-assembly-only'
  | 'excluded-empty';

export type StatusValue = 'complete' | 'partial' | 'approximate' | 'dropped' | 'blocked' | 'pending' | 'verified';

export interface ExampleStatus {
  geometry: 'complete' | 'approximate' | 'blocked';
  constraints: 'complete' | 'dropped' | 'blocked';
  ui: 'complete' | 'partial' | 'blocked';
  persist: 'verified' | 'pending';
  overall: 'complete' | 'partial' | 'blocked' | 'excluded';
}

export interface ExampleBlocker {
  kind: string;
  value: string;
  count?: number;
}

export interface ExampleExpectedBody {
  partId: string;
  name?: string;
  volumeMm3: number;
  massKg?: number;
  centroid?: { x: number; y: number; z: number };
}

export interface ExampleExpected {
  bodyCount: number;
  totalVolumeMm3?: number;
  tolerance?: number;
  featureTree?: string[];
  bodies?: ExampleExpectedBody[];
}

export interface ExampleScopeEntry {
  /** 稳定 slug（文档内唯一）。 */
  id: string;
  /** Onshape elementId；只作可追溯来源，不作运行时 UUID。 */
  sourceElementId: string;
  name: string;
  order?: number;
  /** 私有 corpus 内的 scenario 路径；仅在 ONSHAPE_PARITY_DATA 存在时消费。 */
  scenarioPath?: string;
  featureTypes?: string[];
  expected: ExampleExpected;
  classification?: ExampleClassification;
  blockers?: ExampleBlocker[];
  status?: ExampleStatus;
  /** 私有 index 附带的 UI 证据路径（相对 corpus）。 */
  uiEvidencePath?: string;
}

export interface ExampleDocumentEntry {
  /** 稳定 slug（registry 内唯一）。 */
  id: string;
  owner: string;
  docId: string;
  docName: string;
  folderPath?: string | null;
  /** 'document' = 新标准（一 document 一 iModel）；legacy = 现有单 PS iModel。 */
  layout: 'document' | 'legacy-single-ps';
  projectName: string;
  imodelName: string;
  scopes: ExampleScopeEntry[];
  classification?: ExampleClassification;
  blockers?: ExampleBlocker[];
  status?: ExampleStatus;
}

export interface ExampleRegistry {
  schemaVersion: 1;
  generatedAt?: string;
  source?: string;
  documents: ExampleDocumentEntry[];
}

export interface RegistryValidation {
  ok: boolean;
  errors: string[];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REGISTRY_PATH = path.join(HERE, 'registry.json');
export const DEFAULT_DATA_ROOT = process.env.ONSHAPE_PARITY_DATA || 'D:\\Github\\onshape-parity-data';

/** 读取并校验 registry；文件缺失或结构非法直接抛错（fail closed）。 */
export function loadExampleRegistry(file = DEFAULT_REGISTRY_PATH): ExampleRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取示例 registry ${file}: ${(error as Error).message}`);
  }
  const registry = parsed as ExampleRegistry;
  const validation = validateExampleRegistry(registry);
  if (!validation.ok)
    throw new Error(`示例 registry 校验失败：\n- ${validation.errors.join('\n- ')}`);
  return registry;
}

/** 结构校验：id 唯一、scope 唯一致、expected 形状、legacy/document layout。 */
export function validateExampleRegistry(value: unknown): RegistryValidation {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: ['registry 必须是 JSON 对象'] };
  }
  const registry = value as ExampleRegistry;
  if (registry.schemaVersion !== 1) errors.push('schemaVersion 必须为 1');
  if (!Array.isArray(registry.documents)) {
    errors.push('documents 必须是数组');
    return { ok: errors.length === 0, errors };
  }
  const docIds = new Set<string>();
  for (const [docIndex, doc] of Array.from(registry.documents.entries())) {
    const docPath = `documents[${docIndex}]`;
    if (!doc || typeof doc !== 'object') {
      errors.push(`${docPath} 必须是对象`);
      continue;
    }
    for (const key of ['id', 'owner', 'docId', 'docName', 'projectName', 'imodelName'] as const) {
      if (typeof doc[key] !== 'string' || !doc[key]?.trim())
        errors.push(`${docPath}.${key} 必须是非空字符串`);
    }
    if (docIds.has(doc.id)) errors.push(`${docPath}.id 重复：${doc.id}`);
    docIds.add(doc.id);
    if (doc.layout !== 'document' && doc.layout !== 'legacy-single-ps')
      errors.push(`${docPath}.layout 非法：${String(doc.layout)}`);
    if (!Array.isArray(doc.scopes) || doc.scopes.length === 0)
      errors.push(`${docPath}.scopes 必须是非空数组`);
    const scopeIds = new Set<string>();
    for (const [scopeIndex, scope] of Array.from((doc.scopes || []).entries())) {
      const p = `${docPath}.scopes[${scopeIndex}]`;
      if (!scope || typeof scope !== 'object') {
        errors.push(`${p} 必须是对象`);
        continue;
      }
      for (const key of ['id', 'sourceElementId', 'name'] as const) {
        if (typeof scope[key] !== 'string' || !scope[key]?.trim())
          errors.push(`${p}.${key} 必须是非空字符串`);
      }
      if (scopeIds.has(scope.id)) errors.push(`${p}.id 重复：${scope.id}`);
      scopeIds.add(scope.id);
      const expected = scope.expected;
      if (!expected || typeof expected !== 'object') {
        errors.push(`${p}.expected 必须是对象`);
      } else {
        if (!Number.isInteger(expected.bodyCount) || expected.bodyCount < 0)
          errors.push(`${p}.expected.bodyCount 必须是 >=0 整数`);
        if (expected.totalVolumeMm3 !== undefined && (!Number.isFinite(expected.totalVolumeMm3) || expected.totalVolumeMm3 < 0))
          errors.push(`${p}.expected.totalVolumeMm3 必须是非负有限数`);
        if (expected.tolerance !== undefined && (!Number.isFinite(expected.tolerance) || expected.tolerance <= 0 || expected.tolerance > 1))
          errors.push(`${p}.expected.tolerance 必须在 (0,1]`);
        if (expected.bodies !== undefined) {
          if (!Array.isArray(expected.bodies)) errors.push(`${p}.expected.bodies 必须是数组`);
          else {
            if (expected.bodies.length !== expected.bodyCount)
              errors.push(`${p}.expected.bodies 长度必须等于 bodyCount`);
            for (const [bodyIndex, body] of Array.from(expected.bodies.entries())) {
              if (!body?.partId) errors.push(`${p}.expected.bodies[${bodyIndex}].partId 必须非空`);
              if (!Number.isFinite(body?.volumeMm3) || body.volumeMm3 < 0)
                errors.push(`${p}.expected.bodies[${bodyIndex}].volumeMm3 必须是非负有限数`);
            }
          }
        }
      }
      if (scope.featureTypes !== undefined
        && (!Array.isArray(scope.featureTypes) || scope.featureTypes.some((type: string) => typeof type !== 'string')))
        errors.push(`${p}.featureTypes 必须是字符串数组`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 按 document slug 或 scope slug 查找；scope slug 在 registry 内必须唯一。 */
export function resolveExample(registry: ExampleRegistry, id: string): ExampleDocumentEntry | ExampleScopeEntry {
  const doc = registry.documents.find((entry) => entry.id === id);
  if (doc) return doc;
  const matches: ExampleScopeEntry[] = [];
  for (const entry of registry.documents) {
    for (const scope of entry.scopes) {
      if (scope.id === id) matches.push(scope);
    }
  }
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new Error(`scope slug 不唯一：${id}（${matches.length} 条）`);
  throw new Error(`registry 中不存在示例：${id}`);
}

/** scenario 绝对路径；仅当私有 corpus 存在时才可读取。 */
export function resolveScenarioPath(scope: ExampleScopeEntry, dataRoot = DEFAULT_DATA_ROOT): string | undefined {
  if (!scope.scenarioPath) return undefined;
  return path.isAbsolute(scope.scenarioPath) ? scope.scenarioPath : path.join(dataRoot, scope.scenarioPath);
}

export function isExampleDataAvailable(dataRoot = DEFAULT_DATA_ROOT): boolean {
  try {
    readFileSync(path.join(dataRoot, 'manifest', 'example-index.json'));
    return true;
  } catch {
    return false;
  }
}
