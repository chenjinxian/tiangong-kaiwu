# 面/边子实体选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 part-studio 增加显式面/边选择模式，支持多选、精确工具高亮与 owner-aware 的隐藏/选中所属实体菜单。

**Architecture:** 专用 `SubEntitySelectTool`（继承 `LocateSubEntityTool`）在 `selectionMode='face'|'edge'` 时启动，立即把 session cache id 经 `resolveFaceRef`/`resolveEdgeRef` 换成持久拓扑 id，写入 `CanvasSelection{ownerBodyKey,topologyId}`；元素级 body 桥在子实体模式退订，避免互相覆盖。右键菜单只做 owner 安全动作，删除禁用。

**Tech Stack:** React 18 / Zustand / iTwin.js editor-frontend / Vitest / Playwright。

**Spec:** `docs/superpowers/specs/2026-10-29-m-a5.2-subentity-selection-perf-design.md`

## Global Constraints

- 只改 `luban-cad/apps/web`；不改 shared/private/schema/MS；无新依赖。
- 边选择复用现有 `resolveEdgeRef`；边界/非流形边不可选，不泛化契约。
- 面/边删除、面级特征编辑、持久子实体 overlay 均不在本计划。
- 子实体选择不经 `SelectionSet`；`useCanvasBodySelection` 只在 body 模式订阅。
- 不写 `tree.selectedNodeIds`，除「选中所属实体」显式动作。
- 所有 toast 用 `IModelApp.notifications`；错误不静默。
- i18n zh/en 同步并更新 `REQUIRED_PART_STUDIO_KEYS`。
- 不 push/Release；每任务本地 commit；worktree clean。
- e2e 需干净 MS 100 req/15min 窗口；默认全套不新增 scratch（扩展现有 newbody）。

---

### Task 1: 选择模型、模式 store 与 body 桥门控

**Files:**
- Modify: `luban-cad/apps/web/src/modules/part-studio/types.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/stores/use-part-studio-store.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/hooks/useCanvasBodySelection.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/use-part-studio-store.test.ts`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/useCanvasBodySelection.test.ts`
- Test resets (10 files): `CanvasContextMenu.test.tsx`, `FeatureTree.test.tsx`,
  `PartStudioCanvas.test.tsx`, `FeatureDialog.test.tsx`, `PartStudioSidebar.test.tsx`,
  `PartStudioPage.test.tsx`, `part-studio-structure.test.tsx`, `SketchDialog.test.tsx`,
  `useCanvasBodySelection.test.ts`, `use-part-studio-store.test.ts`（同目录 `test/`）

**Interfaces:**
- Produces: `CanvasSelectionMode = 'body' | 'face' | 'edge'`；
  `CanvasSelection.ownerBodyKey?/topologyId?`；`canvas.selectionMode`；
  `setSelectionMode(mode)`；`useCanvasBodySelection(connection, bodies, enabled = true)`；
  `canvasSelectionKey(selection)`（稳定 key，测试/组内复用）。

- [ ] **Step 1: Write failing store test**

In `test/use-part-studio-store.test.ts` add:

```ts
it('setSelectionMode 切模式清空 canvas 选择，树选中不动；同模式幂等', () => {
  const store = usePartStudioStore.getState();
  store.setCanvasSelection([{ kind: 'part', id: '0x15', label: 'Body 1' }]);
  store.setSelectedNodeIds(['feature-1']);
  store.setSelectionMode('face');
  expect(usePartStudioStore.getState().canvas.selectionMode).toBe('face');
  expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
  expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['feature-1']);
  store.setSelectionMode('face');
  expect(usePartStudioStore.getState().canvas.selectionMode).toBe('face');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd luban-cad/apps/web
CI=true corepack pnpm@10 exec vitest run src/modules/part-studio/test/use-part-studio-store.test.ts -t "setSelectionMode"
```
Expected: FAIL (`setSelectionMode is not a function`).

- [ ] **Step 3: Implement types/store**

In `types.ts`:

```ts
export type CanvasSelectionMode = 'body' | 'face' | 'edge';

export interface CanvasSelection {
  kind: CanvasSelectionKind;
  id: string;
  label?: string;
  featureType?: string;
  /** face/edge 必填：所属 BodySolid 元素 id（=getBodies.bodyKey）。 */
  ownerBodyKey?: string;
  /** face/edge 持久拓扑 id（edge=ref.edge；face=resolveFaceRef.ref）。 */
  topologyId?: LubanTopologyId;
}
```

Add `import type { LubanTopologyId } ...` from `@luban-cad/shared`. Add to
`PartStudioCanvasState`:

```ts
selectionMode: CanvasSelectionMode;
```

Add to `PartStudioActions`:

```ts
setSelectionMode: (mode: CanvasSelectionMode) => void;
```

In store:
```ts
const initialCanvas: PartStudioCanvasState = {
  selection: [],
  hiddenIds: [],
  selectionMode: 'body',
};
```
Add to `createCanvasSlice` return type and object:
```ts
setSelectionMode: (mode) => {
  const canvas = get().canvas;
  if (canvas.selectionMode === mode) return;
  set({ canvas: { ...canvas, selectionMode: mode, selection: [] } });
},
```
Return type `Pick<PartStudioActions, 'setCanvasSelection' | 'hideNodes' | 'showNodes' | 'setSelectionMode'>`.

- [ ] **Step 4: Write failing bridge gate/key tests**

Update `test/useCanvasBodySelection.test.ts` helper to accept `enabled` (keep
existing helper names):

```ts
interface HookProps {
  connection: MockConnection | undefined;
  bodies: readonly BodyInfo[] | undefined;
  enabled: boolean;
}

function renderBodySelection(
  connection: MockConnection | undefined,
  bodies: readonly BodyInfo[] | undefined,
  enabled = true,
) {
  return renderHook(
    ({ connection: c, bodies: b, enabled: e }: HookProps) =>
      useCanvasBodySelection(asConnection(c), b, e),
    { initialProps: { connection, bodies, enabled } satisfies HookProps },
  );
}
```

Update `beforeEach` canvas reset to include `selectionMode: 'body'`. Add:

```ts
it('enabled=false 退订且不写 store；重新启用同步当前 elements', () => {
  const connection = makeConnection(['0x201']);
  const { rerender } = renderBodySelection(connection, BODIES, true);
  expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);

  usePartStudioStore.getState().setCanvasSelection([]);
  rerender({ connection, bodies: BODIES, enabled: false });
  expect(connection.selectionSet.listenerCount()).toBe(0);
  act(() => connection.selectionSet.replace(['0x202']));
  expect(currentSelection()).toEqual([]);

  rerender({ connection, bodies: BODIES, enabled: true });
  expect(connection.selectionSet.listenerCount()).toBe(1);
  expect(currentSelection()).toEqual([{ kind: 'part', id: '0x202', label: 'Body 2' }]);
});

