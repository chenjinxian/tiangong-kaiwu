/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureDialog（M3 Task 6；M4 Task 6 提交接线）：特征编辑非模态内联面板
 * （对齐 os-31）——
 * - 非模态：role=dialog + aria-modal=false + 无 backdrop 遮罩，画布区左上角
 *   内联定位（PartStudioCanvas 宿主）；对话框打开期间画布可持续拾取、
 *   视图可旋转缩放（os-31 采集对齐）；
 * - 顶置 ✓确认/✗取消（标题行首，绿✓/红✗）；
 * - 布尔作用域双页签：结果类型（实体|曲面|薄壁）× 布尔作用域（新建|加入|
 *   移除|相交），role=tablist + aria-selected；
 * - 芯片式实体选择框：初始实体（props 注入）渲染 chips + ×移除；快速拾取
 *   经 useCanvasSelection 把 store.canvas.selection 回流成 chips（按 id
 *   去重）——T5 选择驱动 hooks 的 T6 消费面（progress.md T5↔T6 一致）；
 * - 距离 + 折叠段：距离（M4-T6 新增——insertFeature extrude 的唯一可编辑
 *   量，默认 10）/方向（默认展开，正向/反向下拉）/起始偏移/对称（勾选）/
 *   拔模，aria-expanded 开合语义；
 * - 底部：回滚滑杆（range，默认=上限；🟠 诚实降级——后端 OpLog 仅线性链，
 *   UI 先行）+ 成品按钮（=✓ 确认出口）+ ? 帮助（展开文案）。
 *
 * 提交接线（M4-T6 拉伸闭环）：mode='new' 且 applyOp 在场时，✓/成品 →
 * `applyOp({ kind: 'insertFeature', featureType, params })`；成功 → toast
 *（IModelApp.notifications 标准通道，与保存错误面同管道）+ onConfirm（宿主
 * closeDialog——组件不自销，受控口径）；失败 → 就地 Alert（六态 error），
 * 对话框不关闭；提交中禁重入（两出口禁用）。非法距离校验先行（不发起 op）。
 *
 * 拉伸草图通道（M6-a T6，解「空 profile 死结」的前端最后一环）：extrude 的
 * 新建提交改走草图寻址——`params: { profile: [], distance, sketchId,
 * regionIndex }`（shared v1.6 互斥语义：sketchId 在场时 profile 须空数组，
 * 后端 zod 拒收裸空 profile）。数据源裁决（两路取内聚者）：
 * - 草图列表 = 宿主（Session）自 useFeatureSystem.tree 过滤 featureType===
 *   'sketch' 经 mapFeatureEntries 命名后 props 下传——树已在 onCommitted/
 *   onAfterUndoRedo 双订刷新（建/删草图自动跟随、orderKey 有序、命名与特征
 *   树同源），不另开 listSketches 第二数据通道（useSketchSystem 移植时同款
 *   裁决：listSketches 摘要表无序无名，消费面未挂载不补）；
 * - 面域 = 选中草图后对话框直调 getSketch(connectionKey, sketchId) 读
 *   SketchRegionDto[]（面积降序，regionIndex=数组下标）——useSketchSystem
 *   的读面钉死 store.sketch.activeSketchId（草图模式身份），对话框拾取任意
 *   草图不属该通道（复用须劫持活动身份，误触草图模式变身语义），直调 RPC
 *   即最小内聚面（读操作不涉写租约；代际守卫防慢响应覆写）。
 * 交互（M6-a 最小形态，视口点击拾取归 M6-c）：草图下拉（多选一）+ 面域下拉
 *（regions>1 才现——单面域自动 regionIndex=0）；选中回显 chip「{草图名} 的面」
 *（多面域追加 ·面域 N，对齐采集规格「Sketch 1 的 面」chips 形态），×移除=
 * 清选择。门禁（对齐 T3 zod 语义，不再空 profile 裸奔）：无草图 → 「先创建
 * 草图」提示 + 提交禁用；regions 缺省/空 → 「草图无可拉伸面域」 + 禁用；
 * 面域读取中/失败 → 禁用（失败经 role=alert 就地呈现）。仅 extrude 接
 * sketchId——布尔类型按既有 zod 拒收语义不接（Registry booleanSchema
 * sketchId:z.never()），非 extrude 特征类型走原 payload 不动。
 * applyOp 未接线（壳期/纯展示）时确认回退纯 onConfirm（M3 语义保持）；
 * mode='edit' 且 applyOp 在场（宿主已接提交面）时 ✓/成品 禁用 + 提示行
 *「该特征类型的参数编辑即将推出」（T6 评审 M-1：updateParams 归特征对话框
 * 增强 backlog，消除「假成功」观感）。租约警示（T6 评审 I-2）：leaseOk=false
 * 时可视警示「提交将等待租约」，不硬禁用（保留陈旧租约 35s 自愈路；仅
 * canEdit 时呈现——只读权限下禁用 ✓ 后该警示是谎报，只读提示顶位）。
 * 只读写门禁（B2 发布窗实锤的前端根因，接替 T6 评审 I-1 的 store.viewOnly
 * 直读）：宿主单点下传 canEdit（!viewOnly ∧ 权限 editable，PartStudioPage
 * 合流），!canEdit 时 ✓/成品 禁用 + 诚实提示「当前为只读权限，无法提交特征」
 *——提交入口不发起 applyOp，自然不进租约获取等待环（hub 权限缺陷下只读
 * briefcase 仍可被放行写 op，卡 aria-busy 40-65s 的现场即此门缺位；hook 层
 * 另有 useFeatureSystem readonly 前置拒收兜底，两层防御纵深）。方向/对称/拔模随载荷回传
 * 但本版不进 op（shared ExtrudeParams 的 symmetric 等扩展未定稿——映射
 * 归特征对话框增强单裁，见 useFeatureSystem 头注延后项）。
 * Escape 关闭（M5-T1 D-T9-5）：非 iTwinUI Dialog 的自研面板吃不到官方
 * dismissal 处方——document keydown（Escape→onCancel）挂载期一次注册，
 * 对齐 canvas/CanvasContextMenu.tsx:226-234 模式（onCancel 经 ref 取用，
 * 不随 props 变化重挂）；IModelApp Escape 工具语义共存由 P1 波次放行传播
 *（viewer-next keyboard-shortcuts Escape 分支不拦断，浮层收合与工具取消
 * 两层语义并存）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { SvgCheckmark, SvgClose } from '@itwin/itwinui-icons-react';
