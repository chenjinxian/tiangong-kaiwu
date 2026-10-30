# B 数据模型 P0 前置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有用户可见行为的前提下，落地 ADR-0001 的四项 P0 前置：iModel 状态诚实化、Named Version、iTwin 官方 taxonomy、`WorkspaceRef` 抽象，为 B 方向（iTwin=项目/产品，iModel=文档，Model=Part Studio）铺路。

**Architecture:** 公共仓（`luban-cad/apps/web` + `packages/shared`）先落类型、mapper、客户端、UI 与抽象层；私有 hub（`imodelhub-services`）补官方 iTwin class/subClass 与迁移。每项独立可测，A 模式行为不变；B 模式的真实切换留给 P1 spike 与后续计划。

**Tech Stack:** React 18 + Vite + Vitest + Playwright；`@itwin/itwins-client`、`@itwin/imodels-client-management`、iTwinUI；NestJS + TypeORM + Jest；pnpm（luban-cad）/ npm（imodelhub-services）。

**Spec:** `docs/adr/0001-itwin-imodel-data-model.md`

## Global Constraints

- 不修改 `itwinjs-core/`；若确需修改，必须登记 `docs/ITWINJS_CORE_MODIFICATIONS.md`。
- `luban-cad` 是 pnpm workspace；`modeling-server`/`imodelhub-services` 是独立项目；`modeling-server`/`webhook-agent` 的 `link:` 依赖禁止用 `pnpm add` 重解析。
- 公共仓测试命令：在 `luban-cad/apps/web` 内 `npx vitest run <file>`；全量 `npx vitest run`；类型检查 `npx tsc --noEmit`；lint `npx eslint "src/**/*.ts*"`。
- `packages/shared` 改动后必须 `npx tsc` 重建 `dist/`（`modeling-server` 以 `link:` 消费其 `dist/`）。
- 私有 hub 命令：`cd D:/Github/imodelhub-services && npm run test:unit`、`npm run migration:run`、`npm run test:e2e`、`npm run build`。
- 任何 i18n 新增键必须同步 `zh-CN` 与 `en`；`src/common/i18n/test/i18n.test.ts` 的 `REQUIRED_*_KEYS` 必须同步更新。
- 状态诚实：`initializationFailed` 不得显示为「初始化中」；没有后端重试 API 时不得伪造「重试」按钮。
- 真实栈验证前不得宣称完成；hub taxonomy 迁移只允许在本地/测试库执行，禁止对生产库执行。
- 每个任务以独立 commit 结束；提交信息使用 `feat/fix/test/docs(scope): ...`。

---

## 文件结构（本计划会创建/修改）

```
luban-cad/apps/web/src/
├── clients/imodels/
│   ├── ImodelsClient.ts                 # + namedVersions 客户端
│   ├── types.ts                          # + CreateNamedVersionInput
│   └── test/ImodelsClient.test.ts        # + namedVersions 断言
├── modules/document-details/
│   ├── types.ts                          # + ImodelState / state
│   ├── internal/imodels.mapper.ts        # + normalizeImodelState
│   ├── components/ImodelCard.tsx         # 四态徽标
│   ├── DocumentDetailsPage.tsx           # syncing 口径
│   ├── DocumentDetailsPage.css           # 四态样式
│   └── test/imodels.mapper.test.ts       # 新增
├── modules/part-studio/
│   ├── hooks/useNamedVersions.ts         # 新增
│   ├── hooks/useNamedVersionActions.ts   # 新增
│   ├── dialogs/CreateNamedVersionDialog.tsx/.css  # 新增
│   ├── PartStudioPage.tsx                # 接线保存版本
│   └── test/{useNamedVersions,useNamedVersionActions,CreateNamedVersionDialog}.test.tsx
├── common/workspace/
│   ├── workspace-ref.ts                  # 新增：类型/解析/路径
│   ├── use-workspace-ref.ts              # 新增：路由 -> ref
│   └── test/workspace-ref.test.ts        # 新增
├── common/i18n/locales/{zh-CN,en}/{documents,part-studio}.json
└── config/routes.tsx / routes/PartStudioPage 接线

luban-cad/packages/shared/src/projects/types.ts   # 官方 taxonomy 枚举
luban-cad/packages/shared/src/projects/types.test.ts

D:/Github/imodelhub-services/src/
├── itwins/domain/itwin-class.enum.ts    # 官方 class + subClass
├── itwins/domain/itwin.ts
├── itwins/dto/create-itwin.dto.ts / update-itwin.dto.ts
├── itwins/itwins.service.ts             # 默认值
├── itwins/infrastructure/persistence/relational/entities/itwin.entity.ts
└── database/migrations/20261030...-*.ts # 枚举 + 数据迁移（两个迁移）
```

---

### Task 1: iModel 状态归一化（类型 + mapper）

**Files:**
- Modify: `luban-cad/apps/web/src/modules/document-details/types.ts`
- Modify: `luban-cad/apps/web/src/modules/document-details/internal/imodels.mapper.ts`
- Create: `luban-cad/apps/web/src/modules/document-details/test/imodels.mapper.test.ts`

**Interfaces:**
- Produces: `export type ImodelState = 'initialized' | 'notInitialized' | 'initializationFailed' | 'retryScheduled' | 'unknown'`
- Produces: `export function normalizeImodelState(raw: unknown): ImodelState`
- Produces: `ImodelSummary.state: ImodelState`（保留 `initialized: boolean` 派生字段）

- [ ] **Step 1: 写失败测试**

`apps/web/src/modules/document-details/test/imodels.mapper.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { IModel } from '@itwin/imodels-client-management';
import { normalizeImodelState, toImodelSummary } from '../internal/imodels.mapper.js';

function raw(state: string | undefined): IModel {
  return {
    id: 'im-1',
    displayName: 'Part Studio 1',
    state,
  } as unknown as IModel;
}

describe('normalizeImodelState', () => {
  it.each([
    ['initialized', 'initialized'],
    ['notInitialized', 'notInitialized'],
    ['NotInitialized', 'notInitialized'],
    ['failed', 'initializationFailed'],
    ['initializationFailed', 'initializationFailed'],
    ['missingFiles', 'missingFiles'],
    ['retryScheduled', 'retryScheduled'],
    ['somethingElse', 'unknown'],
    [undefined, 'unknown'],
  ] as const)('maps %s -> %s', (input, expected) => {
    expect(normalizeImodelState(input)).toBe(expected);
  });
});

describe('toImodelSummary state', () => {
  it('preserves state and derives initialized', () => {
    const summary = toImodelSummary(raw('initializationFailed'));
    expect(summary.state).toBe('initializationFailed');
    expect(summary.initialized).toBe(false);
  });

  it('derives initialized only for initialized', () => {
    expect(toImodelSummary(raw('initialized')).initialized).toBe(true);
    expect(toImodelSummary(raw('retryScheduled')).initialized).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/document-details/test/imodels.mapper.test.ts
```

Expected: FAIL，`normalizeImodelState is not a function`。

- [ ] **Step 3: 最小实现**

`types.ts` 在 `ImodelSummary` 上方新增：

```ts
/** iModel 初始化状态（官方两态 + 本地 hub 恢复状态；未知值归 unknown）。 */
export type ImodelState =
  | 'initialized'
  | 'notInitialized'
  | 'initializationFailed'
  | 'missingFiles'
  | 'retryScheduled'
  | 'unknown';
```

`ImodelSummary` 新增字段（保留 `initialized` 兼容旧消费）：

```ts
  /** 归一化状态（大小写不敏感；未知值 unknown）。 */
  state: ImodelState;
```

`imodels.mapper.ts` 新增：

```ts
const STATE_BY_LOWERCASE: Record<string, ImodelState> = {
  initialized: 'initialized',
  notinitialized: 'notInitialized',
  // hub iModelState 实际枚举：Failed / MissingFiles（见 imodel-state.enum.ts）。
  failed: 'initializationFailed',
  initializationfailed: 'initializationFailed',
  missingfiles: 'missingFiles',
  retryscheduled: 'retryScheduled',
};

/** 官方 IModelState 与本仓扩展状态的统一归一化；未知值不猜测。 */
export function normalizeImodelState(raw: unknown): ImodelState {
  return STATE_BY_LOWERCASE[String(raw ?? '').toLowerCase()] ?? 'unknown';
}
```

