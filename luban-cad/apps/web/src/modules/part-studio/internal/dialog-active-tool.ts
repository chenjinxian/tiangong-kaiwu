/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * W29（live 2026-11-17）：特征对话框打开期间 ribbon 主钮的激活态映射。
 *
 * live 证据（2026-11-17）：点「拉伸」/「圆角」主钮打开特征对话框时主钮带
 * `is-active`（`tool is-activatable is-active is-button`），关闭对话框后恢复
 * （无 is-active）；线性阵列飞菜单选「环形阵列」打开圆周阵列对话框时组主钮
 * （标签环形阵列）保持 is-active。产品此前只按 `store.tool.activeToolId`
 * 高亮，而对话框路由从不写该字段——对话框支撑的特征因此永不显示激活态。
 *
 * 纪律：只映射「有 toolbar 主钮等价物」的对话框。featurePattern /
 * featureMirror / faceExtrude / thicken 等无对应主钮 → undefined（不伪造
 * 高亮）；edit 模式的 featureType 是树条目类型字符串——pattern 编辑态不
 * 携带 kind，返回 undefined 而不是猜线性（错误高亮比无高亮更差；live 的
 * 编辑态高亮行为未采，待对话框状态补 kind 后再映射）。
 */

import type { PartStudioDialogState } from '../types.js';

/**
 * dialog featureType → ribbon 工具 id（new 与 edit 两种模式共用；pattern
 * 单独按 kind 分派，见 `activeToolIdForDialog`）。
 * 键为 shared `LubanFeatureType`，值为 `RIBBON_TOOLS` 注册的入口 id。
 * 用 Map 而非对象字面量：edit 模式的 featureType 是任意字符串，
 * `__proto__`/`constructor` 等原型键不能意外命中。
 */
const DIALOG_FEATURE_TOOL_IDS: ReadonlyMap<string, string> = new Map([
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
]);

/**
 * 当前对话框对应的 ribbon 工具 id（无对话框/无主钮等价物 → undefined）。
 * 纯函数：Ribbon 经 selector 订阅 `store.dialog` 派生主钮激活态。
 */
export function activeToolIdForDialog(dialog: PartStudioDialogState): string | undefined {
  if (dialog.active !== 'feature')
    return undefined;
  if (dialog.featureType === 'pattern') {
    // edit 态不携带 patternKind（类型上不存在）→ 不猜线性；错误高亮比无高亮
    // 更差，且 live 编辑态高亮行为未采。待对话框状态补 kind 后再映射。
    if (dialog.mode === 'edit')
      return undefined;
    return dialog.patternKind === 'circular' ? 'CircularPattern' : 'LinearPattern';
  }
  return DIALOG_FEATURE_TOOL_IDS.get(dialog.featureType);
}
