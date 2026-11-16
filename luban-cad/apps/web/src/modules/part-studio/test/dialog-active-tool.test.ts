/**
 * W29（live 2026-11-17）：特征对话框 → ribbon 主钮激活态的映射。
 *
 * live 证据：点「拉伸」/「圆角」主钮打开特征对话框时主钮带 is-active（对话框
 * 关闭即消失）；线性阵列飞菜单选「环形阵列」开圆周阵列对话框时组主钮（标签
 * 环形阵列）保持 is-active。对话框路由不写 store.tool.activeToolId，故主钮
 * 高亮须由 dialog 切片派生。
 *
 * 映射纪律：只有「有 toolbar 等价物」的对话框才映射；featurePattern /
 * featureMirror / faceExtrude / thicken 等无主钮等价物 → undefined（不伪造
 * 高亮）。edit 模式携带的 featureType 是树条目类型，pattern 编辑态不携带
 * kind → undefined（不猜线性，避免错误高亮；live 编辑态高亮未采）。
 */
import { describe, expect, it } from 'vitest';
import type { LubanFeatureType } from '@luban-cad/shared';
import { activeToolIdForDialog } from '../internal/dialog-active-tool.js';
import { findRibbonCommand } from '../ribbon/ribbon-registry.js';
import type { PartStudioDialogState } from '../types.js';

function newDialog(
  featureType: LubanFeatureType,
  patternKind?: 'linear' | 'circular',
): PartStudioDialogState {
  return {
    active: 'feature',
    mode: 'new',
    featureType,
    ...(patternKind === undefined ? {} : { patternKind }),
  };
}

function editDialog(featureType: string): PartStudioDialogState {
  return {
    active: 'feature',
    mode: 'edit',
    featureId: 'feature-1',
    featureName: '特征 1',
    featureType,
  };
}

describe('activeToolIdForDialog：new 对话框 → ribbon 工具 id', () => {
  const mapped: ReadonlyArray<readonly [LubanFeatureType, string]> = [
    ['extrude', 'extrude'],
    ['revolve', 'revolve'],
    ['fillet', 'RoundEdges'],
    ['chamfer', 'ChamferEdges'],
    ['hole', 'CreateHole'],
    ['shell', 'HollowFaces'],
    ['cPlane', 'cPlane'],
    ['loft', 'loft'],
    ['sweep', 'SweepFaces'],
    ['mirror', 'MirrorElements'],
    ['booleanBodies', 'booleanBodies'],
    ['transform', 'transform'],
    ['splitPart', 'splitPart'],
    ['moveFace', 'moveFace'],
  ];

  for (const [featureType, toolId] of mapped) {
    it(`${featureType} → ${toolId}（工具 id 在 ribbon 注册表可寻址）`, () => {
      expect(activeToolIdForDialog(newDialog(featureType))).toBe(toolId);
      // 防止注册表 id 改名后映射静默失联（高亮永远不出现）。
      expect(findRibbonCommand(toolId)?.id).toBe(toolId);
    });
  }
});

describe('activeToolIdForDialog：pattern 的 kind 分派', () => {
  it('new/linear → LinearPattern', () => {
    expect(activeToolIdForDialog(newDialog('pattern', 'linear'))).toBe('LinearPattern');
  });

  it('new 无 patternKind（缺省 linear）→ LinearPattern', () => {
    expect(activeToolIdForDialog(newDialog('pattern'))).toBe('LinearPattern');
  });

  it('new/circular → CircularPattern', () => {
    expect(activeToolIdForDialog(newDialog('pattern', 'circular'))).toBe('CircularPattern');
  });

  it('edit/pattern（edit 态不携带 kind）→ undefined（不猜线性，避免错误高亮）', () => {
    expect(activeToolIdForDialog(editDialog('pattern'))).toBeUndefined();
  });
});

describe('activeToolIdForDialog：edit 对话框', () => {
  it('edit 映射类型同样高亮（树行双击编辑 extrude → 拉伸）', () => {
    expect(activeToolIdForDialog(editDialog('extrude'))).toBe('extrude');
    expect(activeToolIdForDialog(editDialog('fillet'))).toBe('RoundEdges');
    expect(activeToolIdForDialog(editDialog('chamfer'))).toBe('ChamferEdges');
  });
});

describe('activeToolIdForDialog：无 toolbar 等价物 → undefined（不伪造高亮）', () => {
  const unmappedNew: readonly LubanFeatureType[] = [
    'featurePattern',
    'featureMirror',
    'faceExtrude',
    'booleanAdd',
    'booleanSubtract',
  ];

  for (const featureType of unmappedNew) {
    it(`new/${featureType} → undefined`, () => {
      expect(activeToolIdForDialog(newDialog(featureType))).toBeUndefined();
    });
  }

  it('edit/featurePattern、edit/featureMirror、edit/faceExtrude、edit/thicken、未知类型 → undefined', () => {
    expect(activeToolIdForDialog(editDialog('featurePattern'))).toBeUndefined();
    expect(activeToolIdForDialog(editDialog('featureMirror'))).toBeUndefined();
    expect(activeToolIdForDialog(editDialog('faceExtrude'))).toBeUndefined();
    expect(activeToolIdForDialog(editDialog('thicken'))).toBeUndefined();
    expect(activeToolIdForDialog(editDialog('somethingNew'))).toBeUndefined();
  });

  it('无对话框/草图对话框 → undefined', () => {
    expect(activeToolIdForDialog({ active: null })).toBeUndefined();
    expect(activeToolIdForDialog({ active: 'sketch', sketchId: null })).toBeUndefined();
    expect(activeToolIdForDialog({ active: 'sketch', sketchId: 'sk-1' })).toBeUndefined();
  });
});