并把 `toImodelSummary` 改为：

```ts
export function toImodelSummary(imodel: IModel): ImodelSummary {
  const state = normalizeImodelState((imodel as IModel & { state?: string }).state);
  return {
    id: imodel.id ?? '',
    name: imodel.displayName ?? imodel.name ?? '',
    description: imodel.description ?? '',
    state,
    initialized: state === 'initialized',
    createdAt: imodel.createdDateTime ?? '',
    updatedAt: imodel.lastChangesetPushDateTime ?? imodel.createdDateTime ?? null,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/document-details/test/imodels.mapper.test.ts
```

Expected: PASS（2 个 describe 全绿）。

- [ ] **Step 5: 类型检查 + 提交**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx tsc --noEmit
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/modules/document-details/types.ts \
  luban-cad/apps/web/src/modules/document-details/internal/imodels.mapper.ts \
  luban-cad/apps/web/src/modules/document-details/test/imodels.mapper.test.ts
git commit -m "feat(web): iModel 状态归一化——四态类型与 mapper"
```

---

### Task 2: iModel 四态徽标与同步口径

**Files:**
- Modify: `luban-cad/apps/web/src/modules/document-details/components/ImodelCard.tsx`
- Modify: `luban-cad/apps/web/src/modules/document-details/DocumentDetailsPage.tsx`（`syncing` 计算）
- Modify: `luban-cad/apps/web/src/modules/document-details/DocumentDetailsPage.css`
- Modify: `luban-cad/apps/web/src/common/i18n/locales/zh-CN/documents.json`
- Modify: `luban-cad/apps/web/src/common/i18n/locales/en/documents.json`
- Modify: `luban-cad/apps/web/src/common/i18n/test/i18n.test.ts`
- Modify: `luban-cad/apps/web/src/modules/document-details/test/DocumentDetailsPage.test.tsx`
- Modify: `luban-cad/apps/web/src/modules/document-details/test/document-details-structure.test.tsx`

**Interfaces:**
- Consumes: `ImodelSummary.state`（Task 1）
- Produces: 徽标文案键 `documents.detail.card.{initialized,initializing,initializationFailed,retryScheduled,unknownState}`

- [ ] **Step 1: 写失败测试**

在 `DocumentDetailsPage.test.tsx` 的 fixture 中把两条 iModel 改为：

```ts
{ id: 'im-1', name: '已就绪', state: 'initialized', ... },
{ id: 'im-2', name: '初始化失败', state: 'initializationFailed', ... },
```

新增断言：

```ts
it('初始化失败显示失败徽标，且不显示同步中', async () => {
  // 使用既有 renderPage helper / mock（沿用该文件现有 mock 结构）
  expect(await screen.findByText('初始化失败')).toBeInTheDocument();
  expect(screen.queryByText('同步中')).not.toBeInTheDocument();
});

it('初始化中显示初始化中徽标，并显示同步中', async () => {
  // 使用 state: 'notInitialized' 的 fixture
  expect(await screen.findByText('初始化中')).toBeInTheDocument();
  expect(screen.getByText('同步中')).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/document-details/test/DocumentDetailsPage.test.tsx
```

Expected: FAIL（找不到「初始化失败」，或失败态仍显示「同步中」）。

- [ ] **Step 3: 实现四态徽标**

`ImodelCard.tsx` 顶部新增映射：

```ts
const STATE_LABEL_KEY: Record<ImodelSummary['state'], string> = {
  initialized: 'documents.detail.card.initialized',
  notInitialized: 'documents.detail.card.initializing',
  initializationFailed: 'documents.detail.card.initializationFailed',
  missingFiles: 'documents.detail.card.missingFiles',
  retryScheduled: 'documents.detail.card.retryScheduled',
  unknown: 'documents.detail.card.unknownState',
};

const STATE_CLASS: Record<ImodelSummary['state'], string> = {
  initialized: 'initialized',
  notInitialized: 'initializing',
  initializationFailed: 'failed',
  missingFiles: 'failed',
  retryScheduled: 'retry',
  unknown: 'unknown',
};
```

把 `badge` 内两处 `imodel.initialized ? ... : ...` 改为：

```tsx
const stateClass = STATE_CLASS[imodel.state];
// ...
<Tag
  variant="basic"
  className={`imodel-card__badge imodel-card__badge--${stateClass}`}
>
  <span className={`imodel-card__badge-dot imodel-card__badge-dot--${stateClass}`} />
  {t(STATE_LABEL_KEY[imodel.state])}
</Tag>
```

`DocumentDetailsPage.tsx`：

```ts
const syncing = React.useMemo(
  () => imodels.some((im) => im.state === 'notInitialized' || im.state === 'retryScheduled'),
  [imodels],
);
```

`DocumentDetailsPage.css` 在既有 badge 样式后新增：

```css
.imodel-card__badge-dot--failed {
  background: var(--iui-color-icon-negative);
}
.imodel-card__badge-dot--retry {
  background: var(--iui-color-icon-warning);
}
.imodel-card__badge-dot--unknown {
  background: var(--iui-color-icon-muted);
}
```

i18n `zh-CN/documents.json` 的 `documents.detail.card` 增加：

```json
"initializationFailed": "初始化失败",
"missingFiles": "文件缺失",
"retryScheduled": "等待重试",
"unknownState": "状态未知"
```

`en/documents.json` 同段增加：

```json
"initializationFailed": "Initialization failed",
"missingFiles": "Missing files",
"retryScheduled": "Retry scheduled",
"unknownState": "Unknown state"
```

`i18n.test.ts` 的 `REQUIRED_DOCUMENT_DETAIL_KEYS` 增加上述四个键。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/document-details/test/DocumentDetailsPage.test.tsx \
  src/modules/document-details/test/document-details-structure.test.tsx \
  src/common/i18n/test/i18n.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/modules/document-details \
  luban-cad/apps/web/src/common/i18n
git commit -m "feat(web): iModel 四态徽标——失败不再伪装初始化中"
```

> **后端配套（必须同批）**：hub 的 `UpdateiModelDto` 目前允许客户端 `PATCH state`（`imodels.controller.ts` 更新路由 + `imodel.repository.ts` 白名单包含 `state`），持有 `IMODELS_MANAGE` 的用户可把 iModel 直接改成 `initialized`，前端四态会被伪造。P0 必须从 `UpdateiModelDto` 移除 `state`（或改为服务端状态机校验 + 禁止客户端写），并补一条“客户端 PATCH state 被拒”的测试。

---

### Task 3: Named Version 客户端

**Files:**
- Modify: `luban-cad/apps/web/src/clients/imodels/ImodelsClient.ts`
- Modify: `luban-cad/apps/web/src/clients/imodels/types.ts`
- Modify: `luban-cad/apps/web/src/clients/imodels/test/ImodelsClient.test.ts`

**Interfaces:**
- Produces: `ImodelsClient.listNamedVersions(iModelId: string): Promise<NamedVersion[]>`
- Produces: `ImodelsClient.createNamedVersion(iModelId: string, input: CreateNamedVersionInput): Promise<NamedVersion>`
- Produces: `export interface CreateNamedVersionInput { name: string; description?: string; changesetId: string }`

- [ ] **Step 1: 写失败测试**

在 `ImodelsClient.test.ts` 的 `official` hoisted 对象中增加：

```ts
namedVersionsGetRepresentationList: vi.fn(),
namedVersionsCreate: vi.fn(),
```

Mock 类增加 getter：

```ts
public get namedVersions() {
  return {
    getRepresentationList: official.namedVersionsGetRepresentationList,
    create: official.namedVersionsCreate,
  };
}
```

新增测试：

```ts
it('listNamedVersions(iModelId)：namedVersions.getRepresentationList，迭代器收拢为数组', async () => {
  const items = [{ id: 'nv-1', name: 'V1', changesetId: 'cs-2' }];
  official.namedVersionsGetRepresentationList.mockReturnValue(asyncIterableOf(items));
  const client = new ImodelsClient();

  await expect(client.listNamedVersions('im-1')).resolves.toEqual(items);
  expect(official.namedVersionsGetRepresentationList).toHaveBeenCalledWith(
    expect.objectContaining({ iModelId: 'im-1' }),
  );
});

it('createNamedVersion：namedVersions.create({ iModelId, namedVersionProperties })', async () => {
  const created = { id: 'nv-2', name: 'V2', changesetId: 'cs-3' };
  official.namedVersionsCreate.mockResolvedValue(created);
  const client = new ImodelsClient();

  await expect(
    client.createNamedVersion('im-1', { name: 'V2', changesetId: 'cs-3' }),
  ).resolves.toEqual(created);
  expect(official.namedVersionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      iModelId: 'im-1',
      namedVersionProperties: { name: 'V2', changesetId: 'cs-3' },
    }),
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/clients/imodels/test/ImodelsClient.test.ts
```

Expected: FAIL，`client.listNamedVersions is not a function`。

- [ ] **Step 3: 实现客户端**

`types.ts` 新增：

```ts
/** 创建 Named Version 的入参（changesetId 必填：本产品不命名 baseline）。 */
export interface CreateNamedVersionInput {
  name: string;
  description?: string;
  changesetId: string;
}
```

`ImodelsClient.ts` 的 import 增加 `NamedVersion`：

```ts
import type {
  AuthorizationCallback,
  Changeset,
  IModel,
  NamedVersion,
} from '@itwin/imodels-client-management';
```

re-export：

```ts
export type { Changeset, NamedVersion };
```

类中 `listChangesets` 后新增：

```ts
/** iModel 的 Named Version 列表（全量表示；官方迭代器自动翻页）。 */
public async listNamedVersions(iModelId: string): Promise<NamedVersion[]> {
  return this.invoke(async () => {
    const iterator = this.client.namedVersions.getRepresentationList({
      authorization: this.authorization(),
      iModelId,
    });
    const versions: NamedVersion[] = [];
    for await (const version of iterator) {
      versions.push(version);
    }
    return versions;
  });
}

/** 在指定 changeset 上创建 Named Version。 */
public createNamedVersion(
  iModelId: string,
  input: CreateNamedVersionInput,
): Promise<NamedVersion> {
  return this.invoke(() =>
    this.client.namedVersions.create({
      authorization: this.authorization(),
      iModelId,
      namedVersionProperties: input,
    }),
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/clients/imodels/test/ImodelsClient.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/clients/imodels
git commit -m "feat(web): Named Version 客户端通道"
```

---

### Task 4: `useNamedVersions` 查询 hook

**Files:**
- Create: `luban-cad/apps/web/src/modules/part-studio/hooks/useNamedVersions.ts`
- Create: `luban-cad/apps/web/src/modules/part-studio/test/useNamedVersions.test.tsx`

**Interfaces:**
- Produces: `useNamedVersions(iModelId: string | null): { namedVersions: NamedVersion[]; isLoading: boolean; error: unknown; refetch: () => void }`

- [ ] **Step 1: 写失败测试**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listNamedVersions: vi.fn() }));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    listNamedVersions = mocks.listNamedVersions;
  },
}));

