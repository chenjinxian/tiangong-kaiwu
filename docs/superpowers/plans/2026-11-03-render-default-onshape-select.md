# 渲染回归 iTwin 默认 + Onshape 式 hover/pick/select 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Part Studio 的材质/光照改回 iTwin.js 默认（保留白底与 BRep 全拓扑边线），并把 hover/pick/select 改为无模式的 Onshape 式“随时拾取点/边/面”。

**Architecture:** 渲染侧只重写 `render-profile.ts` 与显示设置默认值，不改 `itwinjs-core`；拾取侧新增一个继承 editor `LocateSubEntityTool` 的统一选择工具（全类型、跨 body、悬停优先级、单击替换/Ctrl 切换），注册为 `ToolAdmin` 默认工具，并通过小型命令协调器与 BRep 拓扑读面/子实体删除串行化。旧的面/边/点模式状态、右键模式菜单、ribbon 命令全部移除。

**Tech Stack:** TypeScript 5.6、React 18、iTwin.js 5.15 fork（`link:` 源码）、第一方 `@itwin/editor-frontend`、zustand、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-03-render-default-onshape-select-design.md`

## Global Constraints

- **不改 `itwinjs-core` 主仓**；只改 `luban-cad/packages/{viewer,editor}` 与 `luban-cad/apps/web`。
- 拾取必须复用 `LocateSubEntityTool` 的元素几何缓存/boresite/高亮链，禁止第二套子实体拾取 API。
- 渲染：iTwin 默认灯光与元素材质；白底 `#ffffff`；BRep 全拓扑边线默认开；AO 默认关；MSAA 4；`generateAllPolyfaceEdges=false` 保留。
- 交互：无模式切换；悬停 顶点>边>面；普通单击替换；Ctrl 切换；空白单击清除；整零件走零件列表/右键“选中所属实体”。
- 选择高亮仅空闲态保留；打开特征对话框或启动其它工具即清空。
- 每步 TDD：先写失败测试 → 跑失败 → 最小实现 → 跑通过 → 提交。
- 修改 `packages/viewer` 或 `packages/editor/frontend` 后，web dev/e2e 前先构建对应包（web 消费 `dist/lib` 产物）：
  - `cd luban-cad/packages/viewer && corepack pnpm@10 build`
  - `cd luban-cad/packages/editor/frontend && corepack pnpm@10 build`
- 所有提交只 add 本任务涉及的文件；不要提交工作区已有的大批未提交改动。

---

### Task 1: iTwin 默认渲染基线

**Files:**
- Modify: `luban-cad/packages/viewer/src/viewport/render-profile.ts`
- Modify: `luban-cad/packages/viewer/src/viewport/use-viewport.ts`
- Modify: `luban-cad/packages/viewer/src/viewport/test/render-profile.test.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/internal/display-actions.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/hooks/useDisplaySettings.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/display-actions.test.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/useDisplaySettings.test.tsx`

**Interfaces:**
- Consumes: `ScreenViewport.setLightSettings(LightSettings)`, `DisplayStyle3dSettings.environment/hiddenLineSettings`, `LightSettings.fromJSON`, `Environment.fromJSON`.
- Produces: `applyViewportRenderBaseline(viewport: ScreenViewport): void`（替换 `applyRenderProfile`）；`EDGE_COLOR`、`EDGE_WEIGHT`、`ANTIALIAS_SAMPLES` 保留；删除 `BODY_COLOR`、`LIGHTS_PROFILE`。

- [ ] **Step 1: 用新断言替换 render-profile 单测（会失败）**

将 `luban-cad/packages/viewer/src/viewport/test/render-profile.test.ts` 全量替换为：

```ts
/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 渲染基线单测（2026-11-03 回归 iTwin 默认）：
 * - 灯光 = LightSettings.fromJSON(undefined)；
 * - environment = Environment.fromJSON(undefined)（sky/ground/atmosphere 全关）；
 * - 不写任何 SubCategoryOverride（材质回到元素/类别默认）；
 * - viewFlags = SmoothShade + lighting + visibleEdges，AO/shadows 关；
 * - hiddenLine visible 边线保留 #1f1f1f/2px；MSAA 4。
 */
import { describe, expect, it, vi } from 'vitest';
import { Environment, HiddenLine, LightSettings, RenderMode, ViewFlags } from '@itwin/core-common';
import { DisplayStyle3dState } from '@itwin/core-frontend';
import {
  ANTIALIAS_SAMPLES,
  applyViewportRenderBaseline,
  EDGE_COLOR,
  EDGE_WEIGHT,
} from '../render-profile.js';

function fakeViewport() {
  const settings = {
    environment: Environment.defaults.withDisplay({ sky: true, ground: true, atmosphere: true }),
    hiddenLineSettings: HiddenLine.Settings.fromJSON({
      visible: { ovrColor: true, color: 0x123456, width: 5 },
    }),
    lights: LightSettings.fromJSON({
      solar: { intensity: 3, alwaysEnabled: true, direction: [1, 0, 0] },
    }),
  };
  const vp = {
    viewFlags: ViewFlags.fromJSON({
      renderMode: RenderMode.HiddenLine,
      noSolarLight: true,
      noCameraLights: true,
      noSourceLights: true,
      grid: true,
      acs: true,
      backgroundMap: true,
      monochrome: true,
      wiremesh: true,
    }),
    antialiasSamples: 1,
    invalidateScene: vi.fn(),
    setLightSettings(next: LightSettings) { settings.lights = next; },
    view: {
      displayStyle: Object.create(DisplayStyle3dState.prototype, {
        settings: { value: settings },
      }),
    },
  };
  return { vp, settings };
}

describe('render-profile：iTwin 默认渲染基线', () => {
  it('灯光回到 LightSettings 默认值', () => {
    const { vp, settings } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(settings.lights.solar.intensity).toBe(1);
    expect(settings.lights.solar.alwaysEnabled).toBe(false);
    expect(settings.lights.solar.direction.isAlmostEqual({ x: 0.272166, y: 0.680414, z: 0.680414 } as never)).toBe(true);
    expect(settings.lights.ambient.intensity).toBe(0.2);
    expect(settings.lights.portraitIntensity).toBe(0.3);
    expect(settings.lights.specularIntensity).toBe(1);
    expect(settings.lights.hemisphere.intensity).toBe(0);
  });

  it('environment 回到默认全关', () => {
    const { vp, settings } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(settings.environment.displaySky).toBe(false);
    expect(settings.environment.displayGround).toBe(false);
    expect(settings.environment.displayAtmosphere).toBe(false);
  });

  it('view flags = SmoothShade + lighting + visibleEdges；AO/阴影关并清污染', () => {
    const { vp } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    const f = vp.viewFlags;
    expect(f.renderMode).toBe(RenderMode.SmoothShade);
    expect(f.lighting).toBe(true);
    expect(f.visibleEdges).toBe(true);
    expect(f.hiddenEdges).toBe(false);
    expect(f.ambientOcclusion).toBe(false);
    expect(f.shadows).toBe(false);
    expect(f.grid).toBe(false);
    expect(f.acsTriad).toBe(false);
    expect(f.backgroundMap).toBe(false);
    expect(f.monochrome).toBe(false);
    expect(f.wiremesh).toBe(false);
  });

  it('visible 边线覆盖 = #1f1f1f / 2px', () => {
    const { vp, settings } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(settings.hiddenLineSettings.toJSON().visible).toMatchObject({
      ovrColor: true,
      color: EDGE_COLOR.tbgr,
      width: EDGE_WEIGHT,
    });
  });

  it('不写 SubCategoryOverride（fake settings 未提供 overrideSubCategory 也不抛错）', () => {
    const { vp } = fakeViewport();
    expect(() => applyViewportRenderBaseline(vp as never)).not.toThrow();
  });

  it('MSAA=4 且 invalidateScene 恰一次', () => {
    const { vp } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(vp.antialiasSamples).toBe(ANTIALIAS_SAMPLES);
    expect(vp.invalidateScene).toHaveBeenCalledTimes(1);
  });

  it('常量钉形：边 #1f1f1f / 2px', () => {
    expect(EDGE_COLOR.toHexString()).toBe('#1f1f1f');
    expect(EDGE_WEIGHT).toBe(2);
    expect(ANTIALIAS_SAMPLES).toBe(4);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd luban-cad/packages/viewer && npx vitest run src/viewport/test/render-profile.test.ts`

Expected: FAIL —— `applyViewportRenderBaseline` 未导出（或旧 `LIGHTS_PROFILE` 不存在）。

- [ ] **Step 3: 重写 render-profile 实现**

将 `luban-cad/packages/viewer/src/viewport/render-profile.ts` 全量替换为：

```ts
/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iTwin 默认渲染基线（2026-11-03）：
 * - 灯光/环境回到 core 默认值（LightSettings.fromJSON() / Environment.fromJSON()）；
 * - 不覆盖元素/子类别材质（删除 Onshape 灰面 SubCategoryOverride）；
 * - 保留白底（theme-background）与 BRep 全拓扑边线（#1f1f1f 2px）；
 * - AO 默认关、阴影关、MSAA 4。
 */
import { DisplayStyle3dState, type ScreenViewport } from '@itwin/core-frontend';
import { ColorDef, Environment, HiddenLine, LightSettings, RenderMode } from '@itwin/core-common';

/** 边线：BRep 全拓扑叠加的配套近黑 2px。 */
export const EDGE_COLOR = ColorDef.from(31, 31, 31); // #1f1f1f
export const EDGE_WEIGHT = 2;

/** MSAA 采样数（保留高质量视图）。 */
export const ANTIALIAS_SAMPLES = 4;

/**
 * 把 iTwin 默认渲染基线应用到视口（幂等）。
 * 只动灯光/环境/基础 flags/边线外观/MSAA；不写 SubCategoryOverride，
 * 不碰背景（theme-background 负责白底/暗底）。
 */
export function applyViewportRenderBaseline(viewport: ScreenViewport): void {
  // 1) 灯光：core 默认（solar 1 / ambient 0.2 / portrait 0.3 / specular 1）。
  viewport.setLightSettings(LightSettings.fromJSON(undefined));

  // 2) flags：平滑着色 + 光照；AO/阴影关；清掉落库视图污染。
  viewport.viewFlags = viewport.viewFlags.copy({
    renderMode: RenderMode.SmoothShade,
    visibleEdges: true,
    hiddenEdges: false,
    lighting: true,
    ambientOcclusion: false,
    shadows: false,
    grid: false,
    acsTriad: false,
    backgroundMap: false,
    monochrome: false,
    wiremesh: false,
    thematicDisplay: false,
  });

  // 3) 3D 样式：环境默认全关 + BRep 边线外观。
  const displayStyle = viewport.view.displayStyle;
  if (displayStyle instanceof DisplayStyle3dState) {
    const style = displayStyle.settings;
    style.environment = Environment.fromJSON(undefined);
    const hline = style.hiddenLineSettings;
    const visible = hline.visible?.toJSON() ?? {};
    style.hiddenLineSettings = HiddenLine.Settings.fromJSON({
      ...hline.toJSON(),
      visible: { ...visible, ovrColor: true, color: EDGE_COLOR.tbgr, width: EDGE_WEIGHT },
    });
  }

  // 4) MSAA 热设。
  viewport.antialiasSamples = ANTIALIAS_SAMPLES;

  // settings 直改的字典类写入不走 onDisplayStyleChanged——显式失效。
  viewport.invalidateScene();
}
```

