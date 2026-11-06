/**
 * 示例运行态 state（test/demo artifact）。
 *
 * static registry 描述“要建什么”；本文件记录实际 project/iModel/scope/
 * changeset/体积/错误。state 进 demo-artifacts（gitignore），reopen verifier
 * 只读 state；不把 UUID 写回源码或 registry。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const EXAMPLE_STATE_PATH = path.join('demo-artifacts', 'examples', 'state.json');

export interface ExampleScopeState {
  id: string;
  sourceElementId: string;
  name: string;
  scopeId?: string;
  featureTypes?: string[];
  bodyCount?: number;
  volumeMm3?: number;
  status: 'pending' | 'built' | 'verified' | 'blocked' | 'failed';
  blocker?: string;
  verifiedAt?: string;
}

export interface ExampleDocumentState {
  id: string;
  projectId?: string;
  imodelId?: string;
  changeset?: string;
  updatedAt: string;
  scopes: ExampleScopeState[];
}

export interface ExampleStateFile {
  schemaVersion: 1;
  updatedAt: string;
  documents: ExampleDocumentState[];
}

export function loadExampleState(file = EXAMPLE_STATE_PATH): ExampleStateFile | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ExampleStateFile;
  } catch {
    return undefined;
  }
}

/** 原子 upsert 文档状态；state 缺失时新建。返回写入后的完整 state。 */
export function upsertExampleDocumentState(
  document: ExampleDocumentState,
  file = EXAMPLE_STATE_PATH,
): ExampleStateFile {
  const current = loadExampleState(file) ?? { schemaVersion: 1 as const, updatedAt: '', documents: [] };
  const index = current.documents.findIndex((entry) => entry.id === document.id);
  if (index >= 0) current.documents[index] = document;
  else current.documents.push(document);
  current.updatedAt = new Date().toISOString();
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
  return current;
}

export function hasExampleState(file = EXAMPLE_STATE_PATH): boolean {
  return existsSync(file);
}
