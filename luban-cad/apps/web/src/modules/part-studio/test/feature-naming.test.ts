/**
 * C1：新建特征默认命名（`<类型> <同类条目数+1>`，2026-11-16 Onshape 对齐）。
 * 纯函数验收：每类型独立计数、空树 → 1、无关类型忽略、编号缺口复用（count+1），
 * 以及词条键覆盖全部新建路由类型（词条值与 zh-CN 词库的一致性由宿主集成测试覆盖）。
 */
import { describe, expect, it, vi } from 'vitest';
import { NEW_FEATURE_LABEL_KEYS, nextFeatureName } from '../internal/feature-naming.js';

const LABELS: Readonly<Record<string, string>> = {
  extrude: '拉伸',
  revolve: '旋转',
  loft: '放样',
  sweep: '扫掠',
  fillet: '圆角',
  chamfer: '倒角',
  shell: '抽壳',
  moveFace: '移动面',
  splitPart: '分割',
  transform: '变换',
  booleanBodies: '布尔',
  pattern: '阵列',
  featurePattern: '特征阵列',
  featureMirror: '特征镜像',
  mirror: '镜像',
  booleanAdd: '并集',
  booleanSubtract: '差集',
  hole: '孔',
  cPlane: '平面',
};

const labelFor = (featureType: string): string => LABELS[featureType] ?? featureType;

const entry = (featureType: string, extra: Record<string, unknown> = {}): { featureType: string } =>
  ({ featureType, ...extra });

describe('nextFeatureName', () => {
  it('空树 → <标签> 1', () => {
    expect(nextFeatureName('fillet', [], labelFor)).toBe('圆角 1');
    expect(nextFeatureName('cPlane', [], labelFor)).toBe('平面 1');
  });

  it('同类条目数 + 1（1 条 → 2、2 条 → 3），与树派生序号同口径', () => {
    expect(nextFeatureName('shell', [entry('shell')], labelFor)).toBe('抽壳 2');
    expect(nextFeatureName('shell', [entry('shell'), entry('shell')], labelFor)).toBe('抽壳 3');
  });

  it('每类型独立计数；无关类型（含草图/孔/其它特征）忽略', () => {
    const entries = [
      entry('fillet'),
      entry('sketch'),
      entry('hole'),
      entry('extrude'),
      entry('fillet'),
      entry('chamfer'),
    ];
    expect(nextFeatureName('fillet', entries, labelFor)).toBe('圆角 3');
    expect(nextFeatureName('chamfer', entries, labelFor)).toBe('倒角 2');
    expect(nextFeatureName('transform', entries, labelFor)).toBe('变换 1');
  });

  it('显式裁决：编号按条目数而非名称最大号——显示名 1、3 两条 → 3（缺口复用）', () => {
    // 自定义名/删除造成的跳号不参与计数（与既有 cPlane「现有数 +1」一致）。
    const entries = [
      entry('fillet', { name: '圆角 1' }),
      entry('fillet', { name: '圆角 3' }),
    ];
    expect(nextFeatureName('fillet', entries, labelFor)).toBe('圆角 3');
  });

  it('抑制条目不排除（与 cPlane 先例一致：树内同类条目全计数）', () => {
    expect(nextFeatureName('moveFace', [entry('moveFace', { suppressed: true })], labelFor)).toBe('移动面 2');
  });

  it('labelFor 以新特征类型调用一次（宿主注入 i18n 解析）', () => {
    const resolve = vi.fn((featureType: string) => LABELS[featureType] ?? featureType);
    expect(nextFeatureName('splitPart', [entry('splitPart')], resolve)).toBe('分割 2');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('splitPart');
  });

  it('真实展示类型取树标签（mirror/featureMirror/booleanAdd/booleanSubtract/hole 回退）', () => {
    // F2（2026-11-16）：标题必须与树派生名同口径——featureMirror 取树标签
    // 「特征镜像」（不是 ribbon 的「镜像」）；booleanBodies 取树「布尔」
    // （不是 ribbon 的「布尔运算」）。
    expect(NEW_FEATURE_LABEL_KEYS.featureMirror).toBe('partStudio.tree.featureTypes.featureMirror');
    expect(NEW_FEATURE_LABEL_KEYS.booleanBodies).toBe('partStudio.tree.featureTypes.booleanBodies');
    // body mirror / 布尔作用域 / hole 无表项：宿主回退树类型标签（与
    // mapFeatureEntries 同口径），不为它们臆造第二套词条。
    expect(NEW_FEATURE_LABEL_KEYS.mirror).toBeUndefined();
    expect(NEW_FEATURE_LABEL_KEYS.booleanAdd).toBeUndefined();
    expect(NEW_FEATURE_LABEL_KEYS.booleanSubtract).toBeUndefined();
    expect(NEW_FEATURE_LABEL_KEYS.hole).toBeUndefined();
    const treeLabelFor = (featureType: string): string => LABELS[featureType] ?? featureType;
    expect(nextFeatureName('mirror', [], treeLabelFor)).toBe('镜像 1');
    expect(nextFeatureName('featureMirror', [], treeLabelFor)).toBe('特征镜像 1');
    expect(nextFeatureName('booleanAdd', [], treeLabelFor)).toBe('并集 1');
    expect(nextFeatureName('booleanSubtract', [], treeLabelFor)).toBe('差集 1');
    expect(nextFeatureName('hole', [], treeLabelFor)).toBe('孔 1');
    expect(nextFeatureName('booleanBodies', [], treeLabelFor)).toBe('布尔 1');
    // 表内词条键统一挂 partStudio 前缀（i18n 词库键，不臆造裸字符串）。
    for (const key of Object.values(NEW_FEATURE_LABEL_KEYS))
      expect(key.startsWith('partStudio.')).toBe(true);
  });
});