- [ ] **Step 4: 更新 use-viewport 调用点**

在 `luban-cad/packages/viewer/src/viewport/use-viewport.ts`：

1. 把导入改为 `import { applyViewportRenderBaseline } from './render-profile.js';`。
2. 删除 `queryAllSubCategoryIds` 函数（文件底部）。
3. 把创建链里的：

```ts
        try {
          const subCategoryIds = await queryAllSubCategoryIds(iModel);
          if (isAlive()) applyRenderProfile(newViewport, subCategoryIds);
        } catch {
          // 画像应用失败不阻断视口（基线观感缺位，功能链不受影响）
        }
```

改为：

```ts
        try {
          applyViewportRenderBaseline(newViewport);
        } catch {
          // 基线应用失败不阻断视口（功能链不受影响）
        }
```

- [ ] **Step 5: 更新显示设置默认值与持久化 key**

在 `luban-cad/apps/web/src/modules/part-studio/internal/display-actions.ts`：

```ts
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  mode: 'shaded',
  perspective: false,
  fovDegrees: 90,
  ambientOcclusion: false, // 2026-11-03：iTwin 默认 AO 关
  aoIntensityPct: 37.5,
  edgeWidthPx: 2,
  edgeColor: '#1f1f1f',
  showBrepEdges: true,
  showBrepVertices: false,
  shadows: false,
  antialiasSamples: 4,
  background: 'theme',
};
```

在 `luban-cad/apps/web/src/modules/part-studio/hooks/useDisplaySettings.ts`：

```ts
const STORAGE_KEY = 'luban.partStudio.displaySettings.v2';
```

- [ ] **Step 6: 更新显示设置测试**

在 `display-actions.test.ts` 的 `describe('display-actions')` 内新增：

```ts
  it('默认 AO 关闭（回归 iTwin 默认）', () => {
    expect(DEFAULT_DISPLAY_SETTINGS.ambientOcclusion).toBe(false);
    expect(DEFAULT_DISPLAY_SETTINGS.antialiasSamples).toBe(4);
    expect(DEFAULT_DISPLAY_SETTINGS.background).toBe('theme');
  });
```

在 `useDisplaySettings.test.tsx`：把 `const STORAGE_KEY = 'luban.partStudio.displaySettings.v1';` 改为 `v2`，并新增：

```ts
  it('忽略 v1 旧设置，让新的 iTwin 默认生效', () => {
    localStorage.setItem('luban.partStudio.displaySettings.v1', JSON.stringify({ ambientOcclusion: true }));
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    expect(result.current.settings.ambientOcclusion).toBe(false);
  });
```

- [ ] **Step 7: 运行测试**

Run:

```bash
cd luban-cad/packages/viewer && npx vitest run src/viewport/test/render-profile.test.ts
cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/display-actions.test.ts src/modules/part-studio/test/useDisplaySettings.test.tsx
```

Expected: 全部 PASS。

- [ ] **Step 8: 构建 viewer（web 消费 dist）**

Run: `cd luban-cad/packages/viewer && corepack pnpm@10 build`

Expected: tsc 成功，`dist/viewport/render-profile.js` 含 `applyViewportRenderBaseline`。

- [ ] **Step 9: 提交**

```bash
git add luban-cad/packages/viewer/src/viewport/render-profile.ts \
  luban-cad/packages/viewer/src/viewport/use-viewport.ts \
  luban-cad/packages/viewer/src/viewport/test/render-profile.test.ts \
  luban-cad/apps/web/src/modules/part-studio/internal/display-actions.ts \
  luban-cad/apps/web/src/modules/part-studio/hooks/useDisplaySettings.ts \
  luban-cad/apps/web/src/modules/part-studio/test/display-actions.test.ts \
  luban-cad/apps/web/src/modules/part-studio/test/useDisplaySettings.test.tsx
git commit -m "$(cat <<'EOF'
feat(viewer): restore iTwin default lighting and materials

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: editor 基座命令收口与几何按需读取

**Files:**
- Modify: `luban-cad/packages/editor/frontend/src/ElementGeometryTool.ts`
- Create: `luban-cad/packages/editor/frontend/src/test/ElementGeometryTool.test.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/tools/modeling/FilletEdgePickTool.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/FilletEdgePickTool.test.ts`

**Interfaces:**
- Produces: `ElementGeometryCacheTool.finishCommandIfStarted(): Promise<void>`（protected）；`ElementGeometryCacheTool.wantSubEntityGeometry: boolean`（protected getter，默认 false）。
- Consumes: `EditTools.finishCommand()`。

- [ ] **Step 1: 写失败的 editor 单测**

Create `luban-cad/packages/editor/frontend/src/test/ElementGeometryTool.test.ts`:

```ts
/**
 * 2026-11-03：子实体工具命令收口与几何按需读取的基座契约。
 * editor 包 vitest 是 node 环境：core-frontend 按 DraftFacesTool.test 口径
 * 模块级 mock（只保留被测基类会触碰的成员）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@itwin/core-frontend', () => ({
  AccuDrawHintBuilder: class {},
  BeButtonEvent: class {},
  BeModifierKeys: { Control: 1 },
  CoordinateLockOverrides: {},
  CoordSource: { ElemSnap: 1 },
  CoreTools: { translate: (s: string) => s },
  DecorateContext: class {},
  DynamicsContext: class {},
  ElementSetTool: class {
    public agenda = { isEmpty: true, elements: [] as string[] };
    public iModel = { key: 'imodel-key' };
    public async onCleanup(): Promise<void> {}
  },
  EventHandled: { Yes: 1, No: 2 },
  FeatureOverrideProvider: class {},
  FeatureSymbology: { Overrides: class {} },
  GraphicBranch: class {},
  GraphicBranchOptions: class {},
  GraphicType: { Scene: 1, WorldOverlay: 2 },
  HitDetail: class {},
  IModelApp: { renderSystem: {}, viewManager: {}, notifications: {} },
  IModelConnection: class {},
  InputSource: { Touch: 1 },
  LocateResponse: class {},
  readElementGraphics: vi.fn(),
  RenderGraphicOwner: class {},
  SelectionMethod: {},
  SelectionSet: class {},
  ToolAssistance: {},
  ToolAssistanceImage: {},
  ToolAssistanceInputMethod: {},
  ToolAssistanceInstruction: class {},
  ToolAssistanceSection: class {},
  Viewport: class {},
}));

vi.mock('../EditTool', () => ({ EditTools: { finishCommand: vi.fn() } }));
vi.mock('../EditToolIpc', () => ({ solidModelingIpc: {} }));
vi.mock('../CreateElementTool', () => ({ computeChordToleranceFromPoint: () => 0 }));

import { EditTools } from '../EditTool';
import { ElementGeometryCacheTool } from '../ElementGeometryTool';

class TestTool extends ElementGeometryCacheTool {
  protected override allowView(): boolean { return true; }
  public markStarted(): void {
    (this as unknown as { _startedCmd?: string })._startedCmd = 'cmd';
    (this as unknown as { _checkedIds: Map<string, boolean> })._checkedIds.set('0x1', true);
  }
  public async release(): Promise<void> { return this.finishCommandIfStarted(); }
  public geometryWanted(): boolean { return this.wantSubEntityGeometry; }
  protected override async clearElementGeometryCache(): Promise<void> { /* no IPC in this unit test */ }
}

