/**
 * 槽预览初始宽度回退（2026-11-21 review 修复）。
 *
 * 会话粘滞宽度（live S2v：上次 Ø30 → 下次预览默认 30）对下一条曲线可能过大：
 * 整圆 r15 的边界内圆 R−w/2 退化（`degenerateRadius`）。若初始构建即失败，
 * 预览根本不存在、宽度标签也不会出现，用户无法把宽度调小——工具死局。
 *
 * 规则（仅**初始构建**使用，预览期用户显式改宽不走本回退）：
 * - 仅宽度相关错误（`degenerateRadius`/`zeroWidth`）且宽度 ≠ 默认值时重试一次；
 * - 重试固定用 `DEFAULT_SLOT_WIDTH`；成功即采用默认宽度并标记 `fellBack`
 *   （工具据此发出本地化提示，不静默）；
 * - `unsupportedKind`/`unsupportedChain`/`unsolved*` 等非宽错误原样返回——
 *   不得用默认宽度掩盖几何拒收。
 *
 * 纯函数（无 IModelApp/React 依赖），单测直接覆盖。
 */
import { DEFAULT_SLOT_WIDTH, type SlotBuildError, type SlotDraft } from './sketch-slot-logic.js';

export type SlotDraftBuild = (
  width: number,
) => { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError };

export type SlotDraftWithWidthResult =
  | { ok: true; draft: SlotDraft; width: number; fellBack: boolean }
  | { ok: false; error: SlotBuildError };

/** 宽度相关（可通过缩小宽度恢复）的构建错误。 */
const WIDTH_DEPENDENT_SLOT_ERRORS: ReadonlySet<SlotBuildError> = new Set(['degenerateRadius', 'zeroWidth']);

export function isWidthDependentSlotError(error: SlotBuildError): boolean {
  return WIDTH_DEPENDENT_SLOT_ERRORS.has(error);
}

/**
 * 以给定宽度构建槽草稿；宽度相关失败且宽度非默认值 → 用默认宽度重试一次。
 * 返回实际采用的宽度与是否发生回退；失败时错误取首次/重试的真实原因。
 */
export function buildSlotDraftWithWidthFallback(
  width: number,
  build: SlotDraftBuild,
): SlotDraftWithWidthResult {
  const first = build(width);
  if (first.ok)
    return { ok: true, draft: first.draft, width, fellBack: false };
  if (width === DEFAULT_SLOT_WIDTH || !isWidthDependentSlotError(first.error))
    return first;
  const retried = build(DEFAULT_SLOT_WIDTH);
  if (!retried.ok)
    return retried;
  return { ok: true, draft: retried.draft, width: DEFAULT_SLOT_WIDTH, fellBack: true };
}
