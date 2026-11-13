// src/modules/part-studio/test/ribbon-registry.test.ts
//
// M3 Task 4（brief Step 1）：工具 ribbon 注册表完整性——
//  1) 27 工具全在册（2026-11-13 live 全量对拍顺序；id 校准原则：已有真实
//     iTwin 工具的沿用旧应用 toolId——SweepFaces/RoundEdges/ChamferEdges/
//     HollowFaces/MirrorElements/LinearPattern；DraftFaces/CreateHole 已翻
//     gated（X-01，后端无命令），未接线的用 Onshape command-id——
//     newSketch/extrude/…/USER_FEATURES）；
//  2) 9 个下拉飞菜单全在册（2026-11-13 live：加厚/圆角/拔模/线性阵列/变换/
//     平面/框架/钣金模型/添加自定义特征），平面▾ 25 项与 live 逐字一致；
//  3) 快捷键（os-11 title 属性：草图 shift+s / 拉伸 shift+e / 旋转 shift+w /
//     圆角 shift+f）；
//  4) 能力校准（T2 挂账「gated toolId 暂定命名待 T4 校准」）：注册表引用的
//     capability 键全量入册 TOOL_CAPABILITIES；gated 家族（draft/shell/
//     thread/frames/sheetMetal/surfaces/curves）经 isGated 路由能力引导；
//  5) labelKey 全挂 partStudio.ribbon.* 前缀，且在 zh/en 词库真实存在
//     （含 CAPABILITY_GUIDANCE 的 14 组引导键——T4 对话框首消费）。
//
// 定位：纯注册表枚举断言（无组件/RPC），钉死 ribbon 渲染层与命令搜索的
// 数据源契约。

import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_GUIDANCE,
  TOOL_CAPABILITIES,
  isGated,
} from '../internal/capabilities.js';
import {
  RIBBON_GROUP_ORDER,
  RIBBON_TOOLS,
  allRibbonCommands,
  findRibbonCommand,
} from '../ribbon/ribbon-registry.js';
import type { RibbonCommand, RibbonGroup, RibbonTool } from '../ribbon/ribbon-registry.js';
import zhPartStudio from '../../../common/i18n/locales/zh-CN/part-studio.json';
import enPartStudio from '../../../common/i18n/locales/en/part-studio.json';

/** os-11 工具顺序（dom-toolbar.html command-id 序列；8 个旧应用真实 toolId 已校准）。 */
const EXPECTED_TOOL_IDS = [
  'newSketch', // 草图 (shift+s)
  'extrude', // 拉伸 (shift+e)
  'revolve', // 旋转 (shift+w)
  'SweepFaces', // 扫掠（旧应用真实 toolId）
  'loft', // 放样
  'thicken', // 加厚 ▾
  'RoundEdges', // 圆角 (shift+f)（旧应用真实 toolId）▾
  'ChamferEdges', // 倒角（旧应用真实 toolId）
  'DraftFaces', // 拔模（X-01 起 gated 引导）▾
  'rib', // 筋（2026-11-02 live 工具栏补齐）
  'HollowFaces', // 抽壳（旧应用真实 toolId）
  'CreateHole', // 孔（X-01 起 gated 引导）
  'externalThread', // 外部螺纹
  'LinearPattern', // 线性阵列（旧应用真实 toolId）▾
  'MirrorElements', // 镜像（旧应用真实 toolId）
  'booleanBodies', // 布尔运算
  'splitPart', // 分割
  'transform', // 变换 ▾
  'deleteBodies', // 删除零件
  'modifyFillet', // 修改圆角
  'deleteFace', // 删除面
  'moveFace', // 移动面
  'replaceFace', // 替换面
  'cPlane', // 平面
  'frame', // 框架 ▾
  'sheetMetalStart', // 钣金模型 ▾
  'USER_FEATURES', // 添加自定义特征
] as const;

/** os-11 分组顺序（toolset-seperator 切分；选择组随默认选择工具退役）。 */
const EXPECTED_GROUP_ORDER: RibbonGroup[] = [
  'sketch',
  'create',
  'shape',
  'pattern',
  'combine',
  'directEdit',
  'reference',
  'frames',
  'sheetMetal',
  'custom',
];