it('canvasSelectionKey 区分 owner/topology（同 id 不误判相等）', () => {
  const a: CanvasSelection = {
    kind: 'face', id: 'face:1:3', ownerBodyKey: '0x15',
    topologyId: { nodeId: 1, entityId: 3 },
  };
  const b: CanvasSelection = {
    kind: 'face', id: 'face:1:3', ownerBodyKey: '0x16',
    topologyId: { nodeId: 1, entityId: 3 },
  };
  const c: CanvasSelection = {
    kind: 'face', id: 'face:1:3', ownerBodyKey: '0x15',
    topologyId: { nodeId: 1, entityId: 4 },
  };
  expect(canvasSelectionKey([a])).not.toBe(canvasSelectionKey([b]));
  expect(canvasSelectionKey([a])).not.toBe(canvasSelectionKey([c]));
});
```

Import `canvasSelectionKey` and `CanvasSelection` in the test.

- [ ] **Step 5: Implement gate/key + Page wiring**

In `useCanvasBodySelection.ts`:
```ts
/**
 * 稳定 key：kind+id+label+ownerBodyKey+topology 六元组。子实体选择虽不经
 * 本桥写入，但 store 可能由工具写入 face/edge；未来若复用等值守卫，必须
 * 保证同 id 不同 owner/topology 不被误判。
 */
export function canvasSelectionKey(selection: readonly CanvasSelection[]): string {
  return JSON.stringify(selection.map((entry) => [
    entry.kind,
    entry.id,
    entry.label ?? null,
    entry.ownerBodyKey ?? null,
    entry.topologyId?.nodeId ?? null,
    entry.topologyId?.entityId ?? null,
  ]));
}
```
Replace the existing private `selectionKey` calls with `canvasSelectionKey` and add
`enabled = true` to the hook signature:
```ts
export function useCanvasBodySelection(
  connection: BriefcaseConnection | undefined,
  bodies: readonly BodyInfo[] | undefined,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !connection || bodies === undefined) return;
    // ...existing sync/listener body unchanged...
  }, [connection, bodies, enabled]);
}
```
In `PartStudioPage.tsx` (PartStudioSession), subscribe to mode and pass it:
```ts
const selectionMode = usePartStudioStore((s) => s.canvas.selectionMode);
useCanvasBodySelection(
  connection ?? undefined,
  featureSystem.bodiesLoaded ? featureSystem.bodies : undefined,
  selectionMode === 'body',
);
```
Keep the hook mounted exactly once.

- [ ] **Step 6: Update all test canvas resets**

Because `PartStudioCanvasState` now requires `selectionMode`, change every test
reset object from
```ts
canvas: { selection: [], hiddenIds: [] },
```
to
```ts
canvas: { selection: [], hiddenIds: [], selectionMode: 'body' },
```
in the ten test files listed above. Do not change production call sites.

- [ ] **Step 7: Run tests + tsc + lint**

```bash
cd luban-cad/apps/web
CI=true corepack pnpm@10 exec vitest run src/modules/part-studio/test/use-part-studio-store.test.ts src/modules/part-studio/test/useCanvasBodySelection.test.ts
CI=true corepack pnpm@10 exec tsc --noEmit
CI=true corepack pnpm@10 lint
```
Expected: PASS / exit 0.

- [ ] **Step 8: Commit**

```bash
git add luban-cad/apps/web/src/modules/part-studio/types.ts \
  luban-cad/apps/web/src/modules/part-studio/stores/use-part-studio-store.ts \
  luban-cad/apps/web/src/modules/part-studio/hooks/useCanvasBodySelection.ts \
  luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx \
  luban-cad/apps/web/src/modules/part-studio/test
git commit -m "feat(web): M-A5.2 选择模式状态 + body 桥门控"
```

---

### Task 2: SubEntitySelectTool（面/边拾取 + 持久 ref）

**Files:**
- Create: `luban-cad/apps/web/src/modules/part-studio/tools/modeling/SubEntitySelectTool.ts`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/SubEntitySelectTool.test.ts`
- Modify: `luban-cad/apps/web/src/common/i18n/locales/zh-CN/part-studio.json`
- Modify: `luban-cad/apps/web/src/common/i18n/locales/en/part-studio.json`

**Interfaces:**
- Consumes: `CanvasSelection`, `CanvasSelectionMode`, `LubanTopologyId`,
  `resolveFaceRef`, `resolveEdgeRef`.
- Produces:
  ```ts
  export interface SubEntitySelectOptions {
    kind: 'face' | 'edge';
    connectionKey: string;
    onPicked?: (selection: CanvasSelection) => void;
    onError?: (message: string) => void;
    onEnded?: () => void;
  }
  export class SubEntitySelectTool extends LocateSubEntityTool {
    static toolId: 'LubanCAD.SelectSubEntity';
  }
  export function startSubEntitySelect(
    options: SubEntitySelectOptions,
  ): Promise<SubEntitySelectTool | undefined>;
  ```

- [ ] **Step 1: Write failing tool tests**

Create `SubEntitySelectTool.test.ts` using the exact mock style from
`test/FilletEdgePickTool.test.ts` (`vi.hoisted` RPC + `vi.mock('@luban-cad/shared')`
+ subclass widening protected members):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureRpc = vi.hoisted(() => ({
  resolveFaceRef: vi.fn(),
  resolveEdgeRef: vi.fn(),
}));

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: { getClient: () => featureRpc },
}));

import { EventHandled } from '@itwin/core-frontend';
import { SubEntityType } from '@itwin/editor-common';
import type { SubEntityLocationProps } from '@itwin/editor-common';
import { SubEntitySelectTool } from '../tools/modeling/SubEntitySelectTool.js';

const faceProps = { subEntity: { type: SubEntityType.Face, id: 7 } } as SubEntityLocationProps;
const edgeProps = { subEntity: { type: SubEntityType.Edge, id: 9 } } as SubEntityLocationProps;

class TestableTool extends SubEntitySelectTool {
  public callAdd(id: string, props: SubEntityLocationProps) { return this.addSubEntity(id, props); }
  public callWant(type: SubEntityType) { return this.wantSubEntityType(type); }
  public callRequired() { return this.requiredSubEntityCount; }
  public callCacheFilter() { return this.geometryCacheFilter; }
  public callNotifyEnded() { return this.notifyEnded(); }
  public callReset() { return this.onResetButtonUp({} as never); }
}

function makeTool(kind: 'face' | 'edge') {
  const picked: unknown[] = [];
  const errors: string[] = [];
  let ended = 0;
  const tool = new TestableTool({
    kind,
    connectionKey: 'model-key',
    onPicked: (selection) => picked.push(selection),
    onError: (message) => errors.push(message),
    onEnded: () => { ended += 1; },
  });
  return { tool, picked, errors, getEnded: () => ended };
}

beforeEach(() => {
  featureRpc.resolveFaceRef.mockReset();
  featureRpc.resolveEdgeRef.mockReset();
});

