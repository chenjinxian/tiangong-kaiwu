/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 新建特征默认命名（C1，2026-11-16 Onshape 对齐）：新建对话框标题为
 * 「<特征类型> <序号>」（圆角 1 / 抽壳 1 / 变换 1 …），与特征树派生名
 * （`useFeatureTree.mapFeatureEntries`：同类条目按 orderKey 顺序 1..N）同口径。
 *
 * 规则（显式裁决）：序号 = **当前树内同类 featureType 条目数 + 1**，不解析
 * 已有名称里的最大数字。这与既有 cPlane 实现（`平面 N`）一致；删除/重命名
 * 造成的编号缺口会被复用（例如同类条目显示为 1、3 时新名为 3），与树内
 * 顺序重编号语义一致，不在本层发明第二套「找最大号」规则。
 *
 * 纯函数：`labelFor` 由宿主注入（i18n `t` 解析），本文件不依赖 React/i18n。
 */

/**
 * 新建标题使用的基础词条键（与现有词库同源）。**一律取特征树类型名**——
 * 对话框标题必须与 `mapFeatureEntries` 派生的树行名同口径（F2，2026-11-16：
 * featureMirror=特征镜像、booleanBodies=布尔；旧值误用 ribbon 的「镜像/布尔运算」）。
 * 未列出的类型由宿主回退树类型标签（未知类型再回退原始 featureType），
 * 例如 body mirror（`mirror`→镜像）、booleanAdd/booleanSubtract（并集/差集）、
 * hole（孔）无需表项；不在本表里臆造词条。
 */
export const NEW_FEATURE_LABEL_KEYS: Readonly<Record<string, string>> = {
  extrude: 'partStudio.tree.featureTypes.extrude',
  revolve: 'partStudio.tree.featureTypes.revolve',
  loft: 'partStudio.tree.featureTypes.loft',
  sweep: 'partStudio.tree.featureTypes.sweep',
  fillet: 'partStudio.tree.featureTypes.fillet',
  chamfer: 'partStudio.tree.featureTypes.chamfer',
  shell: 'partStudio.tree.featureTypes.shell',
  moveFace: 'partStudio.tree.featureTypes.moveFace',
  splitPart: 'partStudio.tree.featureTypes.splitPart',
  transform: 'partStudio.tree.featureTypes.transform',
  booleanBodies: 'partStudio.tree.featureTypes.booleanBodies',
  pattern: 'partStudio.tree.featureTypes.pattern',
  featurePattern: 'partStudio.tree.featureTypes.featurePattern',
  featureMirror: 'partStudio.tree.featureTypes.featureMirror',
  cPlane: 'partStudio.tree.featureTypes.cPlane',
};

/** 计数只需 featureType（FeatureTreeEntry 结构性兼容；自定义名/抑制态不参与）。 */
export interface FeatureNamingEntry {
  readonly featureType: string;
}

/**
 * 新建特征名：`<labelFor(featureType)> <同类条目数 + 1>`。
 * @param featureType 新特征类型（树 `FeatureTreeEntry.featureType`）
 * @param entries 当前特征树条目（全部条目；按类型过滤计数）
 * @param labelFor 类型 → 显示标签（宿主注入 i18n 解析）
 */
export function nextFeatureName(
  featureType: string,
  entries: readonly FeatureNamingEntry[],
  labelFor: (featureType: string) => string,
): string {
  const count = entries.filter((entry) => entry.featureType === featureType).length;
  return `${labelFor(featureType)} ${count + 1}`;
}