import { useNamedVersions } from '../hooks/useNamedVersions.js';

const VERSIONS = [{ id: 'nv-1', name: 'V1', changesetId: 'cs-2' }];

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useNamedVersions', () => {
  it('queryKey 契约 + 成功出口', async () => {
    mocks.listNamedVersions.mockResolvedValue(VERSIONS);
    const { client, wrapper } = createWrapper();
    const { result } = renderHook(() => useNamedVersions('im-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.namedVersions).toEqual(VERSIONS);
    expect(mocks.listNamedVersions).toHaveBeenCalledWith('im-1');
    expect(
      client.getQueryCache().find({ queryKey: ['part-studio', 'named-versions', 'im-1'] }),
    ).toBeDefined();
  });

  it('iModelId=null 门控不查询', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNamedVersions(null), { wrapper });
    expect(mocks.listNamedVersions).not.toHaveBeenCalled();
    expect(result.current.namedVersions).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/part-studio/test/useNamedVersions.test.tsx
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 hook**

```ts
import { useQuery } from '@tanstack/react-query';
import type { NamedVersion } from '@clients/imodels/ImodelsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';

export interface UseNamedVersionsResult {
  namedVersions: NamedVersion[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useNamedVersions(iModelId: string | null): UseNamedVersionsResult {
  const query = useQuery({
    queryKey: ['part-studio', 'named-versions', iModelId],
    queryFn: () => new ImodelsClient().listNamedVersions(iModelId ?? ''),
    enabled: !!iModelId,
  });
  return {
    namedVersions: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/part-studio/test/useNamedVersions.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/modules/part-studio/hooks/useNamedVersions.ts \
  luban-cad/apps/web/src/modules/part-studio/test/useNamedVersions.test.tsx
git commit -m "feat(web): Named Version 查询 hook"
```

---

### Task 5: 保存版本动作 + 对话框

**Files:**
- Create: `luban-cad/apps/web/src/modules/part-studio/hooks/useNamedVersionActions.ts`
- Create: `luban-cad/apps/web/src/modules/part-studio/dialogs/CreateNamedVersionDialog.tsx`
- Create: `luban-cad/apps/web/src/modules/part-studio/dialogs/CreateNamedVersionDialog.css`
- Create: `luban-cad/apps/web/src/modules/part-studio/test/useNamedVersionActions.test.tsx`
- Create: `luban-cad/apps/web/src/modules/part-studio/test/CreateNamedVersionDialog.test.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/components/PartStudioTopBar.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/PartStudioTopBar.test.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/components/PartStudioDock.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/PartStudioDock.test.tsx`
- Modify: `luban-cad/apps/web/src/common/i18n/locales/{zh-CN,en}/part-studio.json`
- Modify: `luban-cad/apps/web/src/common/i18n/test/i18n.test.ts`
- Modify: `luban-cad/apps/web/e2e/part-studio.spec.ts`（新增真实栈用例 + 更新既有“保存版本”干净态断言）
- Modify: `luban-cad/apps/web/e2e/tutorial2.spec.ts`（既有保存版本流程改用新 Named Version 对话框）

**Interfaces:**
- Consumes: `ImodelsClient.createNamedVersion`（Task 3）、`ImodelsClient.listChangesets`（既有）、`BriefcaseConnection.pushChanges(description): Promise<ChangesetIndexAndId>`（iTwin.js core）
- Produces: `useNamedVersionActions(iModelId: string, connection: BriefcaseConnection | undefined, hasUnsavedChanges: boolean): { createNamedVersion: (draft: NamedVersionDraft) => Promise<void> }`
- Produces: `interface NamedVersionDraft { name: string; description?: string }`
- Produces: `CreateNamedVersionDialog`（受控组件，`onConfirm: (draft: NamedVersionDraft) => Promise<void>`）
- Produces: `PartStudioTopBar` 新增可选 prop `canSaveVersion?: boolean`（缺省回退 `hasUnsavedChanges`，避免破坏既有调用）

> **后端现状（2026-10-30 取证）**：hub 的 Named Version CRUD 已存在（`imodelhub-services/src/imodels/named-versions.controller.ts`），但创建**不会自动生成 checkpoint/缩略图**、`namedVersionCount` 不递增、`NamedVersionCreated` 事件未 emit、checkpoint 路由双注册。P0 只交付“元数据命名 + 列表 + 前端流程”；完整发布快照（checkpoint/缩略图/计数/事件）列入 P1/backlog，不在本计划内。前端不得把“已保存版本”宣称为“已生成可离线打开的 checkpoint”。

- [ ] **Step 1: 写失败测试（hook）**

`useNamedVersionActions.test.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';

const mocks = vi.hoisted(() => ({
  createNamedVersion: vi.fn(),
  listChangesets: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    createNamedVersion = mocks.createNamedVersion;
    listChangesets = mocks.listChangesets;
  },
}));

import { useNamedVersionActions } from '../hooks/useNamedVersionActions.js';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('useNamedVersionActions', () => {
  it('有未保存变更：先 pushChanges，再用返回的 changeset id 创建 Named Version', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ index: 2, id: 'cs-2' });
    const connection = { pushChanges } as unknown as BriefcaseConnection;
    const { result } = renderHook(
      () => useNamedVersionActions('im-1', connection, true),
      { wrapper },
    );

    await act(async () => {
      await result.current.createNamedVersion({ name: 'V1', description: 'first' });
    });

    expect(pushChanges).toHaveBeenCalledWith('V1');
    expect(mocks.createNamedVersion).toHaveBeenCalledWith('im-1', {
      name: 'V1',
      description: 'first',
      changesetId: 'cs-2',
    });
    expect(mocks.listChangesets).not.toHaveBeenCalled();
  });

  it('无未保存变更：取最新 changeset 创建 Named Version，不 push', async () => {
    const pushChanges = vi.fn();
    const connection = { pushChanges } as unknown as BriefcaseConnection;
    mocks.listChangesets.mockResolvedValue([
      { id: 'cs-1', index: 1 },
      { id: 'cs-3', index: 3 },
      { id: 'cs-2', index: 2 },
    ]);
    const { result } = renderHook(
      () => useNamedVersionActions('im-1', connection, false),
      { wrapper },
    );

    await act(async () => {
      await result.current.createNamedVersion({ name: 'V1' });
    });

    expect(pushChanges).not.toHaveBeenCalled();
    expect(mocks.createNamedVersion).toHaveBeenCalledWith('im-1', {
      name: 'V1',
      changesetId: 'cs-3',
    });
  });

  it('connection 缺席时拒绝，不发起创建', async () => {
    const { result } = renderHook(
      () => useNamedVersionActions('im-1', undefined, true),
      { wrapper },
    );
    await expect(
      result.current.createNamedVersion({ name: 'V1' }),
    ).rejects.toThrow('连接未就绪');
    expect(mocks.createNamedVersion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 写失败测试（对话框）**

`CreateNamedVersionDialog.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateNamedVersionDialog } from '../dialogs/CreateNamedVersionDialog.js';

describe('CreateNamedVersionDialog', () => {
  it('名称为空时确认禁用；填写后提交 name/description', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <CreateNamedVersionDialog isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    const confirm = screen.getByRole('button', { name: '保存' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('版本名称'), 'V1');
    await user.type(screen.getByLabelText('版本描述'), 'first');
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({ name: 'V1', description: 'first' });
  });

  it('onConfirm 拒绝时就地显示错误且不关闭', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    render(
      <CreateNamedVersionDialog isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    await user.type(screen.getByLabelText('版本名称'), 'V1');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText(/保存失败/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/part-studio/test/useNamedVersionActions.test.tsx \
  src/modules/part-studio/test/CreateNamedVersionDialog.test.tsx
```

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现 hook**

`useNamedVersionActions.ts`：

```ts
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';

export interface NamedVersionDraft {
  name: string;
  description?: string;
}

export interface NamedVersionActions {
  createNamedVersion: (draft: NamedVersionDraft) => Promise<void>;
}

export function useNamedVersionActions(
  iModelId: string,
  connection: BriefcaseConnection | undefined,
  hasUnsavedChanges: boolean,
): NamedVersionActions {
  const queryClient = useQueryClient();

  const createNamedVersion = useCallback(
    async (draft: NamedVersionDraft): Promise<void> => {
      if (!connection) throw new Error('连接未就绪');
      const client = new ImodelsClient();
      let changesetId: string;
      if (hasUnsavedChanges) {
        const pushed = await connection.pushChanges(draft.name);
        changesetId = pushed.id;
      } else {
        const changesets = await client.listChangesets(iModelId);
        const latest = changesets.reduce<{ id: string; index: number } | null>(
          (best, current) => (best === null || current.index > best.index ? current : best),
          null,
        );
        if (!latest) throw new Error('没有可命名的 changeset');
        changesetId = latest.id;
      }
      await client.createNamedVersion(iModelId, {
        name: draft.name,
        ...(draft.description ? { description: draft.description } : {}),
        changesetId,
      });
      await queryClient.invalidateQueries({ queryKey: ['part-studio', 'changesets', iModelId] });
      await queryClient.invalidateQueries({ queryKey: ['part-studio', 'named-versions', iModelId] });
    },
    [connection, hasUnsavedChanges, iModelId, queryClient],
  );

  return { createNamedVersion };
}
```

- [ ] **Step 5: 实现对话框**

`CreateNamedVersionDialog.tsx`：

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { Button, Dialog, Input, Text } from '@itwin/itwinui-react';
import type { NamedVersionDraft } from '../hooks/useNamedVersionActions.js';
import './CreateNamedVersionDialog.css';

export interface CreateNamedVersionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (draft: NamedVersionDraft) => Promise<void>;
}

export function CreateNamedVersionDialog({
  isOpen,
  onClose,
  onConfirm,
}: CreateNamedVersionDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setSubmitError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  const handleConfirm = React.useCallback(async (): Promise<void> => {
    if (!trimmedName || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await onConfirm({
        name: trimmedName,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t('partStudio.namedVersion.success'),
        ),
      );
      onClose();
    } catch (error) {
      setSubmitError(
        t('partStudio.namedVersion.failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [trimmedName, trimmedDescription, isSubmitting, onConfirm, onClose, t]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal isDismissible setFocus>
      <Dialog.Backdrop />
      <Dialog.Main
        styleType="default"
        title={t('partStudio.namedVersion.title')}
        aria-label={t('partStudio.namedVersion.title')}
      >
        <Dialog.TitleBar titleText={t('partStudio.namedVersion.title')} />
        <Dialog.Content>
          <div className="part-studio-version-dialog__body">
            <label htmlFor="part-studio-version-name">
              {t('partStudio.namedVersion.nameLabel')}
              <span className="part-studio-version-dialog__required">
                {t('partStudio.namedVersion.required')}
              </span>
            </label>
            <Input
              id="part-studio-version-name"
              value={name}
              disabled={isSubmitting}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('partStudio.namedVersion.namePlaceholder')}
              data-testid="part-studio-version-name-input"
            />
            <label htmlFor="part-studio-version-description">
              {t('partStudio.namedVersion.descriptionLabel')}
            </label>
            <Input
              id="part-studio-version-description"
              value={description}
              disabled={isSubmitting}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('partStudio.namedVersion.descriptionPlaceholder')}
              data-testid="part-studio-version-description-input"
            />
            {submitError && <Text color="negative">{submitError}</Text>}
          </div>
        </Dialog.Content>
        <Dialog.ButtonBar>
          <Button styleType="default" onClick={onClose} disabled={isSubmitting}>
            {t('partStudio.namedVersion.cancel')}
          </Button>
          <Button
            styleType="high-visibility"
            disabled={!trimmedName || isSubmitting}
            aria-busy={isSubmitting}
            onClick={() => void handleConfirm()}
          >
            {isSubmitting
              ? t('partStudio.namedVersion.saving')
              : t('partStudio.namedVersion.confirm')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
```

`CreateNamedVersionDialog.css`：

```css
.part-studio-version-dialog__body {
  display: flex;
  flex-direction: column;
  gap: var(--iui-size-s);
  min-width: 320px;
}
.part-studio-version-dialog__required {
  color: var(--iui-color-text-negative);
  margin-inline-start: var(--iui-size-2xs);
}
```

- [ ] **Step 6: 接线页面**

`PartStudioPage.tsx` / `PartStudioSession`：
- import `useNamedVersionActions` 与 `CreateNamedVersionDialog`。
- 在 `PartStudioSession` 内（`undoRedo`、`connection`、`canEdit` 已就绪）：

```ts
const namedVersionActions = useNamedVersionActions(
  iModelId,
  connection,
  undoRedo.hasUnsavedChanges,
);
const [createVersionOpen, setCreateVersionOpen] = React.useState(false);
```

- 把 `handleSaveVersion` 从 `setPushDialogOpen(true)` 改为：

```ts
const handleSaveVersion = useCallback(() => {
  if (!canEdit || !connection) return;
  setCreateVersionOpen(true);
}, [canEdit, connection]);
```

- 顶栏新增 `canSaveVersion` 透传（干净态也可命名当前 changeset）：

```tsx
<PartStudioTopBar
  // ...既有 props
  hasUnsavedChanges={undoRedo.hasUnsavedChanges}
  canSaveVersion={canEdit && !!connection}
  onSave={handleSaveVersion}
/>
```

- `PartStudioTopBar.tsx`：新增可选 prop，并只改保存钮：

```ts
export interface PartStudioTopBarProps {
  // ...既有
  /** 保存版本可用性（缺省回退 hasUnsavedChanges，保持既有测试/调用语义）。 */
  canSaveVersion?: boolean;
}
// ...
disabled={!(canSaveVersion ?? hasUnsavedChanges)}
```

- 保留 `handlePushConfirm` 与 `PushChangesetDialog` 给 dock「推送」。
- 在 `PushChangesetDialog` 旁渲染：

```tsx
<CreateNamedVersionDialog
  isOpen={createVersionOpen}
  onClose={() => setCreateVersionOpen(false)}
  onConfirm={namedVersionActions.createNamedVersion}
/>
```

- `PartStudioTopBar.test.tsx`：保留既有「干净态禁用」用例（缺省 `canSaveVersion` 未传）；新增一条「canSaveVersion=true 时干净态可用」的断言。

- 版本历史面板显示 Named Versions（`PartStudioDock.tsx` 的 `ChangesetsPanel`；顶部新增 `import { useNamedVersions } from '../hooks/useNamedVersions.js';`）：

```tsx
const { namedVersions } = useNamedVersions(iModelId);
// 在 changesets 列表上方（isLoading/error 不变）：
{namedVersions.length > 0 && (
  <div className="part-studio-dock-history__named" data-testid="part-studio-named-versions">
    <Text isMuted>{t('partStudio.dock.history.namedVersions')}</Text>
    <ul>
      {namedVersions.map((version) => (
        <li key={version.id} data-testid="part-studio-named-version-row">
          <span className="part-studio-dock-history__description">{version.name}</span>
          {version.description && (
            <span className="part-studio-dock-history__date">{version.description}</span>
          )}
        </li>
      ))}
    </ul>
  </div>
)}
```

- `PartStudioDock.test.tsx`：mock `useNamedVersions` 返回 `[{ id: 'nv-1', name: 'V1' }]`，断言 `V1` 可见。
- i18n `partStudio.dock.history.namedVersions`：zh「命名版本」/ en「Named versions」。

- i18n `zh-CN/part-studio.json` 顶层 `namedVersion`：

```json
"namedVersion": {
  "title": "保存版本",
  "nameLabel": "版本名称",
  "namePlaceholder": "例如：V1.0 设计冻结",
  "descriptionLabel": "版本描述",
  "descriptionPlaceholder": "可选",
  "required": "必填",
  "cancel": "取消",
  "confirm": "保存",
  "saving": "保存中…",
  "success": "版本已保存",
  "failed": "保存失败: {{message}}"
}
```

`en/part-studio.json` 同结构英文；`i18n.test.ts` 增加 `namedVersion` 键守卫。

- 将 `pushChangeset.title` 的 zh 值从「保存版本」改为「推送变更」（en: `Push changes`），避免与「保存版本」混淆；同步 en。

- [ ] **Step 7: 跑单元测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/part-studio/test/useNamedVersionActions.test.tsx \
  src/modules/part-studio/test/CreateNamedVersionDialog.test.tsx \
  src/common/i18n/test/i18n.test.ts
```

Expected: PASS。

- [ ] **Step 8: 真实栈 e2e（需栈运行）**

在 `e2e/part-studio.spec.ts` 新增：

```ts
test('保存版本：干净态命名当前 changeset', async ({ page }) => {
  // beforeEach 已 openSeedImodelEditor + waitEditorReady；E2E Seed 每轮重置，
  // 干净事务态下 hasUnsavedChanges=false，保存版本走「最新 changeset 命名」路径。
  await expect(page.getByTestId('part-studio-save-button')).toBeEnabled();
  await page.getByTestId('part-studio-save-button').click();

  const dialog = page.getByRole('dialog', { name: '保存版本' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('版本名称').fill('E2E V1');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('版本已保存')).toBeVisible();

  // 打开版本历史面板，确认 Named Version 行出现
  await page.getByRole('tab', { name: '版本历史' }).click();
  const named = page.getByTestId('part-studio-named-versions');
  await expect(named).toBeVisible();
  await expect(named.getByText('E2E V1')).toBeVisible();
});
```

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx playwright test e2e/part-studio.spec.ts --grep "保存版本"
```

Expected: PASS（若栈未起，先按 `docs/Architecture.md` 启动；此步不得跳过宣称完成）。

- [ ] **Step 8b: 改写既有 e2e 的“保存版本”语义**

顶栏“保存版本”已从 PushChangesetDialog 改为 CreateNamedVersionDialog；必须同步两条既有断言，否则 e2e 必红：

1. `e2e/part-studio.spec.ts:68` 的干净态三钮断言：`part-studio-save-button` 由 `toBeDisabled()` 改为 `toBeEnabled()`（保存版本始终可命名当前 changeset；undo/redo 仍禁用）。
2. `e2e/tutorial2.spec.ts:747-760` 的保存版本流程：改为打开新对话框、填“版本名称”、保存、断言成功 toast + 版本历史出现该 Named Version；对话框关闭后保存钮仍为 enabled（干净态可继续命名当前 changeset），不再是 `toBeDisabled()`。dock“推送”路径仍由 `PushChangesetDialog` 覆盖，不动。

```ts
// tutorial2.spec.ts 片段（替换原 push dialog 交互）
await expect(saveButton).toBeEnabled({ timeout: 30_000 });
await saveButton.click();
const versionDialog = page.getByRole('dialog', { name: '保存版本' });
await expect(versionDialog).toBeVisible({ timeout: 15_000 });
await versionDialog.getByLabel('版本名称').fill(pushDescription);
await versionDialog.getByRole('button', { name: '保存' }).click();
await expect(page.getByText('版本已保存')).toBeVisible({ timeout: 60_000 });
await expect(saveButton).toBeEnabled({ timeout: 30_000 });
await page.getByTestId('part-studio-dock').getByRole('tab', { name: '版本历史' }).click();
await expect(page.getByTestId('part-studio-named-versions').getByText(pushDescription)).toBeVisible();
```

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx playwright test e2e/part-studio.spec.ts e2e/tutorial2.spec.ts --grep "保存版本|三钮|T7 冒烟"
```

Expected: PASS；若栈不可用，记录未跑，不得宣称通过。

- [ ] **Step 9: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/modules/part-studio \
  luban-cad/apps/web/src/common/i18n \
  luban-cad/apps/web/e2e/part-studio.spec.ts \
  luban-cad/apps/web/e2e/tutorial2.spec.ts
git commit -m "feat(web): 保存版本——推送 changeset 后创建 Named Version"
```

---

### Task 6: `packages/shared` iTwin taxonomy 对齐官方

**Files:**
- Modify: `luban-cad/packages/shared/src/projects/types.ts`
- Modify: `luban-cad/packages/shared/src/projects/types.test.ts`

**Interfaces:**
- Produces: `ITwinClass = 'Account' | 'Thing' | 'Endeavor'`
- Produces: `ITwinSubClass = 'Account' | 'Portfolio' | 'Asset' | 'Program' | 'Project' | 'WorkPackage'`

- [ ] **Step 1: 写失败测试**

在 `types.test.ts` 中把两处 `class: 'Project'` 改为 `class: 'Endeavor'`，`subClass` 分别改为 `'Project'`；并在类型测试中断言：

```ts
const official: ITwin = {
  id: 'official',
  displayName: 'Official',
  class: 'Endeavor',
  subClass: 'Project',
  status: 'Active',
  createdDateTime: new Date().toISOString(),
  lastModifiedDateTime: new Date().toISOString(),
  createdBy: 'user-1',
  lastModifiedBy: 'user-1',
};
expect(official.class).toBe('Endeavor');
expect(official.subClass).toBe('Project');
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/packages/shared
npx vitest run src/projects/types.test.ts
```

Expected: FAIL（类型不匹配 / 断言失败）。

- [ ] **Step 3: 修改枚举**

`packages/shared/src/projects/types.ts:47`：

```ts
/** 官方 iTwin class（iTwins API v1）。 */
export type ITwinClass = 'Account' | 'Thing' | 'Endeavor';
```

`:53-86`：

```ts
/** 官方 iTwin subClass（iTwins API v1）。 */
export type ITwinSubClass =
  | 'Account'
  | 'Portfolio'
  | 'Asset'
  | 'Program'
  | 'Project'
  | 'WorkPackage';
```

`ProjectClass`/`ProjectSubClass` 兼容别名保留（它们会随新类型自动变化）。

- [ ] **Step 4: 跑测试 + 构建**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/packages/shared
npx vitest run src/projects/types.test.ts
npx tsc
```

Expected: PASS；`dist/` 重建。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/packages/shared/src/projects luban-cad/packages/shared/dist 2>/dev/null || true
git commit -m "refactor(shared): iTwin taxonomy 对齐官方 class/subClass"
```

> `dist/` 是否入库以仓库现状为准；若 `.gitignore` 忽略，只提交源码。

---

### Task 7: 前端创建 iTwin 传官方 class/subClass

**Files:**
- Modify: `luban-cad/apps/web/src/clients/itwins/types.ts`
- Modify: `luban-cad/apps/web/src/modules/documents/components/CreateDocumentDialog.tsx`
- Modify: `luban-cad/apps/web/src/modules/documents/test/DocumentsPage.test.tsx`（或 CreateDocumentDialog 现有测试）
- Modify: `luban-cad/apps/web/e2e/seed.ts`
- Modify: `luban-cad/apps/web/e2e/boolean-bodies.spec.ts`
- Modify: `luban-cad/apps/web/e2e/feature-contracts.spec.ts`
- Modify: `luban-cad/apps/web/e2e/newbody.spec.ts`
- Modify: `luban-cad/apps/web/e2e/perf.spec.ts`

**Interfaces:**
- Consumes: 官方 `ITwinClass` / `ITwinSubClass`（`@itwin/itwins-client`）
- Produces: `CreateItwinInput` 增加 `subClass?: ITwinSubClass`、`parentId?: string`

- [ ] **Step 1: 写失败测试**

在创建文档的现有测试中（`DocumentsPage.test.tsx` 或独立 dialog 测试）断言：

```ts
expect(createMock).toHaveBeenCalledWith(
  expect.objectContaining({
    displayName: '新文档',
    class: 'Endeavor',
    subClass: 'Project',
  }),
);
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/documents/test/DocumentsPage.test.tsx
```

Expected: FAIL（未传 class/subClass）。

- [ ] **Step 3: 扩类型与创建载荷**

`clients/itwins/types.ts`：

```ts
import type { ITwin, ITwinClass, ITwinSubClass } from '@itwin/itwins-client';

export interface CreateItwinInput {
  displayName: string;
  class?: ITwinClass;
  subClass?: ITwinSubClass;
  parentId?: string;
  number?: string;
}
```

`CreateDocumentDialog.tsx` 的 `handleSubmit`：

```ts
const input: CreateDocumentInput = {
  displayName: name.trim(),
  class: 'Endeavor',
  subClass: 'Project',
};
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/modules/documents/test/DocumentsPage.test.tsx
npx tsc --noEmit
```

Expected: PASS。

- [ ] **Step 4b: 更新 e2e 种子/用例的 iTwin 创建载荷**

hub taxonomy 迁移后 `class:'Project'` 不再是合法值；以下五处必须改为官方 `{ class: 'Endeavor', subClass: 'Project' }`，否则 e2e 种子/用例在 Task 8 后必红：

- `e2e/seed.ts:20`
- `e2e/boolean-bodies.spec.ts:138`
- `e2e/feature-contracts.spec.ts:210`
- `e2e/newbody.spec.ts:149`
- `e2e/perf.spec.ts:311`

```ts
// 旧：data: { displayName: ..., class: 'Project' }
data: { displayName: ..., class: 'Endeavor', subClass: 'Project' }
```

验证：

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
grep -rn "class: 'Project'" e2e
```

Expected: 0 命中（该字符串只允许出现在历史文档/迁移说明中）。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/clients/itwins/types.ts \
  luban-cad/apps/web/src/modules/documents/components/CreateDocumentDialog.tsx \
  luban-cad/apps/web/src/modules/documents/test \
  luban-cad/apps/web/e2e/seed.ts \
  luban-cad/apps/web/e2e/boolean-bodies.spec.ts \
  luban-cad/apps/web/e2e/feature-contracts.spec.ts \
  luban-cad/apps/web/e2e/newbody.spec.ts \
  luban-cad/apps/web/e2e/perf.spec.ts
git commit -m "feat(web): 新建文档传官方 iTwin class/subClass"
```

---

### Task 8: 私有 hub 官方 iTwin taxonomy（class/subClass + 迁移）

**Files (private repo `D:/Github/imodelhub-services`):**
- Modify: `src/itwins/domain/itwin-class.enum.ts`
- Modify: `src/itwins/domain/itwin.ts`（新增 `ITwinSubClass`）
- Modify: `src/itwins/dto/create-itwin.dto.ts`
- Modify: `src/itwins/dto/update-itwin.dto.ts`
- Modify: `src/itwins/itwins.service.ts`
- Modify: `src/itwins/infrastructure/persistence/relational/entities/itwin.entity.ts`
- Create: `src/database/migrations/20261030000001-AddOfficialITwinClassEnum.ts`
- Create: `src/database/migrations/20261030000002-NormalizeITwinTaxonomy.ts`
- Create: `src/database/migrations/20261030000003-AddITwinGeography.ts`
- Modify: `src/itwins/infrastructure/persistence/relational/entities/itwin.entity.ts`（geo 字段）
- Modify: `src/itwins/dto/itwin-response.dto.ts`（geo 字段）
- Modify: `src/imodels/imodels.controller.ts`（POST /imodels 权限守卫）
- Modify: `src/imodels/dto/update-imodel.dto.ts`（移除客户端可写 `state`）
- Modify: `test/itwins.e2e-spec.ts`（或现有 itwins 测试）
- Modify: `test/integration/authorization.e2e-spec.ts`（POST /imodels 越权 403）
- Modify: `test/integration/smoke-crud.e2e-spec.ts`（PATCH state 被拒）

**Interfaces:**
- Produces: `enum iTwinClass { Account='Account', Thing='Thing', Endeavor='Endeavor' }`
- Produces: `enum iTwinSubClass { Account='Account', Portfolio='Portfolio', Asset='Asset', Program='Program', Project='Project', WorkPackage='WorkPackage' }`
- Produces: create accepts `class` + `subClass`（也兼容旧 `subclass`）；默认 `Endeavor` + `Project`

- [ ] **Step 1: 改枚举与默认值**

`src/itwins/domain/itwin-class.enum.ts`：

```ts
export enum iTwinClass {
  Account = 'Account',
  Thing = 'Thing',
  Endeavor = 'Endeavor',
}

export enum iTwinSubClass {
  Account = 'Account',
  Portfolio = 'Portfolio',
  Asset = 'Asset',
  Program = 'Program',
  Project = 'Project',
  WorkPackage = 'WorkPackage',
}
```

`src/itwins/domain/itwin.ts`：

```ts
import { iTwinClass, iTwinSubClass } from './itwin-class.enum';
export { iTwinClass, iTwinSubClass };
// ...
  class!: iTwinClass;
  subclass!: string;

  /** 官方响应名 subClass（iTwinResponseDto @Expose({ name: 'subClass' }) 的读取源）。 */
  get subClass(): string {
    return this.subclass;
  }
```

`itwin.entity.ts`：

```ts
@Column({ type: 'enum', enum: iTwinClass, default: iTwinClass.Endeavor })
class!: iTwinClass;

@Column({ type: 'string', default: 'Project' })
subclass!: string;
```

`itwins.service.ts`：

```ts
class: createDto.class ?? iTwinClass.Endeavor,
subclass: createDto.subClass ?? createDto.subclass ?? 'Project',
```

- [ ] **Step 2: DTO 接受官方 `subClass`**

`create-itwin.dto.ts` 增加（保留旧 `subclass` 兼容）：

```ts
@ApiPropertyOptional({ enum: iTwinSubClass, default: iTwinSubClass.Project })
@IsEnum(iTwinSubClass)
@IsOptional()
subClass?: iTwinSubClass;
```

`class` 的默认改为 `iTwinClass.Endeavor`；`update-itwin.dto.ts` 同步增加 `subClass`。

- [ ] **Step 2b: 补官方地理字段 + 修 POST /imodels 越权面**

**地理字段**（官方 iTwin 有、本地 hub 当前没有）：

`itwin.entity.ts` / `itwin-response.dto.ts` / `create-itwin.dto.ts` / `update-itwin.dto.ts` 增加：

```ts
@Column({ type: 'varchar', length: 255, nullable: true })
geographicLocation!: string | null;

@Column({ type: 'double precision', nullable: true })
latitude!: number | null;

@Column({ type: 'double precision', nullable: true })
longitude!: number | null;
```

DTO 用 `@IsOptional() @IsString() geographicLocation?` / `@IsOptional() @IsNumber() latitude?` / `longitude?`；响应 DTO `@Expose()` 同名。

`20261030000003-AddITwinGeography.ts`：

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddITwinGeography20261030000003 implements MigrationInterface {
  name = 'AddITwinGeography20261030000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "itwins" ADD "geographicLocation" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "itwins" ADD "latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "itwins" ADD "longitude" double precision`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "itwins" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "itwins" DROP COLUMN "latitude"`);
    await queryRunner.query(`ALTER TABLE "itwins" DROP COLUMN "geographicLocation"`);
  }
}
```

**POST /imodels 越权面**：当前创建 iModel 只有 JWT、没有 iTwin 权限守卫（`imodels.controller.ts` create 方法）。补：

```ts
@RequirePermission(Permission.IMODELS_MANAGE, { itwinParam: 'iTwinId' })
@UseGuards(ResourceAccessGuard)
```

若 `ResourceAccessGuard` 无法从 body 解析 `iTwinId`，在 guard 里增加 `bodyIitwinParam` 解析或先查 body 的 `iTwinId` 再委托；补 stranger 403 e2e：

```ts
it('非成员不能在他人 iTwin 下创建 iModel（403）', async () => {
  await request(server)
    .post('/imodels')
    .set('Authorization', `Bearer ${strangerToken}`)
    .send({ iTwinId: otherUserItwinId, name: 'evil' })
    .expect(403);
});
```

- [ ] **Step 2c: 禁止客户端写 iModel state**

`update-imodel.dto.ts` 移除 `state` 字段（或加 `@IsEmpty()` 拒绝），保留实体/响应只读。补测试：

```ts
it('客户端 PATCH state 被拒（422/400），不得伪造 initialized', async () => {
  await request(server)
    .patch(`/imodels/${iModelId}`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ state: 'initialized' })
    .expect((res) => expect([400, 422]).toContain(res.status));
});
```

- [ ] **Step 3: 写迁移（两段）**

`20261030000001-AddOfficialITwinClassEnum.ts`：

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOfficialITwinClassEnum20261030000001 implements MigrationInterface {
  name = 'AddOfficialITwinClassEnum20261030000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."itwins_class_enum" ADD VALUE IF NOT EXISTS 'Thing'`);
    await queryRunner.query(`ALTER TYPE "public"."itwins_class_enum" ADD VALUE IF NOT EXISTS 'Endeavor'`);
  }

  public async down(): Promise<void> {
    // PostgreSQL 不支持删除单个 enum 值；回滚由数据迁移的 down 负责。
  }
}
```

`20261030000002-NormalizeITwinTaxonomy.ts`：

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeITwinTaxonomy20261030000002 implements MigrationInterface {
  name = 'NormalizeITwinTaxonomy20261030000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "itwins" SET "class" = 'Endeavor', "subclass" = 'Project'
       WHERE "class" = 'Project' AND ("subclass" IS NULL OR "subclass" = '')`,
    );
    await queryRunner.query(
      `UPDATE "itwins" SET "class" = 'Thing', "subclass" = 'Asset'
       WHERE "class" = 'Asset' AND ("subclass" IS NULL OR "subclass" = '')`,
    );
    await queryRunner.query(
      `UPDATE "itwins" SET "class" = 'Account', "subclass" = 'Account'
       WHERE "class" = 'Account' AND ("subclass" IS NULL OR "subclass" = '')`,
    );
    await queryRunner.query(
      `ALTER TABLE "itwins" ALTER COLUMN "class" SET DEFAULT 'Endeavor'`,
    );
    await queryRunner.query(
      `ALTER TABLE "itwins" ALTER COLUMN "subclass" SET DEFAULT 'Project'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "itwins" ALTER COLUMN "subclass" SET DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "itwins" ALTER COLUMN "class" SET DEFAULT 'Project'`);
    await queryRunner.query(
      `UPDATE "itwins" SET "class" = 'Project', "subclass" = '' WHERE "class" = 'Endeavor'`,
    );
    await queryRunner.query(
      `UPDATE "itwins" SET "class" = 'Asset', "subclass" = '' WHERE "class" = 'Thing'`,
    );
  }
}
```

- [ ] **Step 4: 测试**

在 `test/itwins.e2e-spec.ts` 增加：

```ts
it('创建 iTwin 接受官方 class/subClass 并在响应中回显', async () => {
  const res = await request(app.getHttpServer())
    .post('/itwins')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: 'Official Taxonomy', class: 'Endeavor', subClass: 'Project' })
    .expect(201);
  expect(res.body.iTwin.class).toBe('Endeavor');
  expect(res.body.iTwin.subClass).toBe('Project');
});
```

- [ ] **Step 5: 跑测试与迁移（本地库）**

```bash
cd D:/Github/imodelhub-services
npm run test:unit
npm run migration:run
npm run test:e2e
npm run build
```

Expected: 全绿。若本地库不可用，至少 `npm run test:unit` 与 `npm run build` 必须绿；e2e 在具备 Postgres 的环境执行。

- [ ] **Step 6: 真实栈验证（需重建镜像；先征得同意）**

```bash
cd D:/Github/imodelhub-services
docker build -t ghcr.io/chenjinxian/imodelhub:latest .
cd D:/Github/tiangong-kaiwu
docker compose up -d --force-recreate imodelhub
curl -s http://localhost:5400/health
```

然后用测试账号 `GET /itwins` 确认返回 `class: "Endeavor"` 且含 `subClass: "Project"`。

- [ ] **Step 7: 提交（私有仓）**

```bash
cd D:/Github/imodelhub-services
git add src/itwins src/database/migrations test
git commit -m "feat(itwins): 官方 iTwin class/subClass taxonomy 与迁移"
```

---

### Task 9: `WorkspaceRef` 类型与解析

**Files:**
- Create: `luban-cad/apps/web/src/common/workspace/workspace-ref.ts`
- Create: `luban-cad/apps/web/src/common/workspace/test/workspace-ref.test.ts`

**Interfaces:**
- Produces: `export interface WorkspaceRef { iTwinId: string; iModelId: string; modelId?: string }`
- Produces: `parseWorkspaceRef(params: { iTwinId?: string; iModelId?: string; model?: string | null }): WorkspaceRef | null`
- Produces: `workspaceRefPath(ref: WorkspaceRef): string`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { parseWorkspaceRef, workspaceRefPath } from '../workspace-ref.js';

describe('WorkspaceRef', () => {
  it('缺 iTwinId/iModelId 返回 null', () => {
    expect(parseWorkspaceRef({ iModelId: 'im-1' })).toBeNull();
    expect(parseWorkspaceRef({ iTwinId: 'twin-1' })).toBeNull();
  });

  it('解析 iTwinId/iModelId/model，model 可选', () => {
    expect(parseWorkspaceRef({ iTwinId: 'twin-1', iModelId: 'im-1' })).toEqual({
      iTwinId: 'twin-1',
      iModelId: 'im-1',
    });
    expect(
      parseWorkspaceRef({ iTwinId: 'twin-1', iModelId: 'im-1', model: 'model-1' }),
    ).toEqual({ iTwinId: 'twin-1', iModelId: 'im-1', modelId: 'model-1' });
  });

  it('路径：无 model 为 /documents/<twin>/<imodel>；有 model 加 ?model=', () => {
    expect(workspaceRefPath({ iTwinId: 'twin-1', iModelId: 'im-1' })).toBe(
      '/documents/twin-1/im-1',
    );
    expect(
      workspaceRefPath({ iTwinId: 'twin-1', iModelId: 'im-1', modelId: 'model-1' }),
    ).toBe('/documents/twin-1/im-1?model=model-1');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/common/workspace/test/workspace-ref.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
export interface WorkspaceRef {
  iTwinId: string;
  iModelId: string;
  /** B 模式：文档内活动 Part Studio/Model；A 模式可缺省。 */
  modelId?: string;
}

export interface WorkspaceRefParams {
  iTwinId?: string;
  iModelId?: string;
  model?: string | null;
}

export function parseWorkspaceRef(params: WorkspaceRefParams): WorkspaceRef | null {
  if (!params.iTwinId || !params.iModelId) return null;
  return {
    iTwinId: params.iTwinId,
    iModelId: params.iModelId,
    ...(params.model ? { modelId: params.model } : {}),
  };
}

export function workspaceRefPath(ref: WorkspaceRef): string {
  const base = `/documents/${encodeURIComponent(ref.iTwinId)}/${encodeURIComponent(ref.iModelId)}`;
  return ref.modelId ? `${base}?model=${encodeURIComponent(ref.modelId)}` : base;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/common/workspace/test/workspace-ref.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/common/workspace
git commit -m "feat(web): WorkspaceRef 类型与解析"
```

