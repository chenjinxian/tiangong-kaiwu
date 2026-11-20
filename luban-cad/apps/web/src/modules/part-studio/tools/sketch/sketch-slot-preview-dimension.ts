/**
 * 槽工具预览宽度尺寸（S2v，live 2026-11-20 S2t3–S2t7）。
 *
 * live 行为（私有 `ui-evidence/slot-variants-20261120/state-233..250`）：
 * - 槽预览期数值标签（如 `Ø20`）可直接双击打开既有尺寸编辑器；改值立即
 *   重算预览，提交沿用新宽度。
 * - 工具记住最近一次宽度作为下一次预览默认：先设 30 → 下次预览 `Ø30`；
 *   再设 10 → 下次预览 `Ø10`（同一会话内实测）。
 * - 预览编辑器接受表达式文本但只取**求值结果**：`5*2` → 预览宽 10，提交为
 *   数值 10（重开编辑器显示 `10 mm`，无 expression）。
 *
 * 本模块是工具（非 React）与标注/编辑器（React）之间的桥：工具发布一个哨兵
 * 约束 + 世界系标注，编辑器按既有双击通道打开它；提交经回调回到工具重建草稿。
 * 哨兵 id 为负数（真实约束 id 恒正），不写入草图 params。
 */
import type { SketchConstraintDto, SketchDto } from '@luban-cad/shared';
import type { SketchDimensionAnnotation } from '@luban-cad/viewer';
import { buildSketchDimensionAnnotations } from '../../internal/sketch-annotations.js';
import { DEFAULT_SLOT_WIDTH, type SlotDraft } from './sketch-slot-logic.js';

/** 预览宽度约束的哨兵 id（负数，不与草图真实约束冲突；不落 params）。 */
export const SLOT_PREVIEW_DIMENSION_ID = -1000;

export interface SlotPreviewDimension {
  /** 合成约束（id=哨兵；kind=diameter|slotWidth；value=当前宽度）。 */
  constraint: SketchConstraintDto;
  /** 与提交后同布局家族的世界系标注。 */
  annotation: SketchDimensionAnnotation;
}

export type SlotPreviewCommit = (value: number) => { ok: boolean; error?: string };

let preview: SlotPreviewDimension | undefined;
let commitHandler: SlotPreviewCommit | undefined;
const listeners = new Set<() => void>();
/** 最近一次宽度（会话级默认；live 同一会话内粘滞）。 */
let lastWidth = DEFAULT_SLOT_WIDTH;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSlotPreviewDimension(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSlotPreviewDimension(): SlotPreviewDimension | undefined {
  return preview;
}

export function setSlotPreviewDimension(next: SlotPreviewDimension | undefined, commit?: SlotPreviewCommit): void {
  preview = next;
  commitHandler = next ? commit : undefined;
  emit();
}

export function clearSlotPreviewDimension(): void {
  if (preview === undefined && commitHandler === undefined)
    return;
  preview = undefined;
  commitHandler = undefined;
  emit();
}

/** 编辑器提交预览宽度（由宿主 onCommit 路由）；返回工具重建结果。 */
export function commitSlotPreviewWidth(value: number): { ok: boolean; error?: string } {
  if (!commitHandler)
    return { ok: false, error: 'slot-preview-not-active' };
  return commitHandler(value);
}

export function getSlotPreviewWidthDefault(): number {
  return lastWidth;
}

export function rememberSlotPreviewWidth(width: number): void {
  if (Number.isFinite(width) && width > 0)
    lastWidth = width;
}

/** 仅测试用：复位会话级默认与预览态。 */
export function resetSlotPreviewDimensionForTest(): void {
  lastWidth = DEFAULT_SLOT_WIDTH;
  preview = undefined;
  commitHandler = undefined;
  emit();
}

/**
 * 从槽草稿构造预览尺寸：取草稿的宽度驱动约束（diameter/slotWidth），以哨兵
 * id 建合成草图（只含草稿实体）投影出与提交后同一布局家族的世界系标注。
 * 无宽度约束或无标注 → undefined（工具不发布预览尺寸）。
 */
export function buildSlotPreviewDimension(
  sketch: SketchDto,
  draft: SlotDraft,
  width: number,
): SlotPreviewDimension | undefined {
  const widthConstraint = draft.constraints.find(
    (constraint) => constraint.kind === 'diameter' || constraint.kind === 'slotWidth',
  );
  if (!widthConstraint)
    return undefined;
  const constraint: SketchConstraintDto = { ...widthConstraint, id: SLOT_PREVIEW_DIMENSION_ID, value: width };
  // 合成草图 = 既有草图 + 草稿（id 不冲突）：槽宽约束可能引用源实体（如整圆
  // 中线），必须一并解析；位置也与提交后的标注完全一致。
  const seen = new Set<number>();
  const entities = [...sketch.entities, ...draft.entities].filter((entity) => {
    if (seen.has(entity.id))
      return false;
    seen.add(entity.id);
    return true;
  });
  const synthetic: SketchDto = { ...sketch, entities, constraints: [constraint] };
  const annotation = buildSketchDimensionAnnotations(synthetic)
    .find((candidate) => candidate.id === `dimension-${SLOT_PREVIEW_DIMENSION_ID}`);
  return annotation ? { constraint, annotation } : undefined;
}