describe('SubEntitySelectTool 拾取形态', () => {
  it('toolId/namespace；面只认 Face，边只认 Edge；多选累积', () => {
    const face = makeTool('face').tool;
    const edge = makeTool('edge').tool;
    expect(SubEntitySelectTool.toolId).toBe('LubanCAD.SelectSubEntity');
    expect(SubEntitySelectTool.namespace).toBe('LubanCad');
    expect(face.callWant(SubEntityType.Face)).toBe(true);
    expect(face.callWant(SubEntityType.Edge)).toBe(false);
    expect(edge.callWant(SubEntityType.Edge)).toBe(true);
    expect(face.callRequired()).toBe(Number.POSITIVE_INFINITY);
    expect(face.callCacheFilter()).toEqual({ parts: true, curves: false, surfaces: true, solids: true, other: false });
  });

  it('face resolve 成功 → owner/topology/stable id', async () => {
    featureRpc.resolveFaceRef.mockResolvedValue({ ok: true, ref: { nodeId: 1, entityId: 3 } });
    const { tool, picked } = makeTool('face');
    await tool.callAdd('0x15', faceProps);
    expect(featureRpc.resolveFaceRef).toHaveBeenCalledWith('model-key', '0x15', 7);
    expect(picked).toEqual([{
      kind: 'face', id: 'face:1:3', ownerBodyKey: '0x15',
      topologyId: { nodeId: 1, entityId: 3 }, label: expect.any(String),
    }]);
  });

  it('edge resolve 成功 → ref.edge 持久 id', async () => {
    featureRpc.resolveEdgeRef.mockResolvedValue({ ok: true, ref: { edge: { nodeId: 2, entityId: 5 } } });
    const { tool, picked } = makeTool('edge');
    await tool.callAdd('0x18', edgeProps);
    expect(featureRpc.resolveEdgeRef).toHaveBeenCalledWith('model-key', '0x18', 9);
    expect(picked).toEqual([{
      kind: 'edge', id: 'edge:2:5', ownerBodyKey: '0x18',
      topologyId: { nodeId: 2, entityId: 5 }, label: expect.any(String),
    }]);
  });

  it('resolve 失败 → onError + removeSubEntity；RPC 异常同面', async () => {
    featureRpc.resolveFaceRef.mockResolvedValue({ ok: false, error: 'bad face' });
    const { tool, picked, errors } = makeTool('face');
    const remove = vi.spyOn(tool as any, 'removeSubEntity').mockResolvedValue(undefined);
    await tool.callAdd('0x15', faceProps);
    expect(errors).toEqual(['bad face']);
    expect(remove).toHaveBeenCalled();
    expect(picked).toEqual([]);

    featureRpc.resolveFaceRef.mockRejectedValue(new Error('连接断开'));
    await tool.callAdd('0x15', faceProps);
    expect(errors).toEqual(['bad face', '连接断开']);
  });

  it('右键不退出（EventHandled.Yes）；notifyEnded 回调 onEnded', () => {
    const { tool, getEnded } = makeTool('face');
    const exit = vi.spyOn(tool as any, 'exitTool').mockResolvedValue(undefined);
    return tool.callReset().then((handled) => {
      expect(handled).toBe(EventHandled.Yes);
      expect(exit).not.toHaveBeenCalled();
      tool.callNotifyEnded();
      expect(getEnded()).toBe(1);
    });
  });
});
```

The base class is `@itwin/editor-frontend` (自研包) and `EventHandled`/`SubEntityType`
imports match `FilletEdgePickTool.ts`. The test exercises `notifyEnded` directly
(the real `onCleanup` also calls `super.onCleanup()`, which needs a true viewport);
true-stack lifecycle coverage is Task 6. Do not weaken face/edge resolve assertions.

- [ ] **Step 2: Run test to verify it fails**

```bash
CI=true corepack pnpm@10 exec vitest run src/modules/part-studio/test/SubEntitySelectTool.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement tool**

Create `SubEntitySelectTool.ts`:

```ts
/**
 * 面/边选择工具（B6 M-A5.2）：显式选择模式下的子实体拾取。
 * 复用 LocateSubEntityTool 的元素几何缓存/拾取链/装饰；拾得后立即把会话级
 * cache id 换成持久拓扑 id（resolveFaceRef/resolveEdgeRef），工具清理后仍可寻址。
 * 边仅接受 resolveEdgeRef 放行的流形边；边界/非流形边原样透出后端错误。
 * 右键不退出（CanvasContextMenu 用）；Esc/宿主 stop 才结束。
 */
import { EventHandled, IModelApp } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import { SubEntityType } from '@itwin/editor-common';
import type { ElementGeometryCacheFilter, SubEntityLocationProps } from '@itwin/editor-common';
import { LocateSubEntityTool } from '@itwin/editor-frontend';
import i18next from 'i18next';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import type { CanvasSelection, CanvasSelectionMode } from '../../types.js';

export interface SubEntitySelectOptions {
  kind: Extract<CanvasSelectionMode, 'face' | 'edge'>;
  connectionKey: string;
  onPicked?: (selection: CanvasSelection) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
}

export class SubEntitySelectTool extends LocateSubEntityTool {
  public static override toolId = 'LubanCAD.SelectSubEntity';
  public static override namespace = 'LubanCad';
  private readonly _options: SubEntitySelectOptions;

  public constructor(options: SubEntitySelectOptions) {
    super();
    this._options = options;
  }

  public override requireWriteableTarget(): boolean { return false; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, false);
    IModelApp.notifications.outputPrompt(i18next.t('partStudio.subEntitySelect.prompt'));
  }

  protected override wantSubEntityType(type: SubEntityType): boolean {
    return this._options.kind === 'face'
      ? SubEntityType.Face === type
      : SubEntityType.Edge === type;
  }

  protected override get geometryCacheFilter(): ElementGeometryCacheFilter | undefined {
    return { parts: true, curves: false, surfaces: true, solids: true, other: false };
  }

  protected override get requiredSubEntityCount(): number {
    return Number.POSITIVE_INFINITY;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    // 右键保留工具与子实体装饰，CanvasContextMenu 由宿主 onContextMenu 打开。
    return EventHandled.Yes;
  }

  protected override async addSubEntity(id: string, props: SubEntityLocationProps): Promise<void> {
    await super.addSubEntity(id, props);
    const selection = await this.resolvePicked(id, props.subEntity.id);
    if (undefined === selection) {
      await this.removeSubEntity(id, props);
      return;
    }
    this._options.onPicked?.(selection);
  }

  protected async resolvePicked(ownerBodyKey: string, cacheId: number): Promise<CanvasSelection | undefined> {
    const fallback = i18next.t('partStudio.subEntitySelect.resolveFailed');
    try {
      if (this._options.kind === 'face') {
        const result = await LubanFeatureRpcInterface.getClient().resolveFaceRef(
          this._options.connectionKey, ownerBodyKey, cacheId);
        if (!result.ok || !result.ref) {
          this._options.onError?.(result.error ?? fallback);
          return undefined;
        }
        return {
          kind: 'face', id: `face:${result.ref.nodeId}:${result.ref.entityId}`,
          ownerBodyKey, topologyId: result.ref,
          label: i18next.t('partStudio.subEntitySelect.faceLabel'),
        };
      }
      const result = await LubanFeatureRpcInterface.getClient().resolveEdgeRef(
        this._options.connectionKey, ownerBodyKey, cacheId);
      if (!result.ok || !result.ref) {
        this._options.onError?.(result.error ?? fallback);
        return undefined;
      }
      return {
        kind: 'edge', id: `edge:${result.ref.edge.nodeId}:${result.ref.edge.entityId}`,
        ownerBodyKey, topologyId: result.ref.edge,
        label: i18next.t('partStudio.subEntitySelect.edgeLabel'),
      };
    } catch (err) {
      this._options.onError?.(err instanceof Error ? err.message : fallback);
      return undefined;
    }
  }

  /** 工具结束回调（测试可经子类拓宽触达；onCleanup 是唯一生产调用点）。 */
  protected notifyEnded(): void {
    this._options.onEnded?.();
  }

  public override async onCleanup(): Promise<void> {
    await super.onCleanup();
    this.notifyEnded();
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SubEntitySelectTool(this._options);
    if (!(await tool.run())) await this.exitTool();
  }
}

export async function startSubEntitySelect(
  options: SubEntitySelectOptions,
): Promise<SubEntitySelectTool | undefined> {
  const tool = new SubEntitySelectTool(options);
  return (await tool.run()) ? tool : undefined;
}
```