---

### Task 10: `useWorkspaceRef` 接线 Part Studio

**Files:**
- Create: `luban-cad/apps/web/src/common/workspace/use-workspace-ref.ts`
- Create: `luban-cad/apps/web/src/common/workspace/test/use-workspace-ref.test.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx`

**Interfaces:**
- Produces: `useWorkspaceRef(): WorkspaceRef | null`（读 `useParams` + `useSearchParams`）

- [ ] **Step 1: 写失败测试**

```tsx
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useWorkspaceRef } from '../use-workspace-ref.js';

function renderAt(path: string) {
  let captured: ReturnType<typeof useWorkspaceRef> = null;
  function Probe(): null {
    captured = useWorkspaceRef();
    return null;
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/documents/:iTwinId/:iModelId" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return captured;
}

describe('useWorkspaceRef', () => {
  it('读取 iTwinId/iModelId 与可选 model', () => {
    expect(renderAt('/documents/twin-1/im-1')).toEqual({
      iTwinId: 'twin-1',
      iModelId: 'im-1',
    });
    expect(renderAt('/documents/twin-1/im-1?model=model-1')).toEqual({
      iTwinId: 'twin-1',
      iModelId: 'im-1',
      modelId: 'model-1',
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/common/workspace/test/use-workspace-ref.test.tsx
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 hook**

```ts
import { useParams, useSearchParams } from 'react-router-dom';
import { parseWorkspaceRef, type WorkspaceRef } from './workspace-ref.js';