import type { FeatureOp, FeatureOpResult, LubanFeatureType, SketchRegionDto } from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import './FeatureDialog.css';

/** 结果类型页签（os-31：实体|曲面|薄壁）。 */
export type FeatureResultType = 'solid' | 'surface' | 'thinWall';

/** 布尔作用域页签（os-31：新建|加入|移除|相交）。 */
export type FeatureBooleanScope = 'new' | 'add' | 'remove' | 'intersect';

/** 方向（折叠段「方向」下拉值域）。 */
export type FeatureDirection = 'forward' | 'backward';

/** 实体芯片（面和草图区域的寻址单位）。 */
export interface FeatureDialogEntity {
  id: string;
  label: string;
}

/** 草图选项（M6-a T6 拉伸草图通道的下拉寻址单位——宿主自特征树 sketch 节点映射）。 */
export interface FeatureDialogSketchOption {
  id: string;
  label: string;
}

/** 确认载荷：面板全量本地态的一次性回传（变异层接线口）。 */
export interface FeatureDialogResult {
  resultType: FeatureResultType;
  booleanScope: FeatureBooleanScope;
  entities: readonly FeatureDialogEntity[];
  direction: FeatureDirection;
  startOffset: string;
  symmetric: boolean;
  draft: string;
  rollback: number;
}

