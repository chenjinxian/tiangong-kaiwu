/**
 * fillet/chamfer 的多体目标体选择（test-only 回放辅助）。
 *
 * 产品契约在多 body 模型里要求 `targetBodyId`（禁止隐式全局链尾）。圆角/倒角
 * 的目标体不能按“最近造体”猜——由边解析结果决定：所有选中边必须同属一个
 * active body；跨 body / 空集 / 已失效 body 一律诚实阻塞，绝不任取。
 */
export interface EdgeTargetSelection {
  targetBodyId?: string;
  blockedReason?: string;
}

export function selectEdgeTargetBody(
  edgeBodyKeys: readonly string[],
  activeBodyKeys: readonly string[],
): EdgeTargetSelection {
  const unique = Array.from(new Set(edgeBodyKeys.filter((key) => key.length > 0)));
  if (unique.length === 0) return { blockedReason: '选中边未归属任何 body' };
  if (unique.length > 1)
    return { blockedReason: `选中边跨 ${unique.length} 个 body，无法显式锚定目标体` };
  const targetBodyId = unique[0]!;
  if (!activeBodyKeys.includes(targetBodyId))
    return { blockedReason: `选中边所属 body ${targetBodyId} 不在当前 active body 集` };
  return { targetBodyId };
}


/**
 * v1.65（ADR-0015 B6.3）：跨体 fillet 的目标集选择。所有选中边 owner 必须是
 * active authored body；1 owner → 旧单 target 形态；>1 → 显式 targetBodyIds
 * （排序去重，逐边 bodyKey 已由 edge-resolver 携带）。空/失效 owner 仍 blocked。
 */
export interface MultiEdgeTargetSelection {
  targetBodyId?: string;
  targetBodyIds?: string[];
  blockedReason?: string;
}

export function selectEdgeTargetBodies(
  edgeBodyKeys: readonly string[],
  activeBodyKeys: readonly string[],
): MultiEdgeTargetSelection {
  const unique = Array.from(new Set(edgeBodyKeys.filter((key) => key.length > 0))).sort();
  if (unique.length === 0) return { blockedReason: '选中边未归属任何 body' };
  for (const key of unique)
    if (!activeBodyKeys.includes(key)) return { blockedReason: `选中边所属 body ${key} 不在当前 active body 集` };
  if (unique.length === 1) return { targetBodyId: unique[0] };
  return { targetBodyIds: unique };
}