Add i18n keys under `partStudio.subEntitySelect` (zh/en):
```json
"prompt": "拾取面/边（Esc 退出）",
"resolveFailed": "无法解析所选面/边",
"faceLabel": "面",
"edgeLabel": "边"
```
Use the exact existing key nesting (`partStudio` is the namespace root, so the
zh file gets `"subEntitySelect": {...}` beside `"filletPick"`).

- [ ] **Step 4: Run test to verify it passes**

```bash
CI=true corepack pnpm@10 exec vitest run src/modules/part-studio/test/SubEntitySelectTool.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add luban-cad/apps/web/src/modules/part-studio/tools/modeling/SubEntitySelectTool.ts \
  luban-cad/apps/web/src/modules/part-studio/test/SubEntitySelectTool.test.ts \
  luban-cad/apps/web/src/common/i18n/locales/zh-CN/part-studio.json \
  luban-cad/apps/web/src/common/i18n/locales/en/part-studio.json
git commit -m "feat(web): M-A5.2 面/边子实体拾取工具"
```

---

### Task 3: 模式生命周期 hook

**Files:**
- Create: `luban-cad/apps/web/src/modules/part-studio/hooks/useSubEntitySelection.ts`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/useSubEntitySelection.test.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx`

**Interfaces:**
- Consumes: `SubEntitySelectTool` / `startSubEntitySelect`.
- Produces:
  ```ts
  interface SubEntitySelectionDeps {
    startTool?: typeof startSubEntitySelect;
    toast?: (message: string) => void;
  }
  export function useSubEntitySelection(
    connection: BriefcaseConnection | undefined,
    deps?: SubEntitySelectionDeps,
  ): void;
  ```

- [ ] **Step 1: Write failing hook tests**

Create `useSubEntitySelection.test.tsx` (mock `@itwin/core-frontend` only for
notifications; inject a fake starter so no real tool/IModelApp initialization):

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: vi.fn() } },
  NotifyMessageDetails: class {},
  OutputMessagePriority: { Error: 0 },
}));

import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { useSubEntitySelection } from '../hooks/useSubEntitySelection.js';
import type { SubEntitySelectOptions } from '../tools/modeling/SubEntitySelectTool.js';

type FakeTool = { exitTool: () => void };

function fakeStarter() {
  let options!: SubEntitySelectOptions;
  const exitTool = vi.fn();
  const startTool = vi.fn(async (o: SubEntitySelectOptions): Promise<FakeTool> => {
    options = o;
    return { exitTool };
  });
  return { startTool, exitTool, options: () => options };
}

function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [], selectionMode: 'body' },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    dialog: { active: null },
  });
}

beforeEach(resetStore);

describe('useSubEntitySelection', () => {
  it('进入 face 启动工具；onPicked 追加去重；onEnded 回 body 并清空', async () => {
    usePartStudioStore.getState().setSelectionMode('face');
    const fake = fakeStarter();
    const toast = vi.fn();
    const { unmount } = renderHook(() =>
      useSubEntitySelection({ key: 'k' } as never, { startTool: fake.startTool, toast }));
    await waitFor(() => expect(fake.startTool).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'face', connectionKey: 'k' })));
    const selection = {
      kind: 'face' as const, id: 'face:1:3', ownerBodyKey: '0x15',
      topologyId: { nodeId: 1, entityId: 3 }, label: '面',
    };
    act(() => fake.options().onPicked?.(selection));
    act(() => fake.options().onPicked?.(selection));
    expect(usePartStudioStore.getState().canvas.selection).toEqual([selection]);
    act(() => fake.options().onEnded?.());
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
    unmount();
  });

  it('dialog.active 时不启动；打开 dialog 会停止当前工具并回 body', async () => {
    const fake = fakeStarter();
    usePartStudioStore.getState().setSelectionMode('edge');
    const { rerender } = renderHook(() =>
      useSubEntitySelection({ key: 'k' } as never, { startTool: fake.startTool }));
    await waitFor(() => expect(fake.startTool).toHaveBeenCalledTimes(1));
    act(() => usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' }));
    rerender();
    await waitFor(() => expect(fake.exitTool).toHaveBeenCalled());
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');
  });

  it('切回 body/卸载 退出活动工具；连接切换回 body；启动失败回 body 并 toast', async () => {
    const fake = fakeStarter();
    usePartStudioStore.getState().setSelectionMode('face');
    const { unmount, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useSubEntitySelection({ key } as never, { startTool: fake.startTool }),
      { initialProps: { key: 'k1' } },
    );
    await waitFor(() => expect(fake.startTool).toHaveBeenCalledTimes(1));
    rerender({ key: 'k2' });
    await waitFor(() => expect(fake.exitTool).toHaveBeenCalledTimes(1));
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');

    act(() => usePartStudioStore.getState().setSelectionMode('edge'));
    await waitFor(() => expect(fake.startTool).toHaveBeenCalledTimes(2));
    unmount();
    await waitFor(() => expect(fake.exitTool).toHaveBeenCalledTimes(2));
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');

    const fail = vi.fn(async () => { throw new Error('启动失败'); });
    const toast = vi.fn();
    usePartStudioStore.getState().setSelectionMode('face');
    renderHook(() => useSubEntitySelection({ key: 'k' } as never, { startTool: fail, toast }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('启动失败'));
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
CI=true corepack pnpm@10 exec vitest run src/modules/part-studio/test/useSubEntitySelection.test.tsx
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement hook**

```ts
import React, { useEffect } from 'react';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { startSubEntitySelect } from '../tools/modeling/SubEntitySelectTool.js';
import type { SubEntitySelectOptions } from '../tools/modeling/SubEntitySelectTool.js';

/** 模块级稳定默认 toast——不得在渲染体内新建函数（会重触发 effect）。 */
function notifyError(message: string): void {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(OutputMessagePriority.Error, message),
  );
}

export interface SubEntitySelectionDeps {
  startTool?: (options: SubEntitySelectOptions) => Promise<{ exitTool: () => void } | undefined>;
  toast?: (message: string) => void;
}

