/**
 * 生成式示例演示会话：统一截图、步骤标签、manifest 落盘。
 *
 * 不替代 registry/state；manifest 是单次构建的展示证据，state 是跨批次的
 * 运行态索引。raw 数据不在这里；只记录截图/ids/expected/actual/runner。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { SeedImodelRef } from '../../seed.js';
import { demoShot } from '../demo.js';

export interface DemoSessionOptions {
  page: Page;
  dir: string;
  docId: string;
  docName: string;
  scopeId: string;
  sourceElementId: string;
  imodel: SeedImodelRef;
  partStudioScopeId: string;
  expected?: { bodyCount?: number; totalVolumeMm3?: number; tolerance?: number };
}

export interface DemoStep {
  index: number;
  slug: string;
  title: string;
  detail: string;
  kind: 'ui' | 'rpc' | 'verify';
  screenshot: string;
  at: string;
}

export interface DemoManifest {
  schemaVersion: 1;
  docId: string;
  docName: string;
  sourceElementId: string;
  projectId: string;
  imodelId: string;
  partStudioScopeId: string;
  expected?: DemoSessionOptions['expected'];
  actual?: { featureTypes?: string[]; bodyCount?: number; volumeMm3?: number };
  runner: 'ui' | 'rpc' | 'hybrid';
  steps: DemoStep[];
  createdAt: string;
  verifiedAt?: string;
  status: 'building' | 'complete' | 'blocked';
  blocker?: string;
}

export class ExampleDemoSession {
  private readonly options: DemoSessionOptions;
  private readonly manifest: DemoManifest;
  private readonly manifestPath: string;
  private nextIndex = 1;

  public constructor(options: DemoSessionOptions) {
    this.options = options;
    this.manifestPath = path.join(options.dir, 'manifest.json');
    this.manifest = {
      schemaVersion: 1,
      docId: options.docId,
      docName: options.docName,
      sourceElementId: options.sourceElementId,
      projectId: options.imodel.itwinId,
      imodelId: options.imodel.imodelId,
      partStudioScopeId: options.partStudioScopeId,
      expected: options.expected,
      runner: 'hybrid',
      steps: [],
      createdAt: new Date().toISOString(),
      status: 'building',
    };
    mkdirSync(options.dir, { recursive: true });
    this.persist();
  }

  /** 记录一步：截图 + 标题/说明 + UI/RPC 标记。 */
  public async step(
    slug: string,
    title: string,
    detail: string,
    kind: DemoStep['kind'] = 'ui',
    holdMs = 500,
  ): Promise<void> {
    const index = this.nextIndex++;
    // demoShot 的索引/命名与 manifest 同步；截图失败直接抛，不写假步骤。
    const screenshot = await demoShot(this.options.page, {
      dir: this.options.dir,
      index,
      slug,
      title,
      detail,
      holdMs,
    });
    this.manifest.steps.push({
      index,
      slug,
      title,
      detail,
      kind,
      screenshot,
      at: new Date().toISOString(),
    });
    this.persist();
  }

  /** 构建成功：写入 actual 与 verifiedAt。 */
  public complete(actual: DemoManifest['actual']): DemoManifest {
    this.manifest.actual = actual;
    this.manifest.status = 'complete';
    this.manifest.verifiedAt = new Date().toISOString();
    this.persist();
    return this.manifest;
  }

  /** 构建被能力/证据阻塞：保留截图，不生成“完成”状态。 */
  public block(blocker: string): DemoManifest {
    this.manifest.status = 'blocked';
    this.manifest.blocker = blocker;
    this.persist();
    return this.manifest;
  }

  public get path(): string {
    return this.manifestPath;
  }

  public get data(): DemoManifest {
    return this.manifest;
  }

  private persist(): void {
    mkdirSync(path.dirname(this.manifestPath), { recursive: true });
    writeFileSync(this.manifestPath, `${JSON.stringify(this.manifest, null, 2)}\n`, 'utf8');
  }
}