export function useWorkspaceRef(): WorkspaceRef | null {
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
  const [searchParams] = useSearchParams();
  return parseWorkspaceRef({
    iTwinId,
    iModelId,
    model: searchParams.get('model'),
  });
}
```

- [ ] **Step 4: 接线 `PartStudioPage`**

把：

```ts
const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
```

替换为：

```ts
const workspaceRef = useWorkspaceRef();
const iTwinId = workspaceRef?.iTwinId;
const iModelId = workspaceRef?.iModelId;
```

后续 `iTwinId ?? null`、`iModelId ?? null` 等保持不变；`modelId` 暂不消费（留给 B 模式的页签切换）。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx vitest run src/common/workspace/test/use-workspace-ref.test.tsx \
  src/modules/part-studio/test/PartStudioPage.test.tsx
npx tsc --noEmit
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/apps/web/src/common/workspace \
  luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx
git commit -m "refactor(web): Part Studio 经 WorkspaceRef 取参"
```

---

### Task 11: P0 收口验证

**Files:**
- Modify: `docs/adr/0001-itwin-imodel-data-model.md`（决策记录追加 P0 完成状态）
- Modify: `docs/superpowers/plans/2026-10-30-b-model-p0-prerequisites.md`（勾选）

- [ ] **Step 1: 公共仓全量验证**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/packages/shared
npx tsc
npx vitest run
cd D:/Github/tiangong-kaiwu/luban-cad/apps/web
npx tsc --noEmit
npx vitest run
npx eslint "src/**/*.ts*"
```

Expected: 全绿。若既有基线有已知失败，记录失败清单与原因，不得声称全绿。

- [ ] **Step 2: 私有仓验证**

```bash
cd D:/Github/luban-backend/modeling-server
npx tsc
npx vitest run
npx eslint "src/**/*.ts"