export function useSubEntitySelection(
  connection: BriefcaseConnection | undefined,
  deps: SubEntitySelectionDeps = {},
): void {
  const mode = usePartStudioStore((s) => s.canvas.selectionMode);
  const dialogActive = usePartStudioStore((s) => s.dialog.active !== null);
  const startTool = deps.startTool ?? startSubEntitySelect;
  const toast = deps.toast ?? notifyError;

  // 防御：对话框打开时不允许停留子实体模式（模式按钮同时禁用）。
  useEffect(() => {
    if (dialogActive && mode !== 'body')
      usePartStudioStore.getState().setSelectionMode('body');
  }, [dialogActive, mode]);

  // 连接切换：停止当前工具并回 body（选择清空；不自动重启）。本 effect 必须
  // 声明在主启动 effect 之前，保证同一 commit 内先把模式归零；主 effect 还持有
  // store 现态守卫，避免用旧闭包 mode 启动工具。
  const connectionKey = connection?.key;
  const previousConnectionKey = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    const store = usePartStudioStore.getState();
    if (previousConnectionKey.current !== undefined
      && previousConnectionKey.current !== connectionKey
      && store.canvas.selectionMode !== 'body') {
      store.setSelectionMode('body');
    }
    previousConnectionKey.current = connectionKey;
    return () => {
      if (connectionKey === undefined) return;
      const current = usePartStudioStore.getState();
      if (current.canvas.selectionMode !== 'body') current.setSelectionMode('body');
    };
  }, [connectionKey]);

  useEffect(() => {
    if (mode === 'body' || !connection || dialogActive) return;
    const currentMode = usePartStudioStore.getState().canvas.selectionMode;
    if (currentMode !== mode || currentMode === 'body') return;
    let disposed = false;
    const activeKind = currentMode;
    const toolPromise = startTool({
      kind: activeKind,
      connectionKey: connection.key,
      onPicked: (selection) => {
        const store = usePartStudioStore.getState();
        if (store.canvas.selectionMode !== activeKind) return;
        if (store.canvas.selection.some((entry) => entry.id === selection.id)) return;
        store.setCanvasSelection([...store.canvas.selection, selection]);
      },
      onError: toast,
      onEnded: () => {
        if (disposed) return;
        const store = usePartStudioStore.getState();
        if (store.canvas.selectionMode === activeKind) store.setSelectionMode('body');
      },
    });
    toolPromise.catch((err: unknown) => {
      if (disposed) return;
      toast(err instanceof Error ? err.message : String(err));
      const store = usePartStudioStore.getState();
      if (store.canvas.selectionMode === activeKind) store.setSelectionMode('body');
    });
    return () => {
      disposed = true;
      void toolPromise.then((tool) => tool?.exitTool()).catch(() => undefined);
    };
  }, [connection, mode, dialogActive, startTool, toast]);
}
```

- [ ] **Step 4: Mount in PartStudioSession**

In `PartStudioPage.tsx`, immediately after the `useCanvasBodySelection(...)` call:
```ts
useSubEntitySelection(connection ?? undefined);
```
Add the import from `./hooks/useSubEntitySelection.js`. One mount only.

- [ ] **Step 5: Run tests + tsc/lint**

```bash
CI=true corepack pnpm@10 exec vitest run src/modules/part-studio/test/useSubEntitySelection.test.tsx
CI=true corepack pnpm@10 exec tsc --noEmit
CI=true corepack pnpm@10 lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add luban-cad/apps/web/src/modules/part-studio/hooks/useSubEntitySelection.ts \
  luban-cad/apps/web/src/modules/part-studio/test/useSubEntitySelection.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx
git commit -m "feat(web): M-A5.2 子实体选择模式生命周期"
```

---

### Task 4: Ribbon「选择」模式按钮 + i18n

**Files:**
- Modify: `luban-cad/apps/web/src/modules/part-studio/ribbon/ribbon-registry.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/ribbon/Ribbon.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts`
- Modify: i18n zh/en `part-studio.json`
- Modify: `luban-cad/apps/web/src/common/i18n/test/i18n.test.ts`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/ribbon-registry.test.ts`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/Ribbon.test.tsx`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/CommandPalette.test.tsx`

**Interfaces:**
- Produces: `RibbonGroup` 增加 `'selection'`；`RIBBON_TOOLS` 增加
  `{ id:'selectFace', capability:'selection', group:'selection' }` 与
  `{ id:'selectEdge', ... }`；点击 toggle `canvas.selectionMode`。
  `RibbonToolButton` 增加 `disabled?: boolean`。

- [ ] **Step 1: Write failing Ribbon test**

Add `canvas: { selection: [], hiddenIds: [], selectionMode: 'body' }` to
`Ribbon.test.tsx`'s `resetStore`, then add:

```tsx
it('M-A5.2：选择面/边 toggle selectionMode；同钮再点回 body；dialog 打开时禁用', async () => {
  const user = userEvent.setup();
  render(<Ribbon />);
  const face = screen.getByRole('button', { name: '选择面' });
  await user.click(face);
  expect(usePartStudioStore.getState().canvas.selectionMode).toBe('face');
  expect(face.getAttribute('aria-pressed')).toBe('true');
  await user.click(face);
  expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');

  act(() => usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' }));
  expect(screen.getByRole('button', { name: '选择面' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '选择边' })).toBeDisabled();
});
```
Import `act` if not already imported.

- [ ] **Step 2: Run test to verify it fails**

```bash
CI=true corepack pnpm@10 exec vitest run src/modules/part-studio/test/Ribbon.test.tsx -t "选择面"
```
Expected: FAIL (button not found).

- [ ] **Step 3: Add registry/capability entries**

In `ribbon-registry.ts`:
- Add `'selection'` as the **first** member of `RibbonGroup` and
  `RIBBON_GROUP_ORDER` (selection tools precede sketch).
- Add two tools at the top of `RIBBON_TOOLS`:
```ts
{
  id: 'selectFace',
  icon: SvgCursor,
  labelKey: 'partStudio.ribbon.tools.selectFace.label',
  capability: 'selection',
  group: 'selection',
},
{
  id: 'selectEdge',
  icon: SvgSelection,
  labelKey: 'partStudio.ribbon.tools.selectEdge.label',
  capability: 'selection',
  group: 'selection',
},
```
- Import `SvgCursor, SvgSelection` from `@itwin/itwinui-icons-react`. Keep the
  existing homemade icons untouched.
- In `internal/capabilities.ts` add `selection: 'full'` to `TOOL_CAPABILITIES`
  (full no-op probe; `isGated('selection')===false`).
- Update the registry header comment count 27 → 29 and command count 71 → 73.

- [ ] **Step 4: Route clicks + disabled state in Ribbon**

In `useToolActivation.activate`, before `findRibbonCommand`:
```ts
if (id === 'selectFace' || id === 'selectEdge') {
  const mode = id === 'selectFace' ? 'face' : 'edge';
  const store = usePartStudioStore.getState();
  store.setSelectionMode(store.canvas.selectionMode === mode ? 'body' : mode);
  return;
}
```
Add `setSelectionMode` to the `usePartStudioStore` selectors/callback if desired;
`getState()` is sufficient and keeps the callback stable.

Extend `RibbonToolButton`:
```tsx
function RibbonToolButton({ tool, onActivate, active, highlighted, disabled = false }: {
  tool: RibbonButtonModel;
  onActivate: (id: string) => void;
  active: boolean;
  highlighted: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  // ...
  <IconButton ... aria-pressed={active} disabled={disabled} ...>
```
In `Ribbon`, add:
```ts
const selectionMode = usePartStudioStore((s) => s.canvas.selectionMode);
const dialogActive = usePartStudioStore((s) => s.dialog.active !== null);
const isSelectionTool = (id: string): boolean => id === 'selectFace' || id === 'selectEdge';
const selectionActive = (id: string): boolean =>
  id === 'selectFace' ? selectionMode === 'face'
    : id === 'selectEdge' ? selectionMode === 'edge'
      : false;
```
For every `RibbonToolButton` call (both sketch and feature branches), pass:
```tsx
active={isSelectionTool(tool.id) ? selectionActive(tool.id) : activeToolId === tool.id}
disabled={isSelectionTool(tool.id) && dialogActive}
```
The sketch branch never has these ids, so the expression is harmless; use the
same expression for feature branch. `RibbonDropdown` is unaffected.

- [ ] **Step 5: Add i18n + required keys**

zh-CN:
```json
"selection": "选择"
```
inside `ribbon.groups`; inside `ribbon.tools`:
```json
"selectFace": { "label": "选择面" },
"selectEdge": { "label": "选择边" }
```
Add the same shape to en. Add to `REQUIRED_PART_STUDIO_KEYS`:
```ts
'ribbon.groups.selection', 'ribbon.tools.selectFace.label', 'ribbon.tools.selectEdge.label',
```
Also add `subEntitySelect.prompt/resolveFailed/faceLabel/edgeLabel` to the
required list (Task 2 keys are consumed at runtime).

