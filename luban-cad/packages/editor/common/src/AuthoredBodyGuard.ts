/*---------------------------------------------------------------------------------------------
* Copyright (c) LubanCAD. All rights reserved.
* Licensed under the MIT License.
*
* Authored LubanCAD BodySolid delete guard — shared by the frontend DeleteElementsTool
* (P2.6d user-path mitigation) and the backend BasicManipulationCommand (P2.8 invariant).
*
* Bodies are managed by the feature tree; deleting a lifecycle body directly removes the
* graph root (init BodySolid missing → getBodies 500). Keeping the predicate here makes the
* two enforcement points use exactly the same truth table.
*--------------------------------------------------------------------------------------------*/

import type { ElementProps } from "@itwin/core-common";

/** 拒删 authored body 的用户可见文案（zh/en；warning 级）。 */
export const AUTHORED_BODY_DELETE_BLOCKED_MESSAGE =
  "无法直接删除实体：实体由特征树管理，请删除驱动特征。 / " +
  "Cannot delete a body directly: bodies are managed by the feature tree. Delete the driving feature instead.";

/** LubanCAD BodySolid 的 ECClassName（后端 schema 名；前端/后端读 props 的唯一类判据）。 */
const LUBAN_BODY_SOLID_CLASS = "LubanCAD:BodySolid";

/**
 * 是否为受特征树管理的 LubanCAD body（P2.6d / review C6；P2.8 后端复用）。
 *
 * 判据：
 * - classFullName 必须是 `LubanCAD:BodySolid`；
 * - `jsonProperties.luban.body` marker 显式 `authored:false`（直改 orphan）才算
 *   非 authored；**缺 marker 的历史 body 保守视为 authored**（后端 isAuthoredBody
 *   的旧库 heuristic 会把默认体/有源体视为 authored——前端无法反查，
 *   故以「非显式 orphan 即拒删」兜底，绝不放过生命周期 body）。
 * - jsonProperties 兼容对象/字符串两种读回形态（同后端 readBodyMarker 防御）。
 */
export function isAuthoredBodyProps(
  props: Pick<ElementProps, "classFullName" | "jsonProperties">,
): boolean {
  if (props.classFullName !== LUBAN_BODY_SOLID_CLASS)
    return false;
  const marker = readBodyMarker(props.jsonProperties);
  return marker?.authored !== false;
}

function readBodyMarker(jsonProperties: unknown): { authored?: boolean } | undefined {
  const asObject = (value: unknown): Record<string, unknown> | undefined => {
    if (undefined === value || null === value)
      return undefined;
    if ("string" === typeof value) {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return undefined; // 库外直写脏 JSON：按无 marker 处理（保守 → authored）
      }
    }
    return "object" === typeof value ? value as Record<string, unknown> : undefined;
  };
  const luban = asObject(asObject(jsonProperties)?.luban);
  const marker = luban?.body;
  if (!marker || "object" !== typeof marker)
    return undefined;
  const authored = (marker as { authored?: unknown }).authored;
  return { authored: "boolean" === typeof authored ? authored : undefined };
}