cd D:/Github/imodelhub-services
npm run test:unit
npm run build
```

Expected: 全绿；hub e2e 在本地 Postgres 可用时执行。

- [ ] **Step 3: 真实栈验证（需栈运行）**

- 启动/确认栈：`docker compose up -d` + `scripts/start-ms-host.ps1 -Detach`。
- 打开文档中心，确认：
  - 新建文档成功，且请求载荷含 `class: 'Endeavor'`, `subClass: 'Project'`（DevTools/Network 或 hub 日志）。
  - 文档详情页的 iModel 徽标对 `initialized` 显示「已初始化」；手动构造失败态（可用测试 fixture / mock）显示「初始化失败」且不显示「同步中」。
- 打开编辑器，创建特征 → 点「保存版本」→ 填名称 → 保存 → 版本历史出现该 Named Version。
- 截图存档到 `docs/superpowers/plans/assets/2026-10-30-p0/`（若该目录不存在则创建），命名 `named-version.png`、`imodel-states.png`。

- [ ] **Step 4: 更新 ADR 与计划状态**

在 ADR 第 14 节追加：

```md
| 2026-10-30 | P0 四项前置完成（Named Version / 状态诚实化 / taxonomy / WorkspaceRef），进入 P1 spike | 进行中 |
```

在本计划每个任务末尾勾选 `- [x]`。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add docs/adr/0001-itwin-imodel-data-model.md \
  docs/superpowers/plans/2026-10-30-b-model-p0-prerequisites.md \
  docs/superpowers/plans/assets/2026-10-30-p0 2>/dev/null || true
git commit -m "docs: P0 前置验证收口（Named Version/状态/taxonomy/WorkspaceRef）"
```