export interface FeatureDialogProps {
  /** 特征名（标题=对话框可访问名，os-31「Extrude 1」；new 模式=类型标签）。 */
  featureName: string;
  /**
   * 提交模式（M4-T6）：'new'=创建（applyOp 在场即走 insertFeature 直提交）；
   * 'edit'=既有特征（本版不提交，updateParams 归特征对话框增强 backlog）。
   * 缺省 'edit'（纯展示壳期语义）。
   */
  mode?: 'new' | 'edit';
  /** 特征类型（mode='new' 时 insertFeature 的 featureType）。 */
  featureType?: LubanFeatureType;
  /** op 提交面（Session useFeatureSystem.applyOp 直通；缺省=纯回调壳期语义）。 */
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /**
   * 写租约在持（Session useFeatureSystem.leaseOk 直通；T6 评审 I-2）——
   * false 且提交面在场时给可视警示「提交将等待租约」，**不硬禁用**（保留
   * applyOp 陈旧租约 35s 自愈路）；缺省（未接线/壳期）不警示。canEdit=false
   * 时不呈现（只读权限下提交已禁用，「等待租约」是谎报——只读提示顶位）。
   */
  leaseOk?: boolean;
  /**
   * 编辑面总门（B2 只读写门禁，M5-T3 单点合流的下游消费）：宿主
   *（PartStudioSession→Canvas）单点下传 !viewOnly ∧ 权限 editable——false 时
   * ✓/成品 禁用 + 只读提示，提交入口不发起 applyOp（不进租约获取等待环）。
   * 缺省 true（壳期/纯展示语义保持——无写路径可关；生产宿主恒显式传参）。
   */
  canEdit?: boolean;
  /** 初始实体 chips（RPC 接线前由宿主注入；缺省空集）。 */
  entities?: readonly FeatureDialogEntity[];
  /**
   * 可选草图集（M6-a T6 拉伸草图通道）：宿主（Session）自 useFeatureSystem.tree
   * 过滤 featureType==='sketch' 经 mapFeatureEntries 命名下传（「草图 N」与
   * 特征树同源同名，树刷新自动跟随）。缺省空集 → 「先创建草图」提示 + 提交
   * 禁用（T3 zod 语义：无 sketchId 的空 profile 裸奔被拒收，不再发放行）。
   */
  sketches?: readonly FeatureDialogSketchOption[];
  /**
   * iModel key（M6-a T6 面域读面）：选中草图后经 getSketch 拉
   * SketchRegionDto[]（面积降序，regionIndex=数组下标）。缺省 undefined =
   * 面域不可读（提交禁用 + 就地提示，不发起 RPC）。
   */
  connectionKey?: string;
  /** 回滚滑杆上限（默认 100；后端 OpLog 线性链接线后由宿主注入特征数）。 */
  rollbackMax?: number;
  /** ✓/成品 确认出口（回传全量载荷；提交成功后由宿主 closeDialog）。 */
  onConfirm?: (result: FeatureDialogResult) => void;
  /** ✗ 取消出口。 */
  onCancel?: () => void;
}

/** 结果类型页签序（os-31）。 */
const RESULT_TYPES: readonly FeatureResultType[] = ['solid', 'surface', 'thinWall'];

/** 布尔作用域页签序（os-31）。 */
const BOOLEAN_SCOPES: readonly FeatureBooleanScope[] = ['new', 'add', 'remove', 'intersect'];

/** 折叠段定义（方向默认展开——主参数段；余者折叠）。 */
interface CollapsibleSection {
  id: 'direction' | 'startOffset' | 'symmetric' | 'draft';
  defaultExpanded: boolean;
}

const SECTIONS: readonly CollapsibleSection[] = [
  { id: 'direction', defaultExpanded: true },
  { id: 'startOffset', defaultExpanded: false },
  { id: 'symmetric', defaultExpanded: false },
  { id: 'draft', defaultExpanded: false },
];

/** 草图选项缺省（M6-a T6：props 未接线/壳期空集——「先创建草图」门禁数据源；模块级常量防引用抖动）。 */
const EMPTY_SKETCHES: readonly FeatureDialogSketchOption[] = [];

/**
 * 面积读数（M6-a T6）：内部米制 m²，toPrecision(3) 去尾零（0.0025 → "0.0025"、
 * 3.14159 → "3.14"）——面域下拉的量级提示位，非精确读数（精确面积标注归
 * M6-c 视口拾取交互单裁）。
 */
function formatArea(area: number): string {
  return String(Number(area.toPrecision(3)));
}

/**
 * 特征编辑对话框（非模态内联面板）。宿主经 onConfirm/onCancel 收合——
 * 组件不自销（受控口径，与 CapabilityDialog 一致）；宿主挂
 * `key={mode==='edit' ? featureId : 'new-'+featureType}`（M3-T6 台账①：
 * 本地态跨特征复用残留的根治）。
 */