/** os-20 采集的 8 个下拉飞菜单 → 子项 id 清单（键=校准后注册表 toolId）。 */
const EXPECTED_DROPDOWNS: Record<string, string[]> = {
  thicken: ['thickenClosed'], // 加厚/封闭
  RoundEdges: ['faceBlend'], // 圆角/面混合
  DraftFaces: ['bodyDraft'], // 拔模/主体拔模
  LinearPattern: ['CircularPattern', 'curvePattern'], // 线性/环形（真实直改 toolId）/曲线阵列
  transform: ['wrap', 'decal'], // 变换/包覆/印花
  frame: ['frameTrim', 'gusset', 'endCap', 'cutList'], // 框架/框架修剪/角撑板/端盖/切割清单
  // 2026-11-13 live：钣金模型 ▾ 11 项（无 SMJog/PCB 项，含角点）。
  sheetMetalStart: [
    'flange', 'hem', 'tab', 'smBend', 'forming', 'sheetMetalLoft',
    'smJoint', 'corner', 'bendRelief', 'cornerBreak', 'endSheetMetal',
  ],
  // 2026-11-13 live：平面 ▾ 25 项（曲面/曲线/装配参考全量，顺序逐字）。
  cPlane: [
    'offsetSurface', 'boundarySurface', 'fillSurface', 'moveBoundary',
    'ruledSurface', 'mutualTrim', 'constraintSurface', 'helix', 'fitSpline3d',
    'projectCurve', 'bridgeCurve', 'compositeCurve', 'intersectionCurve',
    'trimCurve', 'isoline', 'offsetCurve', 'isoparametricCurve', 'editCurve',
    'routeCurve', 'mateConnector', 'derived', 'variable', 'queryVariable',
    'compositePart', 'tag',
  ],
  USER_FEATURES: [], // 添加自定义特征 ▾（文档自定义特征为 FeatureScript 运行时，未接）
};

/** os-11 title 属性钉死的四枚快捷键。 */
const EXPECTED_SHORTCUTS: Record<string, string> = {
  newSketch: 'shift+s',
  extrude: 'shift+e',
  revolve: 'shift+w',
  RoundEdges: 'shift+f',
};

/** spec §5 初始 gated 集合在 ribbon 上的家族键（capability 维度）。 */
const GATED_CAPABILITIES = [
  'draft', // 拔模
  'thread', // 外部螺纹
  'frames', // 框架系
  'sheetMetal', // 钣金系
  'surfaces', // 曲面系
  'curves', // 曲线系
] as const;