---

## P0 验收标准

- [ ] `ImodelSummary.state` 存在，四态 mapper 单测通过；失败态不再显示「初始化中」。
- [ ] 前端 `ImodelsClient` 有 `listNamedVersions`/`createNamedVersion`，hook + 对话框 + 保存版本流程单测通过；真实栈 e2e 通过。
- [ ] `packages/shared` 的 `ITwinClass/ITwinSubClass` 与官方一致；`apps/web` 创建文档传 `class: 'Endeavor'`, `subClass: 'Project'`。
- [ ] hub 本地库迁移后 `GET /itwins` 返回官方 class/subClass；`npm run test:unit`/`build` 绿。
- [ ] `WorkspaceRef` 类型/解析/hook 单测通过；`PartStudioPage` 行为不变（A 模式）。
- [ ] 公共仓 `npx vitest run`、`npx tsc --noEmit`、`npx eslint` 全绿（或记录既有基线失败）。
- [ ] 真实栈截图与 ADR 状态更新完成。
- [ ] **未做**：B 模式的多 Model 页签、数据迁移、feature 多 Part Studio 作用域（P1 spike 及后续计划）。

---

## 与 P1 的交接

P0 完成后，P1 spike 才能开始：

1. `modeling-server` 的 `FeatureService` 多 Part Studio 作用域（`createFeatureModels` 当前每 iModel 一套 def/phys model）。
2. 旧 Part Studio iModel → 新文档 iModel 内 Model 的迁移（Transformation 或手工 Element 复制）。
3. 5–10 个 Part Studio 同一 iModel 的打开/切换/tile 性能。
4. Named Version + 文档级共享在目标模型上验证。

P1 计划另见 `docs/superpowers/plans/2026-10-30-b-model-p1-spike.md`。