- [ ] **Step 6: Update registry/structure tests**

In `ribbon-registry.test.ts`:
- `EXPECTED_TOOL_IDS`: prepend `'selectFace'`, `'selectEdge'`.
- `EXPECTED_GROUP_ORDER`: prepend `'selection'`.
- length assertions: `RIBBON_TOOLS` 29; `allRibbonCommands()` 73.
- comments 27→29 / 71→73.
- `RIBBON_TOOLS[RIBBON_TOOLS.length - 1]!.group` remains `'surfaceCurve'`.

In `CommandPalette.test.tsx`: update the button count from 36 to 38
(29 tools + 8 dropdown arrows + 1 search) and the comment.

- [ ] **Step 7: Run tests/tsc/lint + commit**

```bash
CI=true corepack pnpm@10 exec vitest run \
  src/modules/part-studio/test/Ribbon.test.tsx \
  src/modules/part-studio/test/ribbon-registry.test.ts \
  src/modules/part-studio/test/CommandPalette.test.tsx \
  src/modules/part-studio/test/capabilities.test.ts \
  src/common/i18n/test/i18n.test.ts
CI=true corepack pnpm@10 exec tsc --noEmit
CI=true corepack pnpm@10 lint
git add ... && git commit -m "feat(web): M-A5.2 选择面/边 ribbon 模式"
```

---

### Task 5: owner-aware 右键菜单与宿主动作

**Files:**
- Modify: `luban-cad/apps/web/src/modules/part-studio/canvas/CanvasContextMenu.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/components/PartStudioCanvas.tsx`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/CanvasContextMenu.test.tsx`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/PartStudioCanvas.test.tsx`
- Test: i18n keys + required list (same files as Task 4)

**Interfaces:**
- Consumes: `CanvasSelection.ownerBodyKey`, `setSelectionMode`.
- Produces:
  ```ts
  interface CanvasMenuItem {
    id: string; labelKey: string; usesName: boolean; icon: React.ComponentType;
    action: CanvasMenuAction; capability?: string;
    disabled?: boolean; disabledReasonKey?: string;
  }
  type CanvasMenuAction = ... | { kind: 'select-owner'; bodyKey?: string };
  interface CanvasContextMenuProps {
    onSelectOwner?: (bodyKey: string) => void;
    // anchor/onClose/onDelete/canEdit unchanged
  }
  ```

- [ ] **Step 1: Write failing menu tests**

First extend the existing `renderMenu` helper in `CanvasContextMenu.test.tsx` so
the owner callback can be injected:
```tsx
function renderMenu(
  onClose = vi.fn(),
  onDelete = vi.fn(),
  onSelectOwner?: (bodyKey: string) => void,
): ReturnType<typeof render> {
  return render(
    <CanvasContextMenu
      anchor={ANCHOR}
      onClose={onClose}
      onDelete={onDelete}
      onSelectOwner={onSelectOwner}
    />,
  );
}
```
Add the new tests:

```tsx
it('face 菜单：隐藏所属实体/选中所属实体，删除禁用', () => {
  const menu = buildCanvasMenu([
    { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18', topologyId: { nodeId: 1, entityId: 3 } },
  ]);
  const items = menu.filter((entry): entry is CanvasMenuItem => entry !== 'separator');
  expect(items.map((entry) => entry.id)).toEqual([
    'hide', 'zoom-to-fit', 'view-normal-to', 'select-owner', 'appearance-for-face', 'delete',
  ]);
  expect(items[0]!.labelKey).toBe('partStudio.canvasMenu.hideOwner');
  expect(items.find((entry) => entry.id === 'select-owner')!.action).toEqual({
    kind: 'select-owner', bodyKey: '0x18',
  });
  expect(items.find((entry) => entry.id === 'delete')).toMatchObject({
    disabled: true,
    disabledReasonKey: 'partStudio.canvasMenu.faceEdgeDeleteUnsupported',
  });
});

it('face 隐藏走 owner 元素 id（不写 face id）', async () => {
  mocks.viewport = makeViewport();
  setSelection([{ kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18' }]);
  const onClose = vi.fn();
  render(<CanvasContextMenu anchor={ANCHOR} onClose={onClose} />);
  await userEvent.setup().click(screen.getByRole('menuitem', { name: '隐藏所属实体' }));
  expect(mocks.hideElements).toHaveBeenCalledWith(['0x18'], expect.anything(), true);
  expect(usePartStudioStore.getState().canvas.hiddenIds).toEqual(['0x18']);
});

it('select-owner 回调 primary owner；删除禁用不打开 HITL', async () => {
  const onSelectOwner = vi.fn();
  setSelection([{ kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18' }]);
  render(<CanvasContextMenu anchor={ANCHOR} onClose={vi.fn()} onSelectOwner={onSelectOwner} />);
  await userEvent.setup().click(screen.getByRole('menuitem', { name: '选中所属实体' }));
  expect(onSelectOwner).toHaveBeenCalledWith('0x18');
  expect(screen.queryByRole('dialog')).toBeNull();
});
```
Import `CanvasMenuItem` type. The hide assertion uses the existing
`mocks.hideElements` and `makeViewport` helpers; if the existing viewport stub
does not carry a selected view, set `mocks.viewport = makeViewport()` as in the
existing hide test.

Add to `PartStudioCanvas.test.tsx` a host test through the real menu. Extend the
existing `renderCanvas` opts with `connection?: BriefcaseConnection` and use it
when provided:
```tsx
connection={
  opts?.connection
    ?? (opts?.connectionKey
      ? ({ key: opts.connectionKey } as unknown as BriefcaseConnection)
      : undefined)
}
```
Then add:
```tsx
it('选中所属实体 → body 模式 + 树选中 + SelectionSet.replace(owner)', async () => {
  const user = userEvent.setup();
  const selectionSet = { replace: vi.fn() };
  renderCanvas(undefined, {
    connection: { key: 'k', selectionSet } as unknown as BriefcaseConnection,
  });
  act(() => {
    usePartStudioStore.getState().setSelectionMode('face');
    usePartStudioStore.getState().setCanvasSelection([
      { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18' },
    ]);
  });
  fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), {
    clientX: 60, clientY: 70,
  });
  const menu = screen.getByRole('menu', { name: '画布菜单' });
  await user.click(within(menu).getByRole('menuitem', { name: '选中所属实体' }));
  expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');
  expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['0x18']);
  expect(selectionSet.replace).toHaveBeenCalledWith(['0x18']);
});
```
The host callback is reached only through the menu (`onSelectOwner` prop); do not
reach into React internals.

- [ ] **Step 2: Update existing menu expectations (same task)**

The old face/edge tests encode the pre-M-A5.2 menu. Update them in the same
commit:
- face `buildCanvasMenu` ids become
  `['hide', 'zoom-to-fit', 'view-normal-to', 'select-owner', 'appearance-for-face', 'delete']`;
  replace the old face HITL assertion with `expect(deleteItem).toBeDisabled()`
  and `expect(screen.queryByRole('dialog')).toBeNull()`.
- split the edge/vertex loop: edge gets
  `['hide', 'zoom-to-fit', 'view-normal-to', 'select-owner', 'delete']` and a
  disabled-delete assertion; vertex keeps the old four-item list.