/** 词库取值：按点路径走 JSON（partStudio. 前缀为 i18n 挂载点，词库内不含）。 */
function lookup(dict: unknown, dottedPath: string): unknown {
  let node: unknown = dict;
  for (const segment of dottedPath.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** 注册表引用的全部 i18n 键（工具/子项 labelKey + 引导键），去重。 */
function registryI18nKeys(): string[] {
  const keys = new Set<string>();
  for (const tool of RIBBON_TOOLS) {
    keys.add(tool.labelKey);
    for (const item of tool.dropdownItems ?? []) keys.add(item.labelKey);
  }
  for (const guidance of Object.values(CAPABILITY_GUIDANCE)) {
    keys.add(guidance.titleKey);
    keys.add(guidance.messageKey);
  }
  keys.add('partStudio.capability.close');
  return [...keys];
}

describe('RIBBON_TOOLS 注册表完整性（27 工具，2026-11-13 live 顺序）', () => {
  it('恰为 27 工具且 id 集合与顺序全对齐取证清单', () => {
    expect(RIBBON_TOOLS).toHaveLength(27);
    expect(RIBBON_TOOLS.map((tool) => tool.id)).toEqual([...EXPECTED_TOOL_IDS]);
  });

  it('工具 id 唯一（命令搜索/激活路由依赖唯一性）', () => {
    const ids = RIBBON_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('labelKey 全挂 partStudio.ribbon.* 前缀且非空', () => {
    for (const tool of RIBBON_TOOLS) {
      expect(tool.labelKey.startsWith('partStudio.ribbon.')).toBe(true);
      expect(tool.labelKey.length).toBeGreaterThan('partStudio.ribbon.'.length);
    }
  });
});

describe('RIBBON_GROUP_ORDER 分组（os-11 分隔序）', () => {
  it('分组顺序与取证一致，工具按其分组有序排列', () => {
    expect(RIBBON_GROUP_ORDER).toEqual(EXPECTED_GROUP_ORDER);
    const actualOrder = RIBBON_TOOLS.map((tool) => tool.group);
    const sortedByGroup = [...RIBBON_TOOLS]
      .sort((a, b) => EXPECTED_GROUP_ORDER.indexOf(a.group) - EXPECTED_GROUP_ORDER.indexOf(b.group))
      .map((tool: RibbonTool) => tool.group);
    expect(actualOrder).toEqual(sortedByGroup);
  });

  // M6-c T5：分组序权威升级——diag-tools.json（2026-10-23 Tutorial 2 主工具栏
  // 实测）的 11 组序逐组钉死。工具名取注册表 labelKey 的 zh 词库值，与采集
  // 逐组对账；筋 2026-11-02 已入册，2026-11-13 起无自创分组。
  const ONSHAPE_GROUP_SEQUENCE: ReadonlyArray<readonly [group: RibbonGroup, labels: readonly string[]]> = [
    ['sketch', ['草图']],
    ['create', ['拉伸', '旋转', '扫掠', '放样', '加厚']],
    ['shape', ['圆角', '倒角', '拔模', '筋', '抽壳', '孔', '外部螺纹']],
    ['pattern', ['线性阵列', '镜像']],
    ['combine', ['布尔运算', '分割', '变换', '删除零件']],
    ['directEdit', ['修改圆角', '删除面', '移动面', '替换面']],
    ['reference', ['平面']],
    ['frames', ['框架']],
    ['sheetMetal', ['钣金模型']],
    ['custom', ['添加自定义特征']],
  ];

  it('diag-tools.json 11 组序逐组对齐（组界+组内序，zh 可访问名）', () => {
    const labelOf = (tool: RibbonTool): string => {
      const localPath = tool.labelKey.replace(/^partStudio\./, '');
      const value = lookup(zhPartStudio, localPath);
      expect(typeof value).toBe('string');
      return value as string;
    };
    for (const [group, labels] of ONSHAPE_GROUP_SEQUENCE) {
      const tools = RIBBON_TOOLS.filter((tool) => tool.group === group);
      expect(
        tools.map(labelOf),
        `分组 ${group} 的组内序与 diag-tools.json 不一致`,
      ).toEqual([...labels]);
    }
    // 2026-11-13：不再有本仓自创分组——末组即 live 的自定义特征。
    expect(RIBBON_TOOLS[RIBBON_TOOLS.length - 1]!.group).toBe('custom');
    expect(RIBBON_GROUP_ORDER[RIBBON_GROUP_ORDER.length - 1]).toBe('custom');
  });
});

describe('下拉飞菜单（9 个：2026-11-13 live 全量）', () => {
  it('恰为 9 个带 dropdownItems 的工具，id 集合对齐', () => {
    const dropdownTools = RIBBON_TOOLS.filter((tool) => tool.dropdownItems !== undefined);
    expect(dropdownTools.map((tool) => tool.id).sort()).toEqual(Object.keys(EXPECTED_DROPDOWNS).sort());
  });

  it.each(Object.entries(EXPECTED_DROPDOWNS))('%s 的子项清单与 os-20 证据一致', (toolId, itemIds) => {
    const tool = RIBBON_TOOLS.find((entry) => entry.id === toolId);
    expect(tool?.dropdownItems?.map((item) => item.id)).toEqual(itemIds);
  });

  it('子项 id 在所属飞菜单内唯一，labelKey 挂 partStudio.ribbon.* 前缀', () => {
    for (const tool of RIBBON_TOOLS) {
      const ids = tool.dropdownItems?.map((item) => item.id) ?? [];
      expect(new Set(ids).size).toBe(ids.length);
      for (const item of tool.dropdownItems ?? []) {
        expect(item.labelKey.startsWith('partStudio.ribbon.')).toBe(true);
      }
    }
  });
});

describe('快捷键（os-11 title 属性）', () => {
  it('草图/拉伸/旋转/圆角四枚快捷键在册，其余工具不挂快捷键', () => {
    for (const tool of RIBBON_TOOLS) {
      expect(tool.shortcut ?? null).toBe(EXPECTED_SHORTCUTS[tool.id] ?? null);
    }
  });
});

describe('能力校准（T2 挂账收口：capability 键全量入册）', () => {
  it('注册表引用的每个 capability 键（工具+子项）均登记在 TOOL_CAPABILITIES', () => {
    const referenced = new Set<string>();
    for (const tool of RIBBON_TOOLS) {
      referenced.add(tool.capability);
      for (const item of tool.dropdownItems ?? []) referenced.add(item.capability);
    }
    for (const key of referenced) {
      expect(TOOL_CAPABILITIES[key], `capability 键 ${key} 未入册`).toBeDefined();
    }
  });

  it('gated 家族工具/子项经 isGated 路由能力引导', () => {
    const gatedTools = RIBBON_TOOLS.filter((tool) => isGated(tool.capability));
    expect(gatedTools.map((tool) => tool.id).sort()).toEqual([
      'DraftFaces', 'USER_FEATURES', 'deleteBodies', 'deleteFace', 'externalThread', 'frame',
      'modifyFillet', 'replaceFace', 'rib', 'sheetMetalStart', 'thicken',
    ].sort());
    for (const capability of GATED_CAPABILITIES) {
      expect(isGated(capability)).toBe(true);
    }
  });

  it('full 锚点与既有建模工具面不 gated', () => {
    for (const id of ['sketch', 'extrude', 'fillet', 'chamfer', 'sweep', 'mirror', 'linearPattern', 'boolean']) {
      expect(isGated(id)).toBe(false);
    }
  });

  it('平面▾ 的曲面/曲线子项 capability 分挂 surfaces/curves', () => {
    const cPlane = RIBBON_TOOLS.find((tool) => tool.id === 'cPlane');
    const byCapability = new Map(
      (cPlane?.dropdownItems ?? []).map((item) => [item.id, item.capability]),
    );
    expect(byCapability.get('offsetSurface')).toBe('surfaces');
    expect(byCapability.get('helix')).toBe('curves');
    expect(byCapability.get('mateConnector')).toBe('mateConnector');
  });
});

describe('命令查找辅助（palette 数据源）', () => {
  it('findRibbonCommand：工具与子项均可寻址，未知 id 返回 undefined', () => {
    expect(findRibbonCommand('RoundEdges')?.labelKey).toBe('partStudio.ribbon.tools.fillet.label');
    expect(findRibbonCommand('faceBlend')?.capability).toBe('fillet');
    expect(findRibbonCommand('nope')).toBeUndefined();
  });

  it('allRibbonCommands 展开工具+全部子项（27+47=74 条命令）', () => {
    const all = allRibbonCommands();
    expect(all).toHaveLength(74);
    // 工具保序：展开序中过滤回顶层工具，仍等于 os-11 工具序列。
    const toolIds = all
      .filter((command) => (RIBBON_TOOLS as readonly RibbonCommand[]).includes(command))
      .map((command) => command.id);
    expect(toolIds).toEqual([...EXPECTED_TOOL_IDS]);
  });
});

describe('词库存在性守卫（zh/en 同键集，i18n 展平深比较的第一道闸）', () => {
  it.each(registryI18nKeys())('键 %s 在 zh-CN/en 词库均存在且非空', (key) => {
    const localPath = key.replace(/^partStudio\./, '');
    const zh = lookup(zhPartStudio, localPath);
    const en = lookup(enPartStudio, localPath);
    expect(typeof zh).toBe('string');
    expect((zh as string).length).toBeGreaterThan(0);
    expect(typeof en).toBe('string');
    expect((en as string).length).toBeGreaterThan(0);
  });
});