export function FeatureDialog({
  featureName,
  mode = 'edit',
  featureType,
  applyOp,
  leaseOk,
  canEdit = true,
  entities,
  sketches,
  connectionKey,
  rollbackMax = 100,
  onConfirm,
  onCancel,
}: FeatureDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selection } = useCanvasSelection();

  const [resultType, setResultType] = React.useState<FeatureResultType>('solid');
  const [booleanScope, setBooleanScope] = React.useState<FeatureBooleanScope>('new');
  const [chips, setChips] = React.useState<FeatureDialogEntity[]>([...(entities ?? [])]);
  const [distance, setDistance] = React.useState('10');
  const [direction, setDirection] = React.useState<FeatureDirection>('forward');
  const [startOffset, setStartOffset] = React.useState('');
  const [symmetric, setSymmetric] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [rollback, setRollback] = React.useState(rollbackMax);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<CollapsibleSection['id'], boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, s.defaultExpanded])) as Record<
      CollapsibleSection['id'],
      boolean
    >,
  );
  // 提交态（M4-T6）：提交中禁重入；错误就地 Alert（六态 error，对话框不关）。
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  // 卸载守卫：pending 期间宿主关闭（✗）后的迟到回包不得再 setState。
  // StrictMode 正确形态（T8 真栈冒烟修正，同 SketchDialog——原形态 dev 双挂载后
  // 恒 false，提交回包永远早退：aria-busy 永挂、onConfirm 永不执行）。
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  // Escape 关闭（M5-T1 D-T9-5）：自研非模态面板（非 iTwinUI Dialog）无官方
  // dismissal——document keydown 挂载期一次注册（Escape→onCancel），回调经
  // ref 取用，不随 props/重渲染重挂（CanvasContextMenu.tsx:226-234 同款模式；
  // IModelApp Escape 工具语义共存——P1 波次已放行传播，两层语义并存）。
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
    // 监听终身一次挂载；闭包内一律走 ref（意图在此注记，非遗漏依赖）。
  }, []);
  // edit 模式且宿主已接提交面（T6 评审 M-1）：updateParams 本版不接线（特征
  // 对话框增强 backlog），✓/成品 禁用 + 提示行，消除「点确认即关面板无事发生」
  // 的假成功观感；applyOp 未接线（壳期/纯展示）保持 M3 纯回调语义。
  const editStandalone = mode === 'edit' && applyOp !== undefined;

  // 拉伸草图通道（M6-a T6）：extrude 新建提交走 sketchId 寻址（数据源/门禁
  // 裁决见文件头注）；其余特征类型与 edit/壳期路径一概不进本通道。
  const sketchChannel = mode === 'new' && featureType === 'extrude' && applyOp !== undefined;
  const sketchOptions = sketches ?? EMPTY_SKETCHES;
  const [selectedSketchId, setSelectedSketchId] = React.useState('');
  const [regionIndex, setRegionIndex] = React.useState(0);
  // 面域读面（getSketch.regions——面积降序数组；undefined=未选/读取中）。
  const [regions, setRegions] = React.useState<SketchRegionDto[] | undefined>(undefined);
  const [regionsLoading, setRegionsLoading] = React.useState(false);
  const [regionsError, setRegionsError] = React.useState<string | undefined>(undefined);
  // 面域读取代际：换草图/换连接时 +1，慢响应过期即丢弃（useSketchSystem
  // activeEpochRef 同款纪律——stale-clobber 防旧草图面域覆写新选择）。
  const regionsEpochRef = React.useRef(0);

  // 面域读面（对话框直调 getSketch RPC——裁决见文件头注）：读操作不涉写租约；
  // 未选草图/连接缺失时清态（后者以就地提示诚实禁提交，不发起 RPC）。
  React.useEffect(() => {
    const epoch = ++regionsEpochRef.current;
    if (!sketchChannel || selectedSketchId === '') {
      setRegions(undefined);
      setRegionsLoading(false);
      setRegionsError(undefined);
      return;
    }
    if (!connectionKey) {
      setRegions(undefined);
      setRegionsLoading(false);
      setRegionsError(t('partStudio.featureDialog.regionUnreadable'));
      return;
    }
    setRegionsLoading(true);
    setRegionsError(undefined);
    LubanFeatureRpcInterface.getClient()
      .getSketch(connectionKey, selectedSketchId)
      .then(
        (sketch) => {
          if (regionsEpochRef.current !== epoch) return; // 迟写丢弃（身份已切换）
          setRegions(sketch?.regions ?? []); // regions 缺省（旧后端不下发）=无面域，禁提交
          setRegionsLoading(false);
        },
        (err: unknown) => {
          if (regionsEpochRef.current !== epoch) return;
          setRegions([]);
          setRegionsError(err instanceof Error ? err.message : String(err));
          setRegionsLoading(false);
        },
      );
  }, [sketchChannel, selectedSketchId, connectionKey, t]);

  // 提交门（M6-a T6）：草图通道就绪 = 已选草图 ∧ 面域已载且非空 ∧ 未越界
  //（regionIndex 越界防御：换草图瞬间旧值残留）。不就绪 → ✓/成品 禁用——
  // T3 zod 拒收语义前置到 UI（无 sketchId 的空 profile 裸奔不再发放行）。
  const regionCount = regions?.length ?? 0;
  const sketchReady =
    !sketchChannel ||
    (selectedSketchId !== '' &&
      !regionsLoading &&
      regionsError === undefined &&
      regionCount > 0 &&
      regionIndex < regionCount);

  // 快速拾取：画布选择集 → chips（按 id 去重；label 缺省回退 id）。
  const handleFastPick = React.useCallback(() => {
    if (selection.length === 0) return;
    setChips((prev) => {
      const known = new Set(prev.map((chip) => chip.id));
      const incoming = selection
        .filter((item) => !known.has(item.id))
        .map((item) => ({ id: item.id, label: item.label ?? item.id }));
      return incoming.length > 0 ? [...prev, ...incoming] : prev;
    });
  }, [selection]);

  const handleRemoveChip = React.useCallback((id: string) => {
    setChips((prev) => prev.filter((chip) => chip.id !== id));
  }, []);

  // 草图选择（M6-a T6）：换草图即重置面域序（regions 语义=该草图的面积降序
  // 数组，旧下标不跨草图续用；读取中的过渡窗由 sketchReady 禁提交兜住）。
  const handleSketchChange = React.useCallback((sketchId: string) => {
    setSelectedSketchId(sketchId);
    setRegionIndex(0);
  }, []);

  // 草图 chip ×移除 = 清选择（回到「选择草图…」占位，提交随 sketchReady 禁用）。
  const handleRemoveSketchChip = React.useCallback(() => {
    setSelectedSketchId('');
    setRegionIndex(0);
  }, []);

  const buildResult = React.useCallback((): FeatureDialogResult => ({
    resultType,
    booleanScope,
    entities: chips,
    direction,
    startOffset,
    symmetric,
    draft,
    rollback,
  }), [resultType, booleanScope, chips, direction, startOffset, symmetric, draft, rollback]);

  /**
   * 确认出口：new + applyOp 在场 → insertFeature 直提交（拉伸闭环）；否则
   * 纯 onConfirm 回传（壳期/edit 模式语义）。成功 → toast + onConfirm（宿主
   * closeDialog）；失败/校验不过 → 就地 Alert，对话框不关闭。
   */
  const handleConfirm = React.useCallback(() => {
    if (submitting || !canEdit) return; // 禁重入 + 只读写门禁（B2：readonly 不进租约环）
    if (editStandalone) return; // M-1：edit 本版不提交（✓ 已禁用，此为防御兜底）
    if (!(mode === 'new' && applyOp && featureType)) {
      onConfirm?.(buildResult());
      return;
    }
    if (sketchChannel && !sketchReady) return; // 草图通道门禁（✓ 已禁用，此为防御兜底）
    const parsed = Number(distance);
    if (distance.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setError(t('partStudio.featureDialog.distanceInvalid'));
      return;
    }
    setError(undefined);
    setSubmitting(true);
    void (async () => {
      let result: FeatureOpResult;
      try {
        result = await applyOp({
          kind: 'insertFeature',
          featureType,
          // M6-a T6：extrude 走草图通道——{sketchId, regionIndex} 面域寻址 +
          // 空 profile（shared v1.6 互斥语义：sketchId 在场时 profile 须空数组，
          // 后端 sketchRegionsFrom 按面域数组产轮廓）；其余特征类型载荷不动
          //（布尔类型 zod 拒收 sketchId——Registry booleanSchema，不接）。
          params: sketchChannel
            ? { profile: [], distance: parsed, sketchId: selectedSketchId, regionIndex }
            : { profile: [], distance: parsed },
        });
      } catch (err) {
        // rpc-over-ipc 异常（连接断开等）——与拒收同面呈现，不静默。
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (!aliveRef.current) return;
      setSubmitting(false);
      if (result.ok) {
        // 成功 toast（notifications 标准通道）+ onConfirm（宿主 closeDialog）。
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Success,
            t('partStudio.featureDialog.submitSuccess', { name: featureName }),
          ),
        );
        onConfirm?.(buildResult());
      } else {
        setError(result.error);
      }
    })();
  }, [
    submitting,
    canEdit,
    editStandalone,
    mode,
    applyOp,
    featureType,
    sketchChannel,
    sketchReady,
    selectedSketchId,
    regionIndex,
    distance,
    t,
    onConfirm,
    buildResult,
    featureName,
  ]);

  // 选中回显 chip（M6-a T6）：「{草图名} 的面」（多面域追加 ·面域 N）——对齐
  // 采集规格「Sketch 1 的 面」chips 形态；单面域不追加（regionIndex 恒 0 无信息量）。
  const selectedSketch = sketchOptions.find((option) => option.id === selectedSketchId);
  const sketchChipLabel = selectedSketch
    ? regionCount > 1
      ? t('partStudio.featureDialog.sketchFaceChipWithRegion', {
          name: selectedSketch.label,
          index: regionIndex,
        })
      : t('partStudio.featureDialog.sketchFaceChip', { name: selectedSketch.label })
    : undefined;
  // 面域下拉项（M6-a T6）：regions 面积降序（后端 sketchRegionsFrom 确定性排序
  // 语义），首项标注最大（= regionIndex 缺省 0 的语义锚）。
  const regionOptionLabel = (index: number, area: number): string =>
    index === 0
      ? t('partStudio.featureDialog.regionOptionLargest', { index, area: formatArea(area) })
      : t('partStudio.featureDialog.regionOption', { index, area: formatArea(area) });

  const toggleSection = React.useCallback((id: CollapsibleSection['id']) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={featureName}
      aria-busy={submitting || undefined}
      className="part-studio-feature-dialog"
      data-testid="part-studio-feature-dialog"
    >
      {/* 顶置标题行：特征名 + ✓确认/✗取消（os-31）。 */}
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <div className="part-studio-feature-dialog__header-actions">
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.confirm')}
            className="part-studio-feature-dialog__confirm"
            disabled={submitting || editStandalone || !canEdit || !sketchReady}
            onClick={handleConfirm}
          >
            <SvgCheckmark />
          </button>
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.cancel')}
            className="part-studio-feature-dialog__cancel"
            onClick={() => onCancel?.()}
          >
            <SvgClose />
          </button>
        </div>
      </header>

      {/* 布尔作用域双页签（os-31）。 */}
      <div className="part-studio-feature-dialog__tabs">
        <div
          role="tablist"
          aria-label={t('partStudio.featureDialog.resultTypeTabs')}
          className="part-studio-feature-dialog__tablist"
        >
          {RESULT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={resultType === type}
              className={[
                'part-studio-feature-dialog__tab',
                resultType === type ? 'part-studio-feature-dialog__tab--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setResultType(type)}
            >
              {t(`partStudio.featureDialog.resultTypes.${type}`)}
            </button>
          ))}
        </div>
        <div
          role="tablist"
          aria-label={t('partStudio.featureDialog.booleanScopeTabs')}
          className="part-studio-feature-dialog__tablist"
        >
          {BOOLEAN_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={booleanScope === scope}
              className={[
                'part-studio-feature-dialog__tab',
                booleanScope === scope ? 'part-studio-feature-dialog__tab--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setBooleanScope(scope)}
            >
              {t(`partStudio.featureDialog.booleanScopes.${scope}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="part-studio-feature-dialog__body">
        {/* 提交错误就地 Alert（六态 error；失败不关闭可改参重试）。 */}
        {error && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-feature-dialog-error">
            {error}
          </p>
        )}

        {/* 租约警示（T6 评审 I-2）：活租约被他人持有时可视提示，不硬禁用——
            applyOp 内置陈旧租约 35s 有限重试自愈路，禁用即堵死。只读权限
           （!canEdit）下不呈现：提交已被门禁禁用，「等待租约」成谎报。 */}
        {applyOp !== undefined && mode === 'new' && leaseOk === false && canEdit && (
          <p
            role="note"
            className="part-studio-feature-dialog__lease-warning"
            data-testid="part-studio-feature-dialog-lease-warning"
          >
            {t('partStudio.featureDialog.leaseBusy')}
          </p>
        )}

        {/* 只读权限提示（B2 只读写门禁）：✓/成品 已禁用时的诚实呈现——
            「只读」是比 editHint 更根本的不可提交因，顶位优先。 */}
        {!canEdit && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-readonly-hint"
          >
            {t('partStudio.featureDialog.readonlyHint')}
          </p>
        )}

        {/* edit 模式提示行（T6 评审 M-1）：参数编辑即将推出（✓ 已禁用）。 */}
        {canEdit && editStandalone && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-edit-hint"
          >
            {t('partStudio.featureDialog.editHint')}
          </p>
        )}

        {/* 距离（M4-T6：insertFeature extrude 的唯一可编辑量；常驻不折叠）。 */}
        <section className="part-studio-feature-dialog__distance">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-distance">
            {t('partStudio.featureDialog.distanceLabel')}
          </label>
          <input
            id="part-studio-feature-dialog-distance"
            type="text"
            inputMode="decimal"
            aria-label={t('partStudio.featureDialog.distanceLabel')}
            className="part-studio-feature-dialog__input"
            value={distance}
            disabled={submitting}
            onChange={(event) => setDistance(event.target.value)}
          />
        </section>

        {/* 芯片式实体选择框（os-31）。M6-a T6 分叉：拉伸新建 = 草图通道——
            草图下拉 + 面域下拉（regions>1 才现）+ 选中回显 chip（采集规格
            「Sketch 1 的 面」形态）；无草图/无面域 → 诚实提示 + 提交禁用。
            其余（edit/非 extrude/壳期）保持通用 chips + 快速拾取不动。 */}
        <section className="part-studio-feature-dialog__entities">
          <div className="part-studio-feature-dialog__entities-header">
            <span className="part-studio-feature-dialog__entities-label">
              {t('partStudio.featureDialog.entitiesLabel')}
            </span>
            {!sketchChannel && (
              <button
                type="button"
                className="part-studio-feature-dialog__fast-pick"
                onClick={handleFastPick}
              >
                {t('partStudio.featureDialog.fastPick')}
              </button>
            )}
          </div>

          {sketchChannel && sketchOptions.length === 0 ? (
            /* 无草图门禁（M6-a T6）：先创建草图（不再发空 profile 裸奔）。 */
            <p
              role="note"
              className="part-studio-feature-dialog__hint"
              data-testid="part-studio-feature-dialog-no-sketch-hint"
            >
              {t('partStudio.featureDialog.noSketchHint')}
            </p>
          ) : null}

          {sketchChannel && sketchOptions.length > 0 && (
            <React.Fragment>
              {/* 草图下拉（多选一；视口点击拾取归 M6-c 交互精化）。 */}
              <select
                aria-label={t('partStudio.featureDialog.sketchLabel')}
                className="part-studio-feature-dialog__select"
                value={selectedSketchId}
                disabled={submitting}
                onChange={(event) => handleSketchChange(event.target.value)}
              >
                <option value="" disabled>
                  {t('partStudio.featureDialog.sketchPlaceholder')}
                </option>
                {sketchOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              {/* 面域下拉（M6-a T6 最小形态）：regions>1 才现——单面域自动
                  regionIndex=0（缺省语义），无需选择。 */}
              {regions !== undefined && regionCount > 1 && (
                <select
                  aria-label={t('partStudio.featureDialog.regionLabel')}
                  className="part-studio-feature-dialog__select"
                  value={regionIndex}
                  disabled={submitting}
                  onChange={(event) => setRegionIndex(Number(event.target.value))}
                >
                  {regions.map((region, index) => (
                    <option key={`region-${index}`} value={index}>
                      {regionOptionLabel(index, region.area)}
                    </option>
                  ))}
                </select>
              )}

              {/* 选中回显 chip：「{草图名} 的面」+ regionIndex（多面域）；×=清选择。 */}
              {selectedSketch && sketchChipLabel && (
                <ul className="part-studio-feature-dialog__chips">
                  <li className="part-studio-feature-dialog__chip">
                    <span className="part-studio-feature-dialog__chip-label">{sketchChipLabel}</span>
                    <button
                      type="button"
                      aria-label={t('partStudio.featureDialog.removeEntity', { label: sketchChipLabel })}
                      className="part-studio-feature-dialog__chip-remove"
                      onClick={handleRemoveSketchChip}
                    >
                      <SvgClose />
                    </button>
                  </li>
                </ul>
              )}

              {/* 面域读取失败（RPC 异常/连接缺失）：就地 alert + 提交禁用。 */}
              {regionsError && (
                <p
                  role="alert"
                  className="part-studio-feature-dialog__alert"
                  data-testid="part-studio-feature-dialog-region-error"
                >
                  {regionsError}
                </p>
              )}

              {/* 无面域门禁（M6-a T6）：regions 缺省/空 → 草图无可拉伸面域。 */}
              {!regionsError && regions !== undefined && regionCount === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-region-hint"
                >
                  {t('partStudio.featureDialog.noRegionHint')}
                </p>
              )}
            </React.Fragment>
          )}

          {!sketchChannel && (
            <ul className="part-studio-feature-dialog__chips">
              {chips.map((chip) => (
                <li key={chip.id} className="part-studio-feature-dialog__chip">
                  <span className="part-studio-feature-dialog__chip-label">{chip.label}</span>
                  <button
                    type="button"
                    aria-label={t('partStudio.featureDialog.removeEntity', { label: chip.label })}
                    className="part-studio-feature-dialog__chip-remove"
                    onClick={() => handleRemoveChip(chip.id)}
                  >
                    <SvgClose />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 折叠段：方向/起始偏移/对称/拔模（os-31）。 */}
        <div className="part-studio-feature-dialog__sections">
          {SECTIONS.map((section) => {
            const isOpen = expanded[section.id];
            const label = t(`partStudio.featureDialog.sections.${section.id}`);
            return (
              <section key={section.id} className="part-studio-feature-dialog__section">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="part-studio-feature-dialog__section-toggle"
                  onClick={() => toggleSection(section.id)}
                >
                  <span>{label}</span>
                </button>
                {isOpen && (
                  <div className="part-studio-feature-dialog__section-body">
                    {section.id === 'direction' && (
                      <select
                        aria-label={label}
                        className="part-studio-feature-dialog__select"
                        value={direction}
                        onChange={(event) => setDirection(event.target.value as FeatureDirection)}
                      >
                        <option value="forward">
                          {t('partStudio.featureDialog.directionOptions.forward')}
                        </option>
                        <option value="backward">
                          {t('partStudio.featureDialog.directionOptions.backward')}
                        </option>
                      </select>
                    )}
                    {section.id === 'startOffset' && (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={label}
                        className="part-studio-feature-dialog__input"
                        value={startOffset}
                        onChange={(event) => setStartOffset(event.target.value)}
                      />
                    )}
                    {section.id === 'symmetric' && (
                      <label className="part-studio-feature-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={symmetric}
                          onChange={(event) => setSymmetric(event.target.checked)}
                        />
                        <span>{label}</span>
                      </label>
                    )}
                    {section.id === 'draft' && (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={label}
                        className="part-studio-feature-dialog__input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* 底部：回滚滑杆 + 成品 + ?（os-31）。 */}
      <footer className="part-studio-feature-dialog__footer">
        <div className="part-studio-feature-dialog__rollback">
          <span className="part-studio-feature-dialog__rollback-label">
            {t('partStudio.featureDialog.rollbackLabel')}
          </span>
          <input
            type="range"
            aria-label={t('partStudio.featureDialog.rollbackLabel')}
            className="part-studio-feature-dialog__rollback-slider"
            min={0}
            max={rollbackMax}
            value={rollback}
            onChange={(event) => setRollback(Number(event.target.value))}
          />
        </div>
        <div className="part-studio-feature-dialog__footer-actions">
          <button
            type="button"
            className="part-studio-feature-dialog__finish"
            disabled={submitting || editStandalone || !canEdit || !sketchReady}
            onClick={handleConfirm}
          >
            {t('partStudio.featureDialog.finish')}
          </button>
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.help')}
            aria-expanded={helpOpen}
            className="part-studio-feature-dialog__help"
            onClick={() => setHelpOpen((prev) => !prev)}
          >
            ?
          </button>
        </div>
      </footer>
      {helpOpen && (
        <p role="note" className="part-studio-feature-dialog__help-text">
          {t('partStudio.featureDialog.helpText')}
        </p>
      )}
    </div>
  );
}