describe('ElementGeometryCacheTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('finishCommandIfStarted：调用 finishCommand、复位命令与 checkedIds', async () => {
    const finish = vi.spyOn(EditTools, 'finishCommand').mockResolvedValue('');
    const tool = new TestTool();
    tool.markStarted();

    await tool.release();

    expect(finish).toHaveBeenCalledTimes(1);
    expect((tool as unknown as { _startedCmd?: string })._startedCmd).toBeUndefined();
    expect((tool as unknown as { _checkedIds: Map<string, boolean> })._checkedIds.size).toBe(0);
  });

  it('finishCommandIfStarted：未启动命令时零调用', async () => {
    const finish = vi.spyOn(EditTools, 'finishCommand').mockResolvedValue('');
    const tool = new TestTool();
    await tool.release();
    expect(finish).not.toHaveBeenCalled();
  });

  it('wantSubEntityGeometry 默认 false（只有需要世界几何的工具显式打开）', () => {
    expect(new TestTool().geometryWanted()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd luban-cad/packages/editor/frontend && npx vitest run src/test/ElementGeometryTool.test.ts`

Expected: FAIL —— `finishCommandIfStarted`/`wantSubEntityGeometry` 不存在。

- [ ] **Step 3: 实现基座修复**

在 `ElementGeometryTool.ts`：

1. 在 `ElementGeometryCacheTool` 的 `wantGeometrySummary` 附近增加：

```ts
  /** 是否请求子实体的世界几何条目（只有圆角选边的橙色覆盖层需要）。 */
  protected get wantSubEntityGeometry(): boolean { return false; }
```

2. 在 `createSubEntityGraphic` 的 `opts` 中把写死的 `wantGeometry: true` 改为：

```ts
        wantGeometry: this.wantSubEntityGeometry,
```

3. 在 `clearElementGeometryCache` 之后增加：

```ts
  /** 结束本工具启动的 SolidModeling 命令并清掉检查缓存（幂等）。 */
  protected async finishCommandIfStarted(): Promise<void> {
    if (undefined === this._startedCmd)
      return;

    try {
      await this.clearElementGeometryCache();
    } catch {
      // 命令已被外部收口：仍继续复位本地状态
    }

    this._startedCmd = undefined;
    this._checkedIds.clear();

    try {
      await EditTools.finishCommand();
    } catch {
      // 无活动命令/已被其它工具收口：无需重复报错
    }
  }
```

4. 把 `onCleanup` 改为：

```ts
  public override async onCleanup(): Promise<void> {
    await super.onCleanup();
    await this.finishCommandIfStarted();
    this.updateAgendaAppearanceProvider(true);
    this.clearGraphic();
  }
```

- [ ] **Step 4: 圆角选边显式请求世界几何**

在 `luban-cad/apps/web/src/modules/part-studio/tools/modeling/FilletEdgePickTool.ts` 的 `geometryCacheFilter` 附近增加：

```ts
  /** 橙色 x-ray 选边覆盖层需要精确世界几何。 */
  protected override get wantSubEntityGeometry(): boolean { return true; }
```

- [ ] **Step 5: 在 FilletEdgePickTool 单测钉住 override**

在 `FilletEdgePickTool.test.ts` 顶部导入处补充 `FilletEdgePickTool` 已有；在 `describe` 内新增：

```ts
  it('wantSubEntityGeometry = true（橙色 x-ray 选边需要世界几何）', () => {
    const proto = FilletEdgePickTool.prototype as unknown as { wantSubEntityGeometry: boolean };
    expect(proto.wantSubEntityGeometry).toBe(true);
  });
```

- [ ] **Step 6: 运行测试并构建 editor**

Run:

```bash
cd luban-cad/packages/editor/frontend && npx vitest run src/test/ElementGeometryTool.test.ts
cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/FilletEdgePickTool.test.ts
cd luban-cad/packages/editor/frontend && corepack pnpm@10 build
```

Expected: 单测 PASS，editor build 成功。

- [ ] **Step 7: 提交**

```bash
git add luban-cad/packages/editor/frontend/src/ElementGeometryTool.ts \
  luban-cad/packages/editor/frontend/src/test/ElementGeometryTool.test.ts \
  luban-cad/apps/web/src/modules/part-studio/tools/modeling/FilletEdgePickTool.ts \
  luban-cad/apps/web/src/modules/part-studio/test/FilletEdgePickTool.test.ts
git commit -m "$(cat <<'EOF'
fix(editor): finish solid modeling command on cleanup

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 统一选择工具核心（全类型/跨 body/优先级/点击语义）

**Files:**
- Create: `luban-cad/apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts`
- Create: `luban-cad/apps/web/src/modules/part-studio/test/OnshapeSelectTool.test.ts`

**Interfaces:**
- Consumes: `LocateSubEntityTool`、`SubEntityData`、`isSameSubEntity`、`IModelApp.accuSnap.currHit`、`IModelApp.toolAdmin.setAdjustedDataPoint`。
- Produces: `OnshapeSelectTool`（`toolId='LubanCAD.SelectSubEntity'`）、`OnshapeSelectOptions`、`clearSelection()`、`pause(clearSelection:boolean)`、`resume()`、`suspendForCommand()`、`resumeAfterCommand()`。

- [ ] **Step 1: 写失败的工具单测**

Create `luban-cad/apps/web/src/modules/part-studio/test/OnshapeSelectTool.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BeButtonEvent,
  BeModifierKeys,
  CoordSource,
  IModelApp,
} from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { SubEntityType } from '@itwin/editor-common';
import type { SubEntityLocationProps } from '@itwin/editor-common';
import { isSameSubEntity } from '@itwin/editor-frontend';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => ({ resolveFaceRef: vi.fn(), resolveEdgeRef: vi.fn() }),
  },
}));

function hit(type: SubEntityType, x: number, y: number, id = 1): SubEntityLocationProps {
  return {
    subEntity: { type, id },
    point: new Point3d(x, y, 0).toJSON(),
  } as SubEntityLocationProps;
}

function viewport(): never {
  return {
    worldToView: (p: Point3d) => p.clone(),
  } as never;
}

function event(viewPoint: Point3d, control = false): BeButtonEvent {
  const ev = new BeButtonEvent();
  ev.init({
    viewport: viewport() as never,
    viewPoint,
    point: new Point3d(),
    coordsFrom: CoordSource.ElemSnap,
    keyModifiers: control ? BeModifierKeys.Control : 0,
  });
  return ev;
}

class TestableTool extends OnshapeSelectTool {
  public nextElement: string | undefined;
  public nextHits: SubEntityLocationProps[] | undefined;
  public added: Array<{ id: string; hit: SubEntityLocationProps }> = [];
  public removed: Array<{ id: string; hit?: SubEntityLocationProps }> = [];
  public clears = 0;

  public exposeWantAdditionalElements(): boolean { return this.wantAdditionalElements; }
  public exposeShouldEnableLocate(): boolean { return this.shouldEnableLocate; }
  public exposeWant(type: SubEntityType): boolean { return this.wantSubEntityType(type); }
  public exposeOrder(hits: SubEntityLocationProps[], ev: BeButtonEvent): SubEntityLocationProps[] {
    return this.orderHits(hits, ev);
  }
  public async callDoLocate(ev: BeButtonEvent, newSearch = true): Promise<boolean> {
    return this.doLocateSubEntity(ev, newSearch);
  }

  protected override getCurrentElement(): string | undefined { return this.nextElement; }
  protected override async doPickSubEntities(): Promise<SubEntityLocationProps[] | undefined> {
    return this.nextHits;
  }
  protected override async addSubEntity(id: string, next: SubEntityLocationProps): Promise<void> {
    this.added.push({ id, hit: next });
    this._acceptedSubEntities.push({ props: next.subEntity } as never);
  }
  protected override async removeSubEntity(id: string, next?: SubEntityLocationProps): Promise<void> {
    this.removed.push({ id, hit: next });
    if (next)
      this._acceptedSubEntities = this._acceptedSubEntities.filter((entry) => !isSameSubEntity(entry.props, next.subEntity));
  }
  public override async clearSelection(): Promise<void> {
    this.clears += 1;
    this._acceptedSubEntities = [];
  }
}

function makeTool(): TestableTool {
  return new TestableTool({
    connectionKey: 'imodel-key',
    onSelectionChanged: vi.fn(),
    onError: vi.fn(),
  });
}

beforeEach(() => {
  // IModelApp 的 viewManager/toolAdmin/accuSnap 是 getter（无 setter）——只能替换静态字段。
  (IModelApp as unknown as { _viewManager: unknown })._viewManager = {
    invalidateDecorationsAllViews: vi.fn(),
  };
  (IModelApp as unknown as { _toolAdmin: unknown })._toolAdmin = {
    setAdjustedDataPoint: vi.fn(),
  };
  (IModelApp as unknown as { _accuSnap: unknown })._accuSnap = { currHit: undefined };
});

describe('OnshapeSelectTool：全类型与无 agenda 定位', () => {
  it('wantAdditionalElements=false、shouldEnableLocate=true、面/边/点全收', () => {
    const tool = makeTool();
    expect(tool.exposeWantAdditionalElements()).toBe(false);
    expect(tool.exposeShouldEnableLocate()).toBe(true);
    expect(tool.exposeWant(SubEntityType.Face)).toBe(true);
    expect(tool.exposeWant(SubEntityType.Edge)).toBe(true);
    expect(tool.exposeWant(SubEntityType.Vertex)).toBe(true);
  });

  it('getCurrentElement 使用 accuSnap.currHit（跨 body，不看 agenda）', () => {
    (IModelApp as unknown as { _accuSnap: unknown })._accuSnap = {
      currHit: { isElementHit: true, sourceId: '0xB' },
    };
    const tool = new OnshapeSelectTool({
      connectionKey: 'imodel-key', onSelectionChanged: vi.fn(), onError: vi.fn(),
    });
    const current = (tool as unknown as { getCurrentElement(): string | undefined }).getCurrentElement();
    expect(current).toBe('0xB');
  });
});

describe('OnshapeSelectTool：悬停优先级与阈值', () => {
  it('顶点 9px 优先于边 1px（顶点>边>面）', () => {
    const tool = makeTool();
    const ev = event(new Point3d(5, 0, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Edge, 4, 0, 2), hit(SubEntityType.Vertex, 0, 4, 1), hit(SubEntityType.Face, 0, 0, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([
      SubEntityType.Vertex, SubEntityType.Edge, SubEntityType.Face,
    ]);
  });

  it('顶点 >10px 被滤掉，边 5px 优先', () => {
    const tool = makeTool();
    const ev = event(new Point3d(20, 20, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Vertex, 5, 5, 1), hit(SubEntityType.Edge, 15, 20, 2), hit(SubEntityType.Face, 20, 20, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([SubEntityType.Edge, SubEntityType.Face]);
  });

  it('边 >6px 被滤掉，面兜底', () => {
    const tool = makeTool();
    const ev = event(new Point3d(20, 20, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Edge, 13, 20, 2), hit(SubEntityType.Face, 20, 20, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([SubEntityType.Face]);
  });
});

describe('OnshapeSelectTool：点击语义', () => {
  it('普通单击替换：先清空再 add', async () => {
    const tool = makeTool();
    tool.nextElement = '0x1';
    tool.nextHits = [hit(SubEntityType.Face, 0, 0, 7)];
    (tool as unknown as { _acceptedSubEntities: unknown[] })._acceptedSubEntities = [
      { props: { type: SubEntityType.Edge, id: 9 } },
    ];
    expect(await tool.callDoLocate(event(new Point3d()))).toBe(true);
    expect(tool.clears).toBe(1);
    expect(tool.added).toHaveLength(1);
  });

  it('普通单击已选中的唯一项：保持选中', async () => {
    const tool = makeTool();
    tool.nextElement = '0x1';
    const face = hit(SubEntityType.Face, 0, 0, 7);
    tool.nextHits = [face];
    (tool as unknown as { _acceptedSubEntities: unknown[] })._acceptedSubEntities = [{ props: face.subEntity }];
    await tool.callDoLocate(event(new Point3d()));
    expect(tool.clears).toBe(0);
    expect(tool.added).toHaveLength(0);
  });

  it('Ctrl 单击已选项：remove', async () => {
    const tool = makeTool();
    tool.nextElement = '0x1';
    const face = hit(SubEntityType.Face, 0, 0, 7);
    tool.nextHits = [face];
    (tool as unknown as { _acceptedSubEntities: unknown[] })._acceptedSubEntities = [{ props: face.subEntity }];
    await tool.callDoLocate(event(new Point3d(), true));
    expect(tool.removed).toHaveLength(1);
    expect(tool.added).toHaveLength(0);
  });

  it('空白单击清空选择', async () => {
    const tool = makeTool();
    tool.nextElement = undefined;
    expect(await tool.callDoLocate(event(new Point3d()))).toBe(false);
    expect(tool.clears).toBe(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/OnshapeSelectTool.test.ts`

Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 创建工具核心实现**

Create `luban-cad/apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts`:

```ts
/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 式统一选择工具（2026-11-03）：
 * - 面/边/点全收，无显式模式；
 * - 悬停按 顶点(≤10px) > 边(≤6px) > 面 就近高亮；
 * - 普通单击替换、Ctrl 切换、空白清除；
 * - 不把 body 加入 ElementSetTool agenda（getCurrentElement 只用 accuSnap.currHit，
 *   修复旧实现第一次拾取后钉死第一个 body 的缺陷）；
 * - 拾取链/几何缓存/高亮全部复用 LocateSubEntityTool。
 */
import { CoordSource, EventHandled, IModelApp } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { SubEntityType } from '@itwin/editor-common';
import type {
  ElementGeometryCacheFilter,
  SubEntityLocationProps,
  SubEntityProps,
} from '@itwin/editor-common';
import {
  EditTools,
  LocateSubEntityTool,
  isSameSubEntity,
} from '@itwin/editor-frontend';
import type { SubEntityData } from '@itwin/editor-frontend';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import i18next from 'i18next';
import type { CanvasSelection } from '../../types.js';

export interface OnshapeSelectOptions {
  connectionKey: string;
  onSelectionChanged: (selection: readonly CanvasSelection[]) => void;
  onError: (message: string) => void;
}

const VERTEX_PICK_PX = 10;
const EDGE_PICK_PX = 6;

function selectionKey(owner: string, props: SubEntityProps): string {
  return `${owner}:${props.type}:${props.id}:${props.index ?? 0}`;
}

export class OnshapeSelectTool extends LocateSubEntityTool {
  public static override toolId = 'LubanCAD.SelectSubEntity';
  public static override namespace = 'LubanCad';

  private readonly _options: OnshapeSelectOptions;
  private readonly _selected = new Map<string, CanvasSelection>();
  private readonly _selectedKeys: string[] = [];
  private _paused = false;
  private _commandSuspended = false;

  public constructor(options: OnshapeSelectOptions) {
    super();
    this._options = options;
  }

  public override requireWriteableTarget(): boolean {
    return false;
  }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    if (!this._paused)
      this.initLocateElements(true, false);
    this.setupAndPromptForNextAction();
    IModelApp.notifications.outputPrompt(i18next.t('partStudio.subEntitySelect.prompt'));
  }

  protected override get wantAdditionalElements(): boolean { return false; }
  protected override get shouldEnableLocate(): boolean { return !this._paused && !this._commandSuspended; }
  protected override get shouldEnableSnap(): boolean { return false; }

  protected override wantSubEntityType(type: SubEntityType): boolean {
    return type === SubEntityType.Face || type === SubEntityType.Edge || type === SubEntityType.Vertex;
  }

  protected override getMaximumSubEntityHits(type: SubEntityType): number {
    return type === SubEntityType.Face ? 1 : 3;
  }

  protected override get geometryCacheFilter(): ElementGeometryCacheFilter | undefined {
    return { parts: true, curves: false, surfaces: true, solids: true, other: false };
  }

  protected override get requiredSubEntityCount(): number {
    return Number.POSITIVE_INFINITY;
  }

  /** 只认当前光标命中的元素——agenda 不参与，跨 body 拾取。 */
  protected override getCurrentElement(): string | undefined {
    const hit = IModelApp.accuSnap?.currHit;
    return hit?.isElementHit ? hit.sourceId : undefined;
  }

  protected override async doPickSubEntities(
    id: string,
    ev: BeButtonEvent,
  ): Promise<SubEntityLocationProps[] | undefined> {
    if (this._paused || this._commandSuspended)
      return undefined;

    const hits = await super.doPickSubEntities(id, ev);
    if (!hits || hits.length === 0)
      return hits;

    return this.orderHits(hits, ev);
  }

  /** 屏幕距离过滤 + 顶点>边>面排序（protected 供测试触达）。 */
  protected orderHits(hits: SubEntityLocationProps[], ev: BeButtonEvent): SubEntityLocationProps[] {
    const vp = ev.viewport;
    if (!vp)
      return hits;

    const cursor = ev.viewPoint;
    const distance = (hit: SubEntityLocationProps): number =>
      vp.worldToView(Point3d.fromJSON(hit.point)).distanceXY(cursor);

    const vertices = hits
      .filter((hit) => hit.subEntity.type === SubEntityType.Vertex && distance(hit) <= VERTEX_PICK_PX)
      .sort((a, b) => distance(a) - distance(b));
    const edges = hits
      .filter((hit) => hit.subEntity.type === SubEntityType.Edge && distance(hit) <= EDGE_PICK_PX)
      .sort((a, b) => distance(a) - distance(b));
    const faces = hits.filter((hit) => hit.subEntity.type === SubEntityType.Face);

    return [...vertices, ...edges, ...faces];
  }

  protected override async doLocateSubEntity(ev: BeButtonEvent, newSearch: boolean): Promise<boolean> {
    if (this._paused || this._commandSuspended)
      return false;

    const id = this.getCurrentElement();
    const control = ev.isControlKey;

    if (!id) {
      if (!control)
        await this.clearSelection();
      return false;
    }

    if (newSearch) {
      this._locatedSubEntities = await this.doPickSubEntities(id, ev);
      if (!this._locatedSubEntities || this._locatedSubEntities.length === 0) {
        if (!control)
          await this.clearSelection();
        return false;
      }

      if (ev.coordsFrom !== CoordSource.ElemSnap) {
        ev.point.setFrom(Point3d.fromJSON(this._locatedSubEntities[0].point));
        IModelApp.toolAdmin.setAdjustedDataPoint(ev);
      }
    } else {
      await this.removeSubEntity(id);
    }

    const hit = this._locatedSubEntities?.shift();
    if (!hit)
      return false;

    const exists = this._acceptedSubEntities.some((entry) => isSameSubEntity(entry.props, hit.subEntity));

    if (control) {
      if (exists)
        await this.removeSubEntity(id, hit);
      else
        await this.addSubEntity(id, hit);
    } else if (!(exists && this._acceptedSubEntities.length === 1)) {
      await this.clearSelection();
      await this.addSubEntity(id, hit);
    }

    IModelApp.viewManager.invalidateDecorationsAllViews();
    return true;
  }

  /** 右键保留工具与高亮，由宿主打开 CanvasContextMenu。 */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    return EventHandled.Yes;
  }

  protected override async addSubEntity(id: string, props: SubEntityLocationProps): Promise<void> {
    await super.addSubEntity(id, props);

    const accepted = this.getAcceptedSubEntityData();
    if (accepted && !accepted.hasGraphic) {
      await this.removeSubEntity(id, props);
      this._options.onError(i18next.t('partStudio.subEntitySelect.highlightFailed'));
      return;
    }

    const selection = await this.resolveSelection(id, props.subEntity);
    if (!selection) {
      await this.removeSubEntity(id, props);
      return;
    }

    const key = selectionKey(id, props.subEntity);
    if (!this._selected.has(key))
      this._selectedKeys.push(key);
    this._selected.set(key, selection);
    this.emitSelection();
  }

  protected override async removeSubEntity(id: string, props?: SubEntityLocationProps): Promise<void> {
    await super.removeSubEntity(id, props);

    if (props) {
      const key = selectionKey(id, props.subEntity);
      this._selected.delete(key);
      const index = this._selectedKeys.indexOf(key);
      if (index >= 0)
        this._selectedKeys.splice(index, 1);
    } else {
      const key = this._selectedKeys.pop();
      if (key)
        this._selected.delete(key);
    }

    this.emitSelection();
  }

  public async clearSelection(): Promise<void> {
    if (this._acceptedSubEntities.length === 0 && this._selected.size === 0)
      return;

    for (const entry of this._acceptedSubEntities)
      entry.cleanupGraphic();
    this._acceptedSubEntities.length = 0;
    this._selected.clear();
    this._selectedKeys.length = 0;
    this.emitSelection();
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  private emitSelection(): void {
    const selection: CanvasSelection[] = [];
    for (const key of this._selectedKeys) {
      const entry = this._selected.get(key);
      if (entry)
        selection.push(entry);
    }
    this._options.onSelectionChanged(selection);
  }

  protected async resolveSelection(owner: string, subEntity: SubEntityProps): Promise<CanvasSelection | undefined> {
    const fallback = i18next.t('partStudio.subEntitySelect.resolveFailed');
    try {
      if (subEntity.type === SubEntityType.Face) {
        const result = await LubanFeatureRpcInterface.getClient().resolveFaceRef(
          this._options.connectionKey,
          owner,
          subEntity.id,
        );
        if (!result.ok || !result.ref) {
          this._options.onError(result.error ?? fallback);
          return undefined;
        }
        return {
          kind: 'face',
          id: `face:${owner}:${result.ref.nodeId}:${result.ref.entityId}`,
          ownerBodyKey: owner,
          topologyId: result.ref,
          cacheId: subEntity.id,
          label: i18next.t('partStudio.subEntitySelect.faceLabel'),
        };
      }

      if (subEntity.type === SubEntityType.Edge) {
        const result = await LubanFeatureRpcInterface.getClient().resolveEdgeRef(
          this._options.connectionKey,
          owner,
          subEntity.id,
        );
        if (!result.ok || !result.ref) {
          this._options.onError(result.error ?? fallback);
          return undefined;
        }
        return {
          kind: 'edge',
          id: `edge:${owner}:${result.ref.edge.nodeId}:${result.ref.edge.entityId}`,
          ownerBodyKey: owner,
          topologyId: result.ref.edge,
          cacheId: subEntity.id,
          label: i18next.t('partStudio.subEntitySelect.edgeLabel'),
        };
      }

      return {
        kind: 'vertex',
        id: `vertex:${owner}:${subEntity.id}`,
        ownerBodyKey: owner,
        cacheId: subEntity.id,
        label: i18next.t('partStudio.subEntitySelect.vertexLabel'),
      };
    } catch (err) {
      this._options.onError(err instanceof Error ? err.message : fallback);
      return undefined;
    }
  }

  /** 对话框/草图期间暂停：可选清空选择，释放 SolidModeling 命令。 */
  public async pause(clearSelection: boolean): Promise<void> {
    this._paused = true;
    this.clearCurrentSubEntity();
    if (clearSelection)
      await this.clearSelection();
    this.changeLocateState(false, false);
    await this.releaseCommand();
  }

  public resume(): void {
    if (!this._paused)
      return;
    this._paused = false;
    this.initLocateElements(true, false);
    this.setupAndPromptForNextAction();
  }

  /** 拓扑读面/子实体删除等命令需要独占命令槽：暂停 hover 但保留选择高亮。 */
  public async suspendForCommand(): Promise<void> {
    if (this._paused || this._commandSuspended)
      return;
    this._commandSuspended = true;
    this.clearCurrentSubEntity();
    this.changeLocateState(false, false);
    await this.releaseCommand();
  }

  public resumeAfterCommand(): void {
    if (!this._commandSuspended)
      return;
    this._commandSuspended = false;
    if (this._paused)
      return;
    this.initLocateElements(true, false);
    this.setupAndPromptForNextAction();
  }

  private async releaseCommand(): Promise<void> {
    if (undefined === this._startedCmd)
      return;

    try {
      await this.clearElementGeometryCache();
    } catch {
      // 外部已收口命令：继续复位本地状态
    }
    this._startedCmd = undefined;
    this._checkedIds.clear();

    try {
      await EditTools.finishCommand();
    } catch {
      // 无活动命令：无需报错
    }
  }

  public override async onCleanup(): Promise<void> {
    await this.clearSelection();
    await super.onCleanup();
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new OnshapeSelectTool(this._options);
    if (!(await tool.run()))
      await this.exitTool();
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/OnshapeSelectTool.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add luban-cad/apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts \
  luban-cad/apps/web/src/modules/part-studio/test/OnshapeSelectTool.test.ts
git commit -m "$(cat <<'EOF'
feat(selection): add unified Onshape-style select tool

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 选择解析、store 同步与暂停/恢复测试

**Files:**
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/OnshapeSelectTool.test.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts`（如需补齐测试触达）

**Interfaces:**
- Produces: `resolveSelection(owner, subEntity): Promise<CanvasSelection | undefined>`；选择 id 含 owner（`face:owner:node:entity` / `edge:owner:node:entity` / `vertex:owner:cacheId`）；`pause/resume/suspendForCommand/resumeAfterCommand` 行为。

- [ ] **Step 1: 追加失败测试**

在 `OnshapeSelectTool.test.ts` 增加 RPC mock：

```ts
const rpc = vi.hoisted(() => ({
  resolveFaceRef: vi.fn(),
  resolveEdgeRef: vi.fn(),
}));

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: { getClient: () => rpc },
}));
```

保留已有工具测试，追加：

```ts
class SelectionTool extends OnshapeSelectTool {
  public emitted: Array<readonly unknown[]> = [];
  public locateState: boolean[] = [];
  public constructor() {
    super({
      connectionKey: 'imodel-key',
      onSelectionChanged: (selection) => { this.emitted.push(selection); },
      onError: vi.fn(),
    });
  }
  public callResolve(owner: string, sub: SubEntityProps) { return this.resolveSelection(owner, sub); }
  public async callAdd(owner: string, props: SubEntityLocationProps) { await this.addSubEntity(owner, props); }
  public async callRemove(owner: string, props?: SubEntityLocationProps) { await this.removeSubEntity(owner, props); }
  public async callPause(clear: boolean) { await this.pause(clear); }
  public callResume() { this.resume(); }
  protected override async createSubEntityData(): Promise<SubEntityData> {
    return { hasGraphic: true } as SubEntityData;
  }
  public override changeLocateState(enabled: boolean): void { this.locateState.push(enabled); }
  public override initLocateElements(): void { /* no-op in unit test */ }
  protected override setupAndPromptForNextAction(): void { /* no-op in unit test */ }
  public exposePaused(): boolean { return this.shouldEnableLocate === false; }
}

const SUB_FACE = { type: SubEntityType.Face, id: 7, index: 0 } as SubEntityProps;
const SUB_EDGE = { type: SubEntityType.Edge, id: 9, index: 0 } as SubEntityProps;
const SUB_VERTEX = { type: SubEntityType.Vertex, id: 11, index: 0 } as SubEntityProps;
const LOC = (sub: SubEntityProps) => ({
  subEntity: sub,
  point: new Point3d(0, 0, 0).toJSON(),
}) as SubEntityLocationProps;

beforeEach(() => {
  rpc.resolveFaceRef.mockReset();
  rpc.resolveEdgeRef.mockReset();
  (IModelApp as unknown as { _viewManager: unknown })._viewManager = {
    invalidateDecorationsAllViews: vi.fn(),
  };
});
```

测试：

```ts
describe('OnshapeSelectTool：持久 id 与 store 同步', () => {
  it('face id 含 owner 与持久拓扑 id', async () => {
    rpc.resolveFaceRef.mockResolvedValue({ ok: true, ref: { nodeId: 1, entityId: 3 } });
    const tool = new SelectionTool();
    await expect(tool.callResolve('0xA', SUB_FACE)).resolves.toMatchObject({
      kind: 'face',
      id: 'face:0xA:1:3',
      ownerBodyKey: '0xA',
      cacheId: 7,
    });
  });

  it('edge id 含 owner 与 ref.edge', async () => {
    rpc.resolveEdgeRef.mockResolvedValue({ ok: true, ref: { edge: { nodeId: 2, entityId: 5 } } });
    const tool = new SelectionTool();
    await expect(tool.callResolve('0xB', SUB_EDGE)).resolves.toMatchObject({
      kind: 'edge',
      id: 'edge:0xB:2:5',
      ownerBodyKey: '0xB',
      topologyId: { nodeId: 2, entityId: 5 },
    });
  });

  it('vertex 不调 RPC，会话级 id 含 owner', async () => {
    const tool = new SelectionTool();
    await expect(tool.callResolve('0xC', SUB_VERTEX)).resolves.toMatchObject({
      kind: 'vertex',
      id: 'vertex:0xC:11',
      ownerBodyKey: '0xC',
    });
    expect(rpc.resolveFaceRef).not.toHaveBeenCalled();
    expect(rpc.resolveEdgeRef).not.toHaveBeenCalled();
  });

  it('添加/移除同步回调选择集', async () => {
    rpc.resolveFaceRef.mockResolvedValue({ ok: true, ref: { nodeId: 1, entityId: 3 } });
    const tool = new SelectionTool();
    await tool.callAdd('0xA', LOC(SUB_FACE));
    expect(tool.emitted.at(-1)).toEqual([expect.objectContaining({ id: 'face:0xA:1:3' })]);
    await tool.callRemove('0xA', LOC(SUB_FACE));
    expect(tool.emitted.at(-1)).toEqual([]);
  });

  it('两个 body 的同号拓扑 id 不互相去重（owner 入键）', async () => {
    rpc.resolveFaceRef.mockImplementation(async (_key: string, owner: string) => ({
      ok: true, ref: { nodeId: 1, entityId: 3 },
    }));
    const tool = new SelectionTool();
    await tool.callAdd('0xA', LOC(SUB_FACE));
    await tool.callAdd('0xB', LOC(SUB_FACE));
    expect(tool.emitted.at(-1)).toHaveLength(2);
  });

  it('pause(true) 清空选择并关闭 locate；resume 打开 locate', async () => {
    rpc.resolveFaceRef.mockResolvedValue({ ok: true, ref: { nodeId: 1, entityId: 3 } });
    const tool = new SelectionTool();
    await tool.callAdd('0xA', LOC(SUB_FACE));
    await tool.callPause(true);
    expect(tool.emitted.at(-1)).toEqual([]);
    expect(tool.exposePaused()).toBe(true);
    tool.callResume();
    expect(tool.exposePaused()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行全文件测试**

Run: `cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/OnshapeSelectTool.test.ts`

Expected: PASS（Task 3 的实现已覆盖本任务行为；若失败按测试输出修正实现，保持接口名不变）。

- [ ] **Step 3: 提交**

```bash
git add luban-cad/apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts \
  luban-cad/apps/web/src/modules/part-studio/test/OnshapeSelectTool.test.ts
git commit -m "$(cat <<'EOF'
feat(selection): resolve owner-scoped sub-entity selections

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 默认工具接线与暂停生命周期

**Files:**
- Create: `luban-cad/apps/web/src/modules/part-studio/internal/onshape-selection-runtime.ts`
- Create: `luban-cad/apps/web/src/modules/part-studio/hooks/useOnshapeSelection.ts`
- Create: `luban-cad/apps/web/src/modules/part-studio/test/useOnshapeSelection.test.tsx`

**Interfaces:**
- Produces: `useOnshapeSelection(connection, viewport, paused)`；`activeOnshapeSelect()`；`clearActiveOnshapeSelection()`。
- Consumes: `IModelApp.tools.register`、`IModelApp.toolAdmin.defaultToolId/defaultToolArgs/startDefaultTool/activeToolChanged`、`OnshapeSelectTool`。

- [ ] **Step 1: 写失败的 hook 测试**

Create `useOnshapeSelection.test.tsx`:

```ts
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeEvent } from '@itwin/core-bentley';
import { IModelApp } from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';
import { useOnshapeSelection } from '../hooks/useOnshapeSelection.js';

const connection = { key: 'imodel-key' } as BriefcaseConnection;
const viewport = {} as ScreenViewport;

function stubToolAdmin(paused = false) {
  const startDefaultTool = vi.fn(async () => undefined);
  const activeToolChanged = new BeEvent<(tool: unknown) => void>();
  const admin = {
    defaultToolId: 'Select',
    defaultToolArgs: undefined as unknown[] | undefined,
    activeTool: undefined as unknown,
    startDefaultTool,
    activeToolChanged,
  };
  (IModelApp as unknown as { _toolAdmin: unknown })._toolAdmin = admin;
  return { admin, startDefaultTool, activeToolChanged };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useOnshapeSelection', () => {
  it('注册工具并设置 defaultToolId/defaultToolArgs，空闲即启动', () => {
    const { admin, startDefaultTool } = stubToolAdmin();
    const register = vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));
    expect(register).toHaveBeenCalledWith(OnshapeSelectTool);
    expect(admin.defaultToolId).toBe(OnshapeSelectTool.toolId);
    expect(admin.defaultToolArgs?.[0]).toMatchObject({ connectionKey: 'imodel-key' });
    expect(startDefaultTool).toHaveBeenCalled();
    unmount();
  });

  it('paused=true 不启动；恢复后启动或 resume', () => {
    const { admin, startDefaultTool } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { rerender } = renderHook(
      ({ paused }) => useOnshapeSelection(connection, viewport, paused),
      { initialProps: { paused: true } },
    );
    expect(startDefaultTool).not.toHaveBeenCalled();

    const tool = new OnshapeSelectTool({
      connectionKey: 'imodel-key', onSelectionChanged: vi.fn(), onError: vi.fn(),
    });
    const pause = vi.spyOn(tool, 'pause').mockResolvedValue(undefined);
    const resume = vi.spyOn(tool, 'resume').mockImplementation(() => undefined);
    admin.activeTool = tool;
    rerender({ paused: false });
    expect(resume).toHaveBeenCalled();
    rerender({ paused: true });
    expect(pause).toHaveBeenCalledWith(true);
  });

  it('卸载恢复 core Select 并清空选择', () => {
    const { admin } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));
    unmount();
    expect(admin.defaultToolId).toBe('Select');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/useOnshapeSelection.test.tsx`

Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现运行时与 hook**

Create `internal/onshape-selection-runtime.ts`:

```ts
/**
 * Onshape 选择工具的跨组件运行时引用（右键“选中所属实体”、零件列表、
 * 命令协调器共用）。
 */
import { IModelApp } from '@itwin/core-frontend';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';

export function activeOnshapeSelect(): OnshapeSelectTool | undefined {
  const tool = IModelApp.toolAdmin?.activeTool;
  return tool instanceof OnshapeSelectTool ? tool : undefined;
}

export function clearActiveOnshapeSelection(): void {
  void activeOnshapeSelect()?.clearSelection();
}
```

Create `hooks/useOnshapeSelection.ts`:

```ts
/**
 * Onshape 式选择工具的默认工具生命周期（2026-11-03）：
 * - 注册为 ToolAdmin 默认工具（工具退出/视图工具结束自动回到它）；
 * - dialog/草图打开时 pause({clearSelection:true})，关闭后 resume；
 * - 卸载恢复 core Select 并清空选择；
 * - 注册 BRep 命令协调器的 hover 控制器（Task 6 接线）。
 */
import { useEffect, useRef } from 'react';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';
import type { OnshapeSelectOptions } from '../tools/modeling/OnshapeSelectTool.js';
import { activeOnshapeSelect } from '../internal/onshape-selection-runtime.js';
import { registerBrepHoverController } from '../internal/brep-command-coordinator.js';

function toast(message: string): void {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(OutputMessagePriority.Error, message),
  );
}

/** 默认工具启动失败时回退 core Select，避免“看似有工具、实际无工具”。 */
function startDefaultOrFallback(admin: typeof IModelApp.toolAdmin): void {
  void admin.startDefaultTool().catch((err: unknown) => {
    admin.defaultToolId = 'Select';
    toast(err instanceof Error ? err.message : String(err));
  });
}

export function useOnshapeSelection(
  connection: BriefcaseConnection | undefined,
  viewport: ScreenViewport | null | undefined,
  paused: boolean,
): void {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!connection || !viewport)
      return;

    IModelApp.tools.register(OnshapeSelectTool);

    const options: OnshapeSelectOptions = {
      connectionKey: connection.key,
      onSelectionChanged: (selection) => usePartStudioStore.getState().setCanvasSelection(selection),
      onError: toast,
    };

    const admin = IModelApp.toolAdmin;
    admin.defaultToolId = OnshapeSelectTool.toolId;
    admin.defaultToolArgs = [options];

    if (!pausedRef.current)
      startDefaultOrFallback(admin);

    const removeToolListener = admin.activeToolChanged.addListener((tool) => {
      if (pausedRef.current && tool instanceof OnshapeSelectTool)
        void tool.pause(true);
    });

    const removeHoverController = registerBrepHoverController({
      suspend: async () => { await activeOnshapeSelect()?.suspendForCommand(); },
      resume: () => { activeOnshapeSelect()?.resumeAfterCommand(); },
    });

    return () => {
      removeToolListener();
      removeHoverController();
    };
  }, [connection, viewport]);

  useEffect(() => {
    const admin = IModelApp.toolAdmin;
    if (admin.defaultToolId !== OnshapeSelectTool.toolId)
      return;

    const tool = admin.activeTool;
    if (paused) {
      if (tool instanceof OnshapeSelectTool)
        void tool.pause(true);
      // 用户确认“打开对话框/草图即清空选择”：body SelectionSet 一并清，防止 store 空
      // 但 SelectionSet 仍残留旧 body 被后续工具误用。
      connection?.selectionSet?.emptyAll();
      return;
    }

    if (tool instanceof OnshapeSelectTool)
      tool.resume();
    else
      startDefaultOrFallback(admin);
  }, [paused, connection, viewport]);

  useEffect(() => () => {
    const admin = IModelApp.toolAdmin;
    if (admin.defaultToolId === OnshapeSelectTool.toolId) {
      admin.defaultToolId = 'Select';
      admin.defaultToolArgs = undefined;
      if (admin.activeTool instanceof OnshapeSelectTool)
        void admin.startDefaultTool();
    }
    usePartStudioStore.getState().setCanvasSelection([]);
  }, []);
}
```

Task 6 会创建 `brep-command-coordinator.ts`；本任务先建一个最小空实现（Task 6 再补测试）：

```ts
export interface BrepHoverController {
  suspend(): Promise<void>;
  resume(): void;
}

export function registerBrepHoverController(controller: BrepHoverController): () => void {
  return () => undefined;
}

export async function withExclusiveBrepCommand<T>(task: () => Promise<T>): Promise<T> {
  return task();
}
```

- [ ] **Step 4: 运行测试**

Run: `cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/useOnshapeSelection.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add luban-cad/apps/web/src/modules/part-studio/internal/onshape-selection-runtime.ts \
  luban-cad/apps/web/src/modules/part-studio/hooks/useOnshapeSelection.ts \
  luban-cad/apps/web/src/modules/part-studio/internal/brep-command-coordinator.ts \
  luban-cad/apps/web/src/modules/part-studio/test/useOnshapeSelection.test.tsx
git commit -m "$(cat <<'EOF'
feat(selection): install Onshape select tool as default

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: BRep 命令协调器（拓扑读面/子实体删除）

**Files:**
- Modify: `luban-cad/apps/web/src/modules/part-studio/internal/brep-command-coordinator.ts`
- Create: `luban-cad/apps/web/src/modules/part-studio/test/brep-command-coordinator.test.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/hooks/useBrepTopology.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/canvas/subentity-delete.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/subentity-delete.test.ts`

**Interfaces:**
- Produces: `registerBrepHoverController(controller): () => void`；`withExclusiveBrepCommand<T>(task): Promise<T>`（串行；任务前 suspend、after resume）。
- Consumes: selection tool `suspendForCommand`/`resumeAfterCommand`（经 hook 注册）。

- [ ] **Step 1: 写失败的协调器测试**

Create `brep-command-coordinator.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  registerBrepHoverController,
  withExclusiveBrepCommand,
} from '../internal/brep-command-coordinator.js';

describe('BrepCommandCoordinator', () => {
  it('串行执行：每次任务前后 suspend/resume，任务不交错', async () => {
    const events: string[] = [];
    const unregister = registerBrepHoverController({
      suspend: async () => { events.push('suspend'); },
      resume: () => { events.push('resume'); },
    });

    const first = withExclusiveBrepCommand(async () => {
      events.push('task-1-start');
      await Promise.resolve();
      events.push('task-1-end');
      return 1;
    });
    const second = withExclusiveBrepCommand(async () => {
      events.push('task-2');
      return 2;
    });

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual([
      'suspend', 'task-1-start', 'task-1-end', 'resume',
      'suspend', 'task-2', 'resume',
    ]);
    unregister();
  });

  it('任务抛错仍 resume，队列继续', async () => {
    const events: string[] = [];
    registerBrepHoverController({
      suspend: async () => { events.push('suspend'); },
      resume: () => { events.push('resume'); },
    });

    await expect(withExclusiveBrepCommand(async () => {
      events.push('boom');
      throw new Error('boom');
    })).rejects.toThrow('boom');

    await withExclusiveBrepCommand(async () => { events.push('next'); });
    expect(events).toEqual(['suspend', 'boom', 'resume', 'suspend', 'next', 'resume']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/brep-command-coordinator.test.ts`

Expected: FAIL —— 当前最小实现在 suspend/resume 处未记录事件/未串行。

- [ ] **Step 3: 实现协调器**

Replace `internal/brep-command-coordinator.ts`:

```ts
/**
 * BRep 命令协调器（2026-11-03）：选择工具 hover 会持有 SolidModeling 命令；
 * 拓扑读面与子实体删除也需要同一命令槽。通过串行队列在执行前暂停 hover、
 * 结束后恢复，避免 commandBusy / 清缓存拆会话。
 */
export interface BrepHoverController {
  suspend(): Promise<void>;
  resume(): void;
}

let controller: BrepHoverController | undefined;
let queue: Promise<unknown> = Promise.resolve();

export function registerBrepHoverController(next: BrepHoverController): () => void {
  controller = next;
  return () => {
    if (controller === next)
      controller = undefined;
  };
}

export function withExclusiveBrepCommand<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const active = controller;
    await active?.suspend();
    try {
      return await task();
    } finally {
      active?.resume();
    }
  });

  queue = run.then(() => undefined, () => undefined);
  return run;
}
```

- [ ] **Step 4: 接线拓扑读面与子实体删除**

`useBrepTopology.ts`：

1. 导入 `withExclusiveBrepCommand`。
2. 把 `const result = await withTimeout(readBrepTopology(connection.key, visibleBodies), READ_TIMEOUT_MS);`
   改为：

```ts
        const result = await withTimeout(
          withExclusiveBrepCommand(() => readBrepTopology(connection.key, visibleBodies)),
          READ_TIMEOUT_MS,
        );
```

`subentity-delete.ts`：

1. 导入 `withExclusiveBrepCommand`。
2. 从 `await EditTools.startCommand...` 到 `await connection.saveChanges(...)` 整段包进：

```ts
  await withExclusiveBrepCommand(async () => {
    await EditTools.startCommand<string>({
      commandId: editorBuiltInCmdIds.cmdSolidModeling,
      iModelKey: connection.key,
    });

    // ...原有 createElementGeometryCache / facesFromId|edgesFromOwnId / deleteSubEntities / saveChanges...
  });
```

缩进整体后移；逻辑保持不变。

- [ ] **Step 5: 运行测试**

Run:

```bash
cd luban-cad/apps/web && npx vitest run src/modules/part-studio/test/brep-command-coordinator.test.ts src/modules/part-studio/test/subentity-delete.test.ts
```

Expected: PASS（subentity-delete 测试有短暂 suspend/resume no-op；无控制器注册时直接执行）。

- [ ] **Step 6: 提交**

```bash
git add luban-cad/apps/web/src/modules/part-studio/internal/brep-command-coordinator.ts \
  luban-cad/apps/web/src/modules/part-studio/test/brep-command-coordinator.test.ts \
  luban-cad/apps/web/src/modules/part-studio/hooks/useBrepTopology.ts \
  luban-cad/apps/web/src/modules/part-studio/canvas/subentity-delete.ts \
  luban-cad/apps/web/src/modules/part-studio/test/subentity-delete.test.ts
git commit -m "$(cat <<'EOF'
feat(brep): serialize hover and topology commands

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 接线 Part Studio 并移除显式选择模式

**Files:**
- Modify: `luban-cad/apps/web/src/modules/part-studio/types.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/stores/use-part-studio-store.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/canvas/CanvasContextMenu.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/ribbon/Ribbon.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/ribbon/ribbon-registry.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/components/PartStudioCanvas.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx`
- Modify: `luban-cad/apps/web/src/modules/part-studio/hooks/useCanvasBodySelection.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/hooks/useBrepTopology.ts`
- Modify: `luban-cad/apps/web/src/modules/part-studio/internal/display-actions.ts`
- Delete: `luban-cad/apps/web/src/modules/part-studio/hooks/useSubEntitySelection.ts`
- Delete: `luban-cad/apps/web/src/modules/part-studio/tools/modeling/SubEntitySelectTool.ts`
- Delete: `luban-cad/apps/web/src/modules/part-studio/test/useSubEntitySelection.test.tsx`
- Delete: `luban-cad/apps/web/src/modules/part-studio/test/SubEntitySelectTool.test.ts`
- Modify tests: `use-part-studio-store.test.ts`、`useCanvasBodySelection.test.ts`、`CanvasContextMenu.test.tsx`、`PartStudioCanvas.test.tsx`、`PartStudioPage.test.tsx`、`part-studio-structure.test.tsx`、`Ribbon.test.tsx`、`ribbon-registry.test.ts`、`display-actions.test.ts`、`SketchDialog.test.tsx`、`FeatureTree.test.tsx`、`FeatureDialog.test.tsx`、`PartStudioSidebar.test.tsx`（后四者去掉测试夹具里的 `selectionMode` 字段）

**Interfaces:**
- Consumes: `useOnshapeSelection(connection, viewport, paused)`、`clearActiveOnshapeSelection()`。
- Produces: 无 `CanvasSelectionMode`/`canvas.selectionMode`/`setSelectionMode`；`useCanvasBodySelection(connection, bodies)`；`brepOverlayOptionsFor(settings)`。

- [ ] **Step 1: 删除模式状态**

`types.ts`：
- 删除 `CanvasSelectionMode` 类型定义（第 36-42 行块）。
- `PartStudioCanvasState` 删除 `selectionMode` 字段及注释。

`use-part-studio-store.ts`：
- 删除 `CanvasSelectionMode` 导入。
- `PartStudioActions` 删除 `setSelectionMode`。
- `initialCanvas` 删除 `selectionMode: 'body'`。
- `createCanvasSlice` 返回类型删除 `'setSelectionMode'`，删除 `setSelectionMode` 实现。

- [ ] **Step 2: 移除右键模式菜单**

`CanvasContextMenu.tsx`：
- 删除 `CanvasSelectionMode` 类型导入（保留 `CanvasSelection`）。
- 删除 action 联合里的 `| { kind: 'selection-mode'; mode: CanvasSelectionMode }`。
- 删除 `selectionModeGroup()` 函数及所有 `...selectionModeGroup()` 调用（空白/feature/part/face/edge/vertex 六个菜单）。
- 删除 `const setSelectionMode = usePartStudioStore((s) => s.setSelectionMode);`。
- 删除 `case 'selection-mode': ...` 分支。
- `handleItemClick` 依赖数组移除 `setSelectionMode`。
- 保留“选中所属实体”项与 `SvgSelection` 导入。

- [ ] **Step 3: 移除 ribbon/命令搜索模式入口**

`Ribbon.tsx`：删除整个：

```ts
    if (id === 'selectFace' || id === 'selectEdge' || id === 'selectVertex') {
      ...
      return;
    }
```

`ribbon-registry.ts`：
- 删除 `selectFace/selectEdge/selectVertex` 三个 `RIBBON_TOOLS` 条目。
- 删除 `RIBBON_GROUP_ORDER` 中的 `'selection'`（保留 `RibbonGroup` 联合类型，避免无关波及）。
- 删除不再使用的 `SelectFaceIcon/SelectEdgeIcon/SelectVertexIcon` 导入（如仅这三处使用）。
- 文件头“29 工具注册表”改为实际数量（26）。

- [ ] **Step 4: 画布 owner 动作与删除后清理**

`PartStudioCanvas.tsx`：
- 导入 `clearActiveOnshapeSelection`。
- `handleSelectOwner` 改为：

```ts
  const handleSelectOwner = React.useCallback((bodyKey: string): void => {
    clearActiveOnshapeSelection();
    const store = usePartStudioStore.getState();
    store.setSelectedNodeIds([bodyKey]);
    connection?.selectionSet?.replace([bodyKey]);
  }, [connection]);
```

- `handleDeleteSubEntity` 成功后删除 `setSelectionMode('body')`，改为 `clearActiveOnshapeSelection();`（失败路径保持选择，可重试；如需失败也清，放到 `finally`，但本设计保持失败保留）。

- [ ] **Step 5: 接线 Part Studio 页面**

`PartStudioPage.tsx`：
- 导入调整：删除 `useSubEntitySelection`；新增 `useOnshapeSelection` 与 `clearActiveOnshapeSelection`。
- 删除 `const selectionMode = usePartStudioStore((s) => s.canvas.selectionMode);`。
- `useCanvasBodySelection(connection ?? undefined, featureSystem.bodiesLoaded ? featureSystem.bodies : undefined);`（第三参删除）。
- 新增：

```ts
  const sketchActiveForSelection = usePartStudioStore((s) => s.sketch.isActive);
  const dialogActiveForSelection = usePartStudioStore((s) => s.dialog.active !== null);
  useOnshapeSelection(
    connection ?? undefined,
    viewport,
    sketchActiveForSelection || dialogActiveForSelection,
  );
```

- `useBrepTopology`：
  - 删除 `selectionMode` 参数与变量。
  - `enabled: !sketchActiveForBrep && !dialogActiveForBrep`。
- 新增零件列表选择 effect（放在 canvas 桥之后）：

```ts
  // Onshape 零件列表选择：tree 中的 part 节点 → SelectionSet → store（kind='part'）。
  const selectedNodeIds = usePartStudioStore((s) => s.tree.selectedNodeIds);
  useEffect(() => {
    if (!connection || !featureSystem.bodiesLoaded)
      return;
    const partIds = selectedNodeIds.filter((id) =>
      featureSystem.bodies.some((body) =>
        body.bodyKey === id && body.active !== false && body.authored !== false));
    if (partIds.length === 0)
      return;
    clearActiveOnshapeSelection();
    connection.selectionSet.replace(partIds);
  }, [selectedNodeIds, connection, featureSystem.bodies, featureSystem.bodiesLoaded]);
```

- [ ] **Step 6: 简化 body 桥与 BRep overlay 选项**

`useCanvasBodySelection.ts`：
- 删除 `enabled` 参数、相关注释与 `if (!enabled ...)` 分支；签名改为 `(connection, bodies)`。
- 注释改为“连接 + bodies 就绪即订阅；子实体工具写 store 不写 SelectionSet，两者不互相覆盖”。

`useBrepTopology.ts`：
- `UseBrepTopologyOptions` 删除 `selectionMode`。
- `edgeOptions = useMemo(() => brepOverlayOptionsFor(display), [display]);`
- 删除解构中的 `selectionMode`。

`display-actions.ts`：
- `brepOverlayOptionsFor(s: DisplaySettings)` 删除第二参数。
- `showVertices: s.showBrepVertices`（不再按选择模式自动打开）。
- 更新函数注释。

- [ ] **Step 7: 删除旧 hook/工具与旧测试**

```bash
git rm luban-cad/apps/web/src/modules/part-studio/hooks/useSubEntitySelection.ts \
  luban-cad/apps/web/src/modules/part-studio/tools/modeling/SubEntitySelectTool.ts \
  luban-cad/apps/web/src/modules/part-studio/test/useSubEntitySelection.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/SubEntitySelectTool.test.ts
```

- [ ] **Step 8: 更新受影响的单测**

按下表逐文件调整（删除/改写对模式、旧工具、旧签名的断言）：

- `use-part-studio-store.test.ts`：删除 selectionMode 初始值/切换测试；`setState` 的 canvas 对象去掉该字段。
- `useCanvasBodySelection.test.ts`：所有调用去掉第三参；删除 enabled=false 的退订用例；保留连接/bodies 就绪才订阅的用例。
- `CanvasContextMenu.test.tsx`：删除 `selection-mode` 菜单项断言；保留 owner/hide/delete 断言；空白菜单断言不再含“选择面/边/点”。
- `PartStudioCanvas.test.tsx`：mock `../internal/onshape-selection-runtime.js` 的 `clearActiveOnshapeSelection`；`选中所属实体` 用例断言 clear 调用 + tree + SelectionSet.replace，不再断言 selectionMode。
- `PartStudioPage.test.tsx`：mock `../hooks/useOnshapeSelection.js`，断言以 `(connection, viewport, paused)` 调用；删除 selectionMode mock；补一条 tree part 选择 → `selectionSet.replace` 断言。
- `part-studio-structure.test.tsx`：store 初始 shape 去掉 selectionMode；mock 增加 useOnshapeSelection。
- `Ribbon.test.tsx`：删除“命令搜索仍可切换 selectionMode”用例；其余断言不变。
- `ribbon-registry.test.ts`：`EXPECTED_TOOL_IDS` 删除 selectFace/selectEdge/selectVertex；分组序删除 `'selection'`；数量断言改为实际值。
- `display-actions.test.ts`：`brepOverlayOptionsFor` 调用去掉 selectionMode 参数；顶点断言改为仅由 `showBrepVertices` 控制。
- `SketchDialog.test.tsx` / `FeatureTree.test.tsx` / `FeatureDialog.test.tsx` / `PartStudioSidebar.test.tsx`：把测试夹具中的 `canvas: { selection: [], hiddenIds: [], selectionMode: 'body' }` 改为 `canvas: { selection: [], hiddenIds: [] }`；若这些文件 mock 了 `useSubEntitySelection`，改为 mock `useOnshapeSelection`（仅 PartStudioPage 子树需要的文件）。

- [ ] **Step 9: 运行受影响单测与 tsc**

Run:

```bash
cd luban-cad/apps/web && npx vitest run \
  src/modules/part-studio/test/use-part-studio-store.test.ts \
  src/modules/part-studio/test/useCanvasBodySelection.test.ts \
  src/modules/part-studio/test/CanvasContextMenu.test.tsx \
  src/modules/part-studio/test/PartStudioCanvas.test.tsx \
  src/modules/part-studio/test/PartStudioPage.test.tsx \
  src/modules/part-studio/test/part-studio-structure.test.tsx \
  src/modules/part-studio/test/Ribbon.test.tsx \
  src/modules/part-studio/test/ribbon-registry.test.ts \
  src/modules/part-studio/test/display-actions.test.ts
cd luban-cad/apps/web && npx tsc --noEmit
```

Expected: PASS / 无类型错误。

- [ ] **Step 10: 提交**

```bash
git add \
  luban-cad/apps/web/src/modules/part-studio/types.ts \
  luban-cad/apps/web/src/modules/part-studio/stores/use-part-studio-store.ts \
  luban-cad/apps/web/src/modules/part-studio/canvas/CanvasContextMenu.tsx \
  luban-cad/apps/web/src/modules/part-studio/canvas/subentity-delete.ts \
  luban-cad/apps/web/src/modules/part-studio/ribbon/Ribbon.tsx \
  luban-cad/apps/web/src/modules/part-studio/ribbon/ribbon-registry.ts \
  luban-cad/apps/web/src/modules/part-studio/components/PartStudioCanvas.tsx \
  luban-cad/apps/web/src/modules/part-studio/PartStudioPage.tsx \
  luban-cad/apps/web/src/modules/part-studio/hooks/useCanvasBodySelection.ts \
  luban-cad/apps/web/src/modules/part-studio/hooks/useBrepTopology.ts \
  luban-cad/apps/web/src/modules/part-studio/hooks/useOnshapeSelection.ts \
  luban-cad/apps/web/src/modules/part-studio/internal/display-actions.ts \
  luban-cad/apps/web/src/modules/part-studio/internal/onshape-selection-runtime.ts \
  luban-cad/apps/web/src/modules/part-studio/internal/brep-command-coordinator.ts \
  luban-cad/apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts \
  luban-cad/apps/web/src/modules/part-studio/test/use-part-studio-store.test.ts \
  luban-cad/apps/web/src/modules/part-studio/test/useCanvasBodySelection.test.ts \
  luban-cad/apps/web/src/modules/part-studio/test/CanvasContextMenu.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/PartStudioCanvas.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/PartStudioPage.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/part-studio-structure.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/Ribbon.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/ribbon-registry.test.ts \
  luban-cad/apps/web/src/modules/part-studio/test/display-actions.test.ts \
  luban-cad/apps/web/src/modules/part-studio/test/SketchDialog.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/FeatureTree.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/FeatureDialog.test.tsx \
  luban-cad/apps/web/src/modules/part-studio/test/PartStudioSidebar.test.tsx
git commit -m "$(cat <<'EOF'
feat(selection): wire Onshape selection and remove explicit modes

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: e2e 与视觉基线

**Files:**
- Modify: `luban-cad/apps/web/e2e/newbody.spec.ts`
- Modify: `luban-cad/apps/web/e2e/render-showcase.spec.ts`
- Modify: `luban-cad/apps/web/e2e/ui-parity.spec.ts`（如含模式断言）
- Modify: `luban-cad/apps/web/e2e/part-studio.spec.ts`（如含模式断言）
- Modify: `luban-cad/apps/web/e2e/visual.spec.ts`（仅当基线需要重钉）
- Modify: `luban-cad/apps/web/e2e/__screenshots__/*.png`（按需）

**Interfaces:**
- Consumes: 新工具/store（不再有 selectionMode）；BRep 叠加边/顶点。
- Produces: 真栈证据——无模式直接拾取、跨 body、Ctrl/空白语义、默认渲染 displayStyle 断言。

- [ ] **Step 1: 更新 newbody 选择段**

在 `newbody.spec.ts`：
- 删除 `currentSelectionMode` / `selectMode` helper 及其所有调用。
- 新增 helper：

```ts
  const pickAt = async (p: { x: number; y: number }): Promise<void> => {
    await page.mouse.move(cb.x + p.x - 12, cb.y + p.y + 10);
    await page.waitForTimeout(150);
    await page.mouse.move(cb.x + p.x, cb.y + p.y);
    await page.waitForTimeout(250);
    await page.mouse.click(cb.x + p.x, cb.y + p.y);
    await page.waitForTimeout(500);
  };

  const currentSelection = (): Promise<Array<{ kind: string; id: string; ownerBodyKey?: string }>> =>
    page.evaluate(() =>
      (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.selection);
```

- 面拾取：直接用 `pickAt(facePoints[i])`，然后断言：

```ts
  expect((await currentSelection()).some((entry) => entry.kind === 'face')).toBe(true);
```

- 面 owner 菜单：右键并断言“隐藏所属实体/选中所属实体/删除”可见（保留原断言）。
- 空白清除：点击画布空白处，`expect(await currentSelection()).toEqual([])`。
- 跨 body：先拾 body1 面（若有投影点），再拾 body2 面；断言第二次选择 owner 为 body2（普通单击为替换语义）。
- Ctrl 多选：拾 body1 面后按住 Ctrl 拾 body2 面，断言两项、owner 不同；再 Ctrl 点 body2 面，断言只剩 body1。
- 边/点：用原有投影点循环 `pickAt`，断言 `kind==='edge'` / `'vertex'`；不再调用 `selectMode`。
- 删除后清理：成功路径调用 `clearActive` 由 UI 自动发生；测试中清空 SelectionSet 的 evaluate 保留。

- [ ] **Step 2: 更新 render-showcase**

`render-showcase.spec.ts`：
- 删除 `chooseSelectionMode` helper 与所有调用。
- 边：`projectedEdgePoint` → `mouse.move/click` → 断言 selection 含 edge。
- 面：`pickFaceAt` 保留（直接点）；断言 face。
- 点：`projectedVertexPoint` → hover/click；断言 vertex。
- 更新 caption 文案（“无需切换模式，直接悬停/点击”）。
- 默认渲染 caption 更新为“iTwin 默认灯光/材质 + 白底 + BRep 边线；AO 默认关”。

- [ ] **Step 3: 新增真栈默认渲染断言**

在 `e2e/b-viewport.spec.ts`（常规套件，必须有 CI 覆盖）编辑器就绪后新增：

```ts
    const style = await page.evaluate(() => {
      const cf = ((window as any).__lubanE2E?.coreFrontend) as any;
      const vp = cf.IModelApp.viewManager.getFirstOpenView();
      const s = vp.view.displayStyle.settings;
      return {
        lights: s.lights.toJSON() ?? null,
        environmentSky: s.environment.displaySky,
        subCategoryOverrideCount: s.subCategoryOverrides.size,
        ambientOcclusion: vp.viewFlags.ambientOcclusion,
        backgroundColor: s.backgroundColor.toHexString(),
        antialiasSamples: vp.antialiasSamples,
      };
    });
    expect(style.lights).toBeNull(); // LightSettings 默认值 toJSON() === undefined
    expect(style.environmentSky).toBe(false);
    expect(style.subCategoryOverrideCount).toBe(0);
    expect(style.ambientOcclusion).toBe(false);
    expect(style.backgroundColor).toBe('#ffffff');
    expect(style.antialiasSamples).toBe(4);
```

- [ ] **Step 4: 清理其他 e2e 的模式引用**

Run: `cd luban-cad/apps/web && grep -R "selectionMode\|selectFace\|selectEdge\|selectVertex\|selectFaces\|selectEdges\|selectVertices" e2e`（PowerShell 用 `Select-String`），删除/改写所有断言为直接拾取或零件列表/“选中所属实体”。

- [ ] **Step 5: 重建产物并重启 dev server**

Run:

```bash
cd luban-cad/packages/viewer && corepack pnpm@10 build
cd luban-cad/packages/editor/frontend && corepack pnpm@10 build
```

重启 `luban-cad/apps/web` dev server（若 Playwright 复用在场的旧服务，必须重启以加载新的 viewer dist/editor lib）。

- [ ] **Step 6: 运行目标 e2e**

Run:

```bash
cd luban-cad/apps/web && npx playwright test e2e/newbody.spec.ts
cd luban-cad/apps/web && T2_RENDER_SHOWCASE=1 npx playwright test e2e/render-showcase.spec.ts --grep "默认外观"
cd luban-cad/apps/web && npx playwright test e2e/b-viewport.spec.ts
```

Expected: PASS；若截图差异，按 Step 7 重钉。

- [ ] **Step 7: 视觉基线**

Run: `cd luban-cad/apps/web && npx playwright test e2e/visual.spec.ts --update-snapshots`

检查 `e2e/__screenshots__/editor-b-default-light.png`、`editor-read-only-light.png` 只有预期差异（画布 mask 时通常无差异）；提交更新后的基线。

- [ ] **Step 8: 提交**

```bash
git add \
  luban-cad/apps/web/e2e/newbody.spec.ts \
  luban-cad/apps/web/e2e/render-showcase.spec.ts \
  luban-cad/apps/web/e2e/b-viewport.spec.ts \
  luban-cad/apps/web/e2e/ui-parity.spec.ts \
  luban-cad/apps/web/e2e/part-studio.spec.ts \
  luban-cad/apps/web/e2e/visual.spec.ts \
  luban-cad/apps/web/e2e/__screenshots__/editor-b-default-light.png \
  luban-cad/apps/web/e2e/__screenshots__/editor-read-only-light.png
git commit -m "$(cat <<'EOF'
test(e2e): update hover/pick and default render expectations

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 文档、全量验证与收口

**Files:**
- Modify: `docs/BREP-RENDERING-2026-11-03.md`
- Modify: `docs/UI-ONSHAPE-PARITY-2026-11-02.md`
- Modify: `luban-cad/CLAUDE.md`
- Modify: `docs/README.md`（如索引需要）

**Interfaces:**
- Consumes: 全部实现与测试结果。
- Produces: 诚实状态文档（渲染默认值、无模式拾取、命令协调、已知边界）。

- [ ] **Step 1: 更新渲染/拾取文档**

`docs/BREP-RENDERING-2026-11-03.md`：
- §1 渲染表：改为“iTwin 默认灯光/材质 + 白底 + BRep 边线 + AO 默认关 + MSAA 4”；删除 Onshape 顶光/灰面描述。
- §3 拾取：改为“统一 Onshape 选择工具：悬停 顶点>边>面；单击替换/Ctrl 切换/空白清除；无模式切换；整零件走零件列表/右键选中所属实体；选择仅空闲保留”。
- §5 验证基线：更新工具/测试名称与截图。
- §6 已知边界：顶点无持久 id、对话框清空选择、BRep 拓扑刷新经命令协调器。

`docs/UI-ONSHAPE-PARITY-2026-11-02.md`：
- §3 渲染：更新为 iTwin 默认材质/灯光（保留白底/边线/AO 关）。
- §3 拾取：删除三模式描述，改为统一工具与 owner 语义。
- §4 显示默认：AO 关。
- 选择组入口描述：右键模式组已删除。

`luban-cad/CLAUDE.md`：
- Editor 状态行更新：统一 Onshape 选择工具、默认渲染基线、editor 基座两处修复（cleanup finishCommand / wantGeometry 按需）。

- [ ] **Step 2: 全量单测与静态检查**

Run:

```bash
cd luban-cad/packages/viewer && npx vitest run
cd luban-cad/packages/editor/frontend && npx vitest run
cd luban-cad/apps/web && npx vitest run
cd luban-cad/apps/web && npx tsc --noEmit
cd luban-cad/apps/web && npm run lint
```

Expected: 全部 PASS（若既有历史红如 `sketch-extrude` 属 e2e，不在本步范围；单测不得新增红）。

- [ ] **Step 3: 全量 e2e（按栈预算）**

Run:

```bash
cd luban-cad/apps/web && npx playwright test
```

Expected: 全绿；若限流 429，先重启 MS/等待窗口再跑（`docs`/memory 已知：100 req/15min）。

- [ ] **Step 4: 栈验收**

Run: `powershell -File scripts/verify-stack.ps1`

Expected: 全绿（17/17 或当前基线数）。

- [ ] **Step 5: 提交文档与收口**

```bash
git add docs/BREP-RENDERING-2026-11-03.md docs/UI-ONSHAPE-PARITY-2026-11-02.md \
  luban-cad/CLAUDE.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: record iTwin default render and Onshape selection

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## 自检结果

- **Spec coverage**：渲染默认值/白底/BRep 边/AO 关/MSAA 4（Task 1）；editor 命令收口与几何按需（Task 2）；统一工具、全类型、跨 body、优先级、点击语义（Task 3-4）；默认工具/暂停生命周期（Task 5）；命令协调（Task 6）；移除模式、接线页面/零件列表/owner（Task 7）；e2e/视觉（Task 8）；文档/门禁（Task 9）。
- **Placeholder scan**：无 TBD/TODO/“添加适当错误处理”等占位；所有测试与实现步骤均含可执行代码或明确文件/行操作。
- **Type consistency**：`OnshapeSelectTool`/`OnshapeSelectOptions`/`onSelectionChanged`/`clearSelection`/`pause`/`resume`/`suspendForCommand`/`resumeAfterCommand` 在 Task 3-7 中命名一致；`useCanvasBodySelection(connection, bodies)`、`brepOverlayOptionsFor(settings)`、`withExclusiveBrepCommand` 在 Task 6-8 中一致；`CanvasSelection.id` 含 owner 的格式在 Task 4、Task 7 测试中一致。
