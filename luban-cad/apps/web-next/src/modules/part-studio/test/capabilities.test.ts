// src/modules/part-studio/test/capabilities.test.ts
//
// M3 Task 2（brief Step 1）：能力注册表——完整 UI 面的落地机制（spec §5）：
//  1) 初始 gated 集合精确等于 spec §5 钉死的 12 项（材料/外观与曲面/曲线
//     各拆两条注册，共 14 个 toolId）；T5 起画布右键「显示依赖项…」登记
//     dependencies（依赖项查看器无后端面，gated 引导），集合扩至 15；
//  2) isGated：gated 项为 true；full 项与未登记项为 false（完整 UI 面——
//     未登记默认 full，只有显式 gated 才走能力引导）；
//  3) CAPABILITY_GUIDANCE：每个 gated 工具都有引导文案 i18n 键
//     （titleKey/messageKey 成对、非空、挂 partStudio.capabilities.<id> 前缀）；
//  4) 不变式：GUIDANCE 的键集 === gated 键集（引导与门严格同步，翻转
//     gated→full 时数据变更即自洽）。
//
// 定位：纯注册表枚举断言（无组件/RPC），钉死后续 ribbon（T4）/能力
// 引导对话框（T5+）消费的契约面。

import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_GUIDANCE,
  TOOL_CAPABILITIES,
  isGated,
} from '../internal/capabilities.js';

/** spec §5 初始 gated 集合（材料/外观、曲面/曲线各两条，共 14）+ T5 登记 dependencies（共 15）
 * + T7 汉堡文档菜单（os-24）登记 moveDocument/restoreWorkspace/copyWorkspace/
 * updateWorkspace/workspaceProperties（共 20）
 * + M4-T8 D3 特征段头三钮（os-11 段头形态）登记 insertElement/pauseRebuild/
 * featureHistory（共 23）。 */
const EXPECTED_GATED_IDS = [
  'draft', // 拔模
  'shell', // 抽壳
  'thread', // 外部螺纹
  'sheetMetal', // 钣金系
  'frames', // 框架系
  'surfaces', // 曲面系
  'curves', // 曲线系
  'render', // 渲染
  'drawing', // 工程图
  'material', // 材料
  'appearance', // 外观
  'notifications', // 通知
  'print', // 打印
  'assemblyEdit', // 装配体编辑
  'dependencies', // 依赖项查看（T5 画布右键「显示依赖项…」登记）
  'moveDocument', // 移至…（T7 汉堡菜单）
  'restoreWorkspace', // 还原已删除的工作区…（T7 汉堡菜单）
  'copyWorkspace', // 复制工作区…（T7 汉堡菜单）
  'updateWorkspace', // 更新工作区…（T7 汉堡菜单）
  'workspaceProperties', // 工作区属性…（T7 汉堡菜单）
  'insertElement', // 插入元素（M4-T8 D3 特征段头钮）
  'pauseRebuild', // 暂停重建（M4-T8 D3 特征段头钮）
  'featureHistory', // 特征历史（M4-T8 D3 特征段头钮）
] as const;

describe('TOOL_CAPABILITIES 初始 gated 集合（spec §5）', () => {
  it('gated 键集精确等于 spec 钉死集合（14）+ T5 dependencies + T7 五项 + M4-T8 三项（共 23，不多不少）', () => {
    const gatedIds = Object.keys(TOOL_CAPABILITIES)
      .filter((id) => TOOL_CAPABILITIES[id] === 'gated')
      .sort();
    expect(gatedIds).toEqual([...EXPECTED_GATED_IDS].sort());
  });

  it('注册值只取 full | gated 二值', () => {
    for (const capability of Object.values(TOOL_CAPABILITIES)) {
      expect(['full', 'gated']).toContain(capability);
    }
  });
});

describe('isGated', () => {
  it.each(EXPECTED_GATED_IDS)('gated 项 %s → true', (toolId) => {
    expect(isGated(toolId)).toBe(true);
  });

  it('显式 full 项（已有建模工具面）→ false', () => {
    expect(isGated('sketch')).toBe(false);
    expect(isGated('extrude')).toBe(false);
    expect(isGated('fillet')).toBe(false);
    expect(isGated('chamfer')).toBe(false);
  });

  it('未登记工具默认 full（完整 UI 面：不灰化不删减）', () => {
    expect(isGated('someFutureTool')).toBe(false);
    expect(isGated('')).toBe(false);
  });
});

describe('CAPABILITY_GUIDANCE 引导文案键', () => {
  it('每个 gated 工具都有 titleKey/messageKey 成对引导键', () => {
    for (const toolId of EXPECTED_GATED_IDS) {
      const guidance = CAPABILITY_GUIDANCE[toolId];
      expect(guidance, `缺少 ${toolId} 的引导`).toBeDefined();
      expect(guidance?.titleKey).toBe(`partStudio.capabilities.${toolId}.title`);
      expect(guidance?.messageKey).toBe(`partStudio.capabilities.${toolId}.message`);
    }
  });

  it('引导键以 partStudio.capabilities 前缀命名且非空', () => {
    for (const guidance of Object.values(CAPABILITY_GUIDANCE)) {
      expect(guidance.titleKey.startsWith('partStudio.capabilities.')).toBe(true);
      expect(guidance.messageKey.startsWith('partStudio.capabilities.')).toBe(true);
      expect(guidance.titleKey.endsWith('.title')).toBe(true);
      expect(guidance.messageKey.endsWith('.message')).toBe(true);
    }
  });

  it('不变式：GUIDANCE 键集 === gated 键集（引导与门严格同步）', () => {
    const gatedIds = Object.keys(TOOL_CAPABILITIES)
      .filter((id) => TOOL_CAPABILITIES[id] === 'gated')
      .sort();
    expect(Object.keys(CAPABILITY_GUIDANCE).sort()).toEqual(gatedIds);
  });
});
