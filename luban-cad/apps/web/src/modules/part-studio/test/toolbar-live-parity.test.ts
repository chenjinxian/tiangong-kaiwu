/**
 * 工具栏 live 全量对拍（2026-11-13）——数据源私有
 * `onshape-parity-data/ui-evidence/toolbar-audit-20261113/`：
 * 12-tooltips.json（主钮 tooltip+快捷键）、15-dropdowns.json（特征飞菜单）、
 * 21/22（草图工具栏与飞菜单）。本测试把主钮文案/快捷键与各飞菜单
 * （父行文案 + 变体顺序 + keycap）逐字钉死，防止再次漂移或自创。
 */
import { describe, expect, it } from 'vitest';

import {
  RIBBON_TOOLS,
  type RibbonTool,
} from '../ribbon/ribbon-registry.js';
import { SKETCH_RIBBON_TOOLS, type SketchRibbonTool } from '../ribbon/sketch-tools.js';
import zhPartStudio from '../../../common/i18n/locales/zh-CN/part-studio.json';

function lookup(dict: unknown, dottedPath: string): unknown {
  let node: unknown = dict;
  for (const segment of dottedPath.split('.')) {
    if (node == null || typeof node !== 'object')
      return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

function zh(key: string): string {
  const value = lookup(zhPartStudio, key.replace(/^partStudio\./, ''));
  if (typeof value !== 'string')
    throw new Error(`词库缺少 ${key}`);
  return value;
}

interface MenuRowSpec {
  label: string;
  shortcut?: string;
}

function featureMenu(tool: RibbonTool): MenuRowSpec[] {
  const parent: MenuRowSpec = {
    label: zh(tool.menuLabelKey ?? tool.labelKey),
    ...(tool.shortcut ? { shortcut: tool.shortcut } : {}),
  };
  return [
    parent,
    ...(tool.dropdownItems ?? []).map((item) => ({
      label: zh(item.labelKey),
      ...(item.shortcut ? { shortcut: item.shortcut } : {}),
    })),
  ];
}

function sketchMenu(tool: SketchRibbonTool): MenuRowSpec[] {
  const parent: MenuRowSpec = {
    label: zh(tool.menuLabelKey ?? tool.labelKey),
    ...(tool.shortcut ? { shortcut: tool.shortcut } : {}),
  };
  return [
    parent,
    ...(tool.dropdownItems ?? []).map((item) => ({
      label: zh(item.labelKey),
      ...(item.shortcut ? { shortcut: item.shortcut } : {}),
    })),
  ];
}

describe('特征工具栏（live 2026-11-13 27 钮）', () => {
  it('主钮可见文案与 live 逐字一致', () => {
    expect(RIBBON_TOOLS.map((tool) => zh(tool.labelKey))).toEqual([
      '草图', '拉伸', '旋转', '扫掠', '放样', '加厚', '圆角', '倒角', '拔模', '筋',
      '抽壳', '孔', '外部螺纹', '线性阵列', '镜像', '布尔运算', '分割', '变换',
      '删除零件', '修改圆角', '删除面', '移动面', '替换面', '平面', '框架',
      '钣金模型', '添加自定义特征',
    ]);
  });

  it('主钮 tooltip 与快捷键与 live 一致（草图 tooltip=创建新草图；四枚 keycap）', () => {
    const tipOf = (tool: RibbonTool) => zh(tool.tooltipKey ?? tool.labelKey);
    expect(tipOf(RIBBON_TOOLS[0]!)).toBe('创建新草图');
    expect(RIBBON_TOOLS.filter((tool) => tool.shortcut).map((tool) => [tipOf(tool), tool.shortcut])).toEqual([
      ['创建新草图', 'shift+s'],
      ['拉伸', 'shift+e'],
      ['旋转', 'shift+w'],
      ['圆角', 'shift+f'],
    ]);
  });

  it('9 个飞菜单父行+子项文案/快捷键与 live 逐字一致', () => {
    const menus = Object.fromEntries(
      RIBBON_TOOLS.filter((tool) => tool.dropdownItems !== undefined)
        .map((tool) => [tool.id, featureMenu(tool)]),
    );
    expect(menus).toEqual({
      thicken: [{ label: '加厚' }, { label: '封闭' }],
      RoundEdges: [{ label: '圆角', shortcut: 'shift+f' }, { label: '面混合' }],
      DraftFaces: [{ label: '拔模' }, { label: '主体拔模' }],
      LinearPattern: [{ label: '线性阵列' }, { label: '环形阵列' }, { label: '曲线阵列' }],
      transform: [{ label: '变换' }, { label: '包覆' }, { label: '印花' }],
      cPlane: [
        { label: '平面' },
        { label: '偏移曲面' }, { label: '边界曲面' }, { label: '填充' },
        { label: '移动边界' }, { label: '直纹曲面' }, { label: '相互修剪' },
        { label: '约束曲面' }, { label: '螺旋' }, { label: '3D 拟合样条' },
        { label: '投影曲线' }, { label: '桥接曲线' }, { label: '复合曲线' },
        { label: '交点曲线' }, { label: '修剪曲线' }, { label: '等斜线' },
        { label: '偏移曲线' }, { label: '等参曲线' }, { label: '编辑曲线' },
        { label: '路线曲线' }, { label: '配合连接器', shortcut: 'ctrl+m' },
        { label: '派生' }, { label: '变量' }, { label: '查询变量' },
        { label: '复合零件' }, { label: '标记' },
      ],
      frame: [
        { label: '框架' }, { label: '框架修剪' }, { label: '角撑板' },
        { label: '端盖' }, { label: '切割清单' },
      ],
      sheetMetalStart: [
        { label: '钣金模型' }, { label: '法兰' }, { label: '卷边' },
        { label: '薄片' }, { label: '折弯' }, { label: '成型' },
        { label: '钣金放样' }, { label: '制作接头' }, { label: '角点' },
        { label: '折弯止裂槽' }, { label: '尖角倒钝' }, { label: '结束钣金模型' },
      ],
      USER_FEATURES: [{ label: '添加自定义特征' }],
    });
  });
});

describe('草图工具栏（live 2026-11-13 20 钮）', () => {
  it('主钮文案与快捷键逐字一致（含 4 处工具栏/菜单文案差异的工具栏侧）', () => {
    expect(SKETCH_RIBBON_TOOLS.map((tool) => [zh(tool.labelKey), tool.shortcut ?? null])).toEqual([
      ['拉伸', 'shift+e'], ['旋转', 'shift+w'],
      ['线', 'l'], ['拐角矩形', 'g'], ['中心点圆', 'c'], ['三点圆弧', 'a'],
      ['内接多边形', null], ['样条', null], ['点', 'shift+s'], ['文本', null],
      ['使用（投影/转换）', 'u'], ['构造', 'q'],
      ['草图圆角', 'shift+f'], ['修剪', 'm'], ['偏移', 'o'], ['镜像', null],
      ['线性阵列', null], ['插入 DXF 或 DWG', null],
      ['尺寸', 'd'], ['重合', 'i'],
    ]);
  });

  it('12 个飞菜单父行+子项文案/快捷键与 live 逐字一致', () => {
    const menus = Object.fromEntries(
      SKETCH_RIBBON_TOOLS.filter((tool) => tool.dropdownItems !== undefined)
        .map((tool) => [tool.id, sketchMenu(tool)]),
    );
    expect(menus).toEqual({
      'Sketch.Line': [{ label: '线', shortcut: 'l' }, { label: '中点线' }],
      'Sketch.Rectangle': [
        { label: '拐角矩形', shortcut: 'g' }, { label: '中心点矩形', shortcut: 'r' }, { label: '对齐矩形' },
      ],
      'Sketch.CenterCircle': [
        { label: '中心点圆', shortcut: 'c' }, { label: '3 点圆' }, { label: '椭圆' },
      ],
      'Sketch.Arc3Point': [
        { label: '3 点圆弧', shortcut: 'a' }, { label: '相切圆弧' }, { label: '圆心圆弧' },
        { label: '椭圆弧' }, { label: '圆锥' },
      ],
      sketchInscribedPolygon: [{ label: '内切多边形' }, { label: '外接多边形' }],
      'Sketch.Spline': [{ label: '样条' }, { label: 'Bezier' }, { label: '样条控制点' }],
      sketchUse: [{ label: '使用', shortcut: 'u' }, { label: '交点' }],
      sketchFillet: [{ label: '圆角', shortcut: 'shift+f' }, { label: '倒角' }],
      sketchTrim: [{ label: '修剪', shortcut: 'm' }, { label: '延伸', shortcut: 'x' }, { label: '分割' }],
      'Sketch.Offset': [{ label: '偏移', shortcut: 'o' }, { label: '槽' }],
      sketchLinearPattern: [{ label: '线性阵列' }, { label: '环形阵列' }, { label: '变换' }],
      sketchInsertDxf: [{ label: '插入 DXF 或 DWG' }, { label: '插入图像' }],
      'Sketch.Constraint.Coincident': [
        { label: '重合', shortcut: 'i' },
        { label: '同心', shortcut: 'shift+o' },
        { label: '平行', shortcut: 'b' },
        { label: '相切', shortcut: 't' },
        { label: '水平', shortcut: 'h' },
        { label: '竖直', shortcut: 'v' },
        { label: '垂直', shortcut: 'shift+l' },
        { label: '等长', shortcut: 'e' },
        { label: '中点', shortcut: 'shift+m' },
        { label: '法向', shortcut: 'shift+k' },
        { label: '穿透', shortcut: 'shift+g' },
        { label: '对称', shortcut: 'shift+q' },
        { label: '固定', shortcut: 'shift+j' },
        { label: '曲率', shortcut: 'shift+u' },
        { label: '草图流' },
      ],
    });
  });
});