- Move the two HITL tests (`edge 拾取：删除确认路…` and
  `真实宿主路：删除点击后宿主收合菜单…`) to `kind: 'part'` selections and
  names `删除 Part 1`; the HITL path still covers part deletion. Add one edge
  disabled-delete test instead of the old edge HITL.
- `delete` for face/edge uses `labelKey='deleteUnsupported'`, `usesName=false`,
  so its accessible name is exactly `删除` (not `删除 边 1`).

- [ ] **Step 3: Run tests to verify they fail**

```bash
CI=true corepack pnpm@10 exec vitest run \
  src/modules/part-studio/test/CanvasContextMenu.test.tsx \
  src/modules/part-studio/test/PartStudioCanvas.test.tsx
```
Expected: FAIL before implementation (menu shape/actions missing); after the
implementation steps below, PASS.

- [ ] **Step 4: Implement menu model/actions**

- Extend `CanvasMenuItem` with `disabled`/`disabledReasonKey`.
- Add `| { kind:'select-owner'; bodyKey?: string }` to `CanvasMenuAction`.
- Change the view group to parameterize the hide label and whether it uses a
  name:
```ts
function viewCommandGroup(hideLabelKey = 'hide', hideUsesName = true): CanvasMenuEntry[] {
  return [
    item('hide', hideLabelKey, SvgVisibilityHide, { kind: 'hide' }, hideUsesName),
    item('zoom-to-fit', 'zoomToFit', SvgWindowZoomIn, { kind: 'zoom-to-fit' }),
    item('view-normal-to', 'viewNormalTo', SvgObjectRotate, { kind: 'view-normal-to' }),
  ];
}
```
- Face branch:
```ts
const owner = primary.ownerBodyKey;
return [
  ...viewCommandGroup('hideOwner', false),
  'separator',
  {
    ...item('select-owner', 'selectOwner', SvgSelection, { kind: 'select-owner', bodyKey: owner }),
    disabled: owner === undefined,
    disabledReasonKey: owner === undefined
      ? 'partStudio.canvasMenu.selectOwnerUnavailable' : undefined,
  },
  'separator',
  item('appearance-for-face', 'appearanceForFace', SvgPalette, { kind: 'appearance-for-face' }, false, 'appearance'),
  'separator',
  { ...item('delete', 'deleteUnsupported', SvgDelete, { kind: 'delete' }, false),
    disabled: true,
    disabledReasonKey: 'partStudio.canvasMenu.faceEdgeDeleteUnsupported' },
];
```
- Edge branch: same view group + select-owner + disabled delete, no appearance.
- Hide handler:
```ts
case 'hide': {
  const owners = [...new Set(selection.flatMap((entry) => {
    if (entry.kind === 'face' || entry.kind === 'edge')
      return entry.ownerBodyKey ? [entry.ownerBodyKey] : [];
    return [entry.id];
  }))];
  if (owners.length === 0) return;
  runAndClose(() => {
    hideNodes(owners);
    const viewport = IModelApp.viewManager?.selectedView;
    if (viewport) {
      try {
        EmphasizeElements.getOrCreate(viewport).hideElements(owners, viewport, true);
      } catch (err) {
        console.warn('[part-studio] viewport 隐藏应用失败（无真实视口？）', err);
      }
    }
  });
  return;
}
```
- `select-owner` case:
```ts
case 'select-owner':
  if (action.bodyKey) runAndClose(() => onSelectOwner?.(action.bodyKey!));
  else onClose();
  return;
```
- Render disabled:
```tsx
const disabled = entry.disabled || (entry.action.kind === 'delete' && !canEdit);
const reason = entry.disabledReasonKey
  ? t(entry.disabledReasonKey)
  : disabled && entry.action.kind === 'delete' ? t('partStudio.canvasMenu.readonlyHint') : undefined;
<button ... disabled={disabled} title={reason} onClick={() => { if (!disabled) handleItemClick(entry); }}>
```
- `handleItemClick` first `if (menuItem.disabled) return;` and delete case keeps
  `if (!canEdit) return` guard. Add `onSelectOwner` to the `useCallback`
  dependency array.
- Add `SvgSelection` import.
- Add `onSelectOwner` prop to `CanvasContextMenuProps`.

- [ ] **Step 5: Implement host callback**

In `PartStudioCanvas` add:
```tsx
const handleSelectOwner = React.useCallback((bodyKey: string) => {
  const store = usePartStudioStore.getState();
  store.setSelectionMode('body');
  store.setSelectedNodeIds([bodyKey]);
  connection?.selectionSet?.replace([bodyKey]);
}, [connection]);
```
Pass `onSelectOwner={handleSelectOwner}` to `CanvasContextMenu`. Keep
`onDelete`/`canEdit` unchanged; face/edge delete is disabled by the menu model.

- [ ] **Step 6: Add i18n keys**

zh/en under `canvasMenu`:
```json
"hideOwner": "隐藏所属实体",
"selectOwner": "选中所属实体",
"selectOwnerUnavailable": "所属实体不可用",
"deleteUnsupported": "删除",
"faceEdgeDeleteUnsupported": "面/边删除暂不支持"
```
Add all five to `REQUIRED_PART_STUDIO_KEYS`.

- [ ] **Step 7: Run tests/tsc/lint + commit**

```bash
CI=true corepack pnpm@10 exec vitest run \
  src/modules/part-studio/test/CanvasContextMenu.test.tsx \
  src/modules/part-studio/test/PartStudioCanvas.test.tsx \
  src/modules/part-studio/test/FeatureTree.test.tsx \
  src/common/i18n/test/i18n.test.ts
CI=true corepack pnpm@10 exec tsc --noEmit
CI=true corepack pnpm@10 lint
git add ... && git commit -m "feat(web): M-A5.2 面/边 owner 菜单与安全动作"
```

---

### Task 6: 真栈 e2e + 全量门禁 + 文档

**Files:**
- Modify: `luban-cad/apps/web/e2e/newbody.spec.ts`
- Modify: `docs/superpowers/plans/2026-10-29-subentity-selection.md`（result section）
- Possibly i18n/selector fixes discovered by the true stack.

**Interfaces:** none new.

- [ ] **Step 1: Extend newbody spec**

Insert this block **after** the existing selection-bridge block (which ends with
`console.log('[newbody] selection bridge → 画布 part 菜单 OK...')`) and
**before** the tree-delete block. First move the existing iso/fit right-click
sequence and the `projected` block above the new block, and replace the local
projection with a reusable helper:

```ts
const projectPoints = async (points: Array<{ x: number; y: number; z: number }>) =>
  page.evaluate(async (worldPoints) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: { viewManager: { getFirstOpenView(): {
        worldToView(p: { x: number; y: number; z: number }): { x: number; y: number };
      } | undefined } };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('无打开视口');
    return worldPoints.map((p) => vp.worldToView(p));
  }, points);

// 等轴测 + 适应视图（确保两面/边可见）
await page.mouse.click(cx, cy + 120, { button: 'right' });
await expect(canvasMenu).toBeVisible();
await canvasMenu.getByRole('menuitem', { name: '等轴测视图' }).click();
await expect(canvasMenu).toBeHidden();
await page.mouse.click(cx, cy + 120, { button: 'right' });
await expect(canvasMenu).toBeVisible();
await canvasMenu.getByRole('menuitem', { name: '适应视图' }).click();
await expect(canvasMenu).toBeHidden();

const facePoints = await projectPoints([
  { x: 5, y: 1, z: 2 }, // body2 顶面中心
  { x: 5, y: 1, z: 0 }, // body2 底面中心（退路）
]);
const faceBtn = page.getByRole('button', { name: '选择面', exact: true });
const edgeBtn = page.getByRole('button', { name: '选择边', exact: true });
await faceBtn.click();
await expect(faceBtn).toHaveAttribute('aria-pressed', 'true');
let facePicked = false;
for (const p of facePoints) {
  if ((await faceBtn.getAttribute('aria-pressed')) !== 'true') {
    await faceBtn.click();
    await page.waitForTimeout(400);
  }
  await page.mouse.move(cb.x + p.x - 12, cb.y + p.y + 10);
  await page.waitForTimeout(150);
  await page.mouse.click(cb.x + p.x, cb.y + p.y);
  await page.waitForTimeout(500);
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  if ((await canvasMenu.getByRole('menuitem', { name: '隐藏所属实体' }).count()) > 0) {
    facePicked = true;
    break;
  }
  await page.keyboard.press('Escape');
  if ((await faceBtn.getAttribute('aria-pressed')) === 'true') await faceBtn.click();
  await expect(faceBtn).toHaveAttribute('aria-pressed', 'false');
}
expect(facePicked, '面模式应在 body2 顶/底面拾到面').toBe(true);
await expect(canvasMenu.getByRole('menuitem', { name: '选中所属实体', exact: true })).toBeVisible();
await expect(canvasMenu.getByRole('menuitem', { name: '删除', exact: true })).toBeDisabled();
await canvasMenu.getByRole('menuitem', { name: '选中所属实体', exact: true }).click();
await expect(faceBtn).toHaveAttribute('aria-pressed', 'false');
await expect(body2Row).toHaveAttribute('aria-current', 'true');
await page.evaluate(async () => {
  const cf = (await import('/@id/@itwin/core-frontend')) as {
    IModelApp: { viewManager: { getFirstOpenView(): {
      iModel: { selectionSet: { emptyAll(): void } };
    } | undefined } };
  };
  cf.IModelApp.viewManager.getFirstOpenView()?.iModel.selectionSet.emptyAll();
});
await page.waitForTimeout(150);

// 再入面模式：隐藏所属实体 → eye 恢复
await faceBtn.click();
await expect(faceBtn).toHaveAttribute('aria-pressed', 'true');
await page.mouse.click(cb.x + facePoints[0]!.x, cb.y + facePoints[0]!.y);
await page.waitForTimeout(500);
await page.mouse.click(cx, cy + 120, { button: 'right' });
await expect(canvasMenu).toBeVisible();
await canvasMenu.getByRole('menuitem', { name: '隐藏所属实体' }).click();
await expect(body2Eye).toHaveAttribute('aria-pressed', 'true');
await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).toContain(body2!.bodyKey);
await body2Eye.click();
await expect(body2Eye).toHaveAttribute('aria-pressed', 'false');

// 边模式：拾一条 body2 边；失败坐标逐点尝试；成功后 Esc 回 body
await edgeBtn.click();
await expect(edgeBtn).toHaveAttribute('aria-pressed', 'true');
const edgePoints = await projectPoints([
  { x: 6, y: 0, z: 1 }, { x: 6, y: 2, z: 1 }, { x: 4, y: 0, z: 1 },
  { x: 5, y: 0, z: 2 }, { x: 5, y: 2, z: 2 },
]);
let edgePicked = false;
for (const p of edgePoints) {
  if ((await edgeBtn.getAttribute('aria-pressed')) !== 'true') {
    await edgeBtn.click();
    await page.waitForTimeout(400);
  }
  await page.mouse.move(cb.x + p.x - 15, cb.y + p.y + 12);
  await page.waitForTimeout(120);
  await page.mouse.click(cb.x + p.x, cb.y + p.y);
  await page.waitForTimeout(500);
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  if ((await canvasMenu.getByRole('menuitem', { name: '隐藏所属实体' }).count()) > 0) {
    edgePicked = true;
    await page.keyboard.press('Escape');
    break;
  }
  await page.keyboard.press('Escape');
  if ((await edgeBtn.getAttribute('aria-pressed')) === 'true') await edgeBtn.click();
  await expect(edgeBtn).toHaveAttribute('aria-pressed', 'false');
}
expect(edgePicked, '边模式应在 body2 流形边上命中').toBe(true);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
if ((await edgeBtn.getAttribute('aria-pressed')) === 'true') await edgeBtn.click();
await expect(edgeBtn).toHaveAttribute('aria-pressed', 'false');
await expect(page.getByRole('button', { name: '选择面', exact: true })).toHaveAttribute('aria-pressed', 'false');
await page.evaluate(async () => {
  const cf = (await import('/@id/@itwin/core-frontend')) as {
    IModelApp: { viewManager: { getFirstOpenView(): {
      iModel: { selectionSet: { emptyAll(): void } };
    } | undefined } };
  };
  cf.IModelApp.viewManager.getFirstOpenView()?.iModel.selectionSet.emptyAll();
});
await page.keyboard.press('Escape');
```

The block above must leave mode `body`, selection empty, and no open menu before
the existing tree-delete/fillet flow.
Do not duplicate the later `projected` const: reuse `projectPoints` and replace
the old definition with:
```ts
const projected = await projectPoints([
  { x: 6, y: 0, z: 1 }, { x: 6, y: 2, z: 1 }, { x: 4, y: 0, z: 1 }, { x: 4, y: 2, z: 1 },
  { x: 5, y: 0, z: 2 }, { x: 5, y: 2, z: 2 }, { x: 4, y: 1, z: 2 }, { x: 6, y: 1, z: 2 },
]);
```
The first face-mode pick opens the context menu; `Escape` closes only the menu,
not the tool. Clicking `选中所属实体` closes the menu and exits the mode (host
callback), so the subsequent selection-set clear is belt-and-braces.

- [ ] **Step 2: Run targeted e2e**

```bash
cd luban-cad/apps/web
CI=true corepack pnpm@10 exec playwright test e2e/newbody.spec.ts
```
Expected: 2/2 pass. If a face/edge coordinate misses, log projected points and
try the listed fallback coordinates; do not weaken to unit-only.

- [ ] **Step 3: Full e2e with clean rate window**

Restart MS, then:
```bash
CI=true corepack pnpm@10 exec playwright test
```
Expected: 34/34. Record transient briefcase stalls and rerun targeted once.

- [ ] **Step 4: Web rebuild + verify**

```powershell
powershell -NoProfile -File scripts/rebuild-web.ps1
docker compose up -d web
powershell -NoProfile -File scripts/verify-stack.ps1
```
Expected: image revision = final web source commit; verify 17/17.

- [ ] **Step 5: Result notes + commit**

Append to this plan: commits, mode behavior, manifold-edge limitation, no
persistent overlay, e2e/verify numbers, web revision. Commit docs and any e2e
selector fixes separately.

---

## Self-Review

- Spec coverage: mode/store (T1), tool+refs (T2), lifecycle (T3), ribbon/i18n (T4),
  owner menu/actions (T5), true-stack gates (T6); performance is the separate
  `2026-10-29-multibody-perf-guard.md` plan.
- No face/edge delete or persistent overlay; delete rendered disabled; no `SelectionSet`
  writes for subentities.
- `CanvasSelection` extension defined in T1 and consumed by T2/T5; exact mode type
  and hook signatures are consistent across tasks.
- Registry count changes (29 tools / 73 commands) and i18n REQUIRED updates are
  included; no production dependencies added.
- E2E reuses newbody scratch and keeps the default suite at 34 tests.
