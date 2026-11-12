/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureTree（M3 Task 5；M4 Task 6 真数据源 + 六态完备）：双段树（特征 +
 * 零件，对齐 os-11 左栏）——
 * - 顶部 TreeFilter 语法筛选框（os-20 文本对齐）；
 * - 特征段/零件段：段头按钮（点击写 store.tree.activeTab + 幂等收起，aria-expanded
 *   反映）+ 段头计数（os-11「特征 (17)」）+ 行列表；
 * - 六态完备（M4-T6 拉伸闭环的树刷新呈现面）：特征段 loading 骨架（Session
 *   useFeatureSystem.loading 透传）/ error 就地错误条 + 重试（refresh 直通）/
 *   empty（「暂无特征」）；零件段 loading / error（空零件段按 Onshape 不渲染占位行）；
 * - 零件段（B6 M-A3.2a 起）= **authored active body**（useFeatureSystem.bodies /
 *   getBodies 读面直通）：名称取 BodyInfo.name（缺省「实体 N」）、身份=bodyKey；
 *   consumed（active=false）与 direct-edit orphan 不入树；不再跑
 *   `BisCore.GeometricElement3d` 全量查询（不显示其它模型/引用/副本）。读面
 *   加载中→骨架（不抢先发 legacy 查询）；读面不可用（MS<1.15/初次失败）→
 *   回退 legacy 物理元素查询（M6-c T5 草图排除口径保持——发布门禁要求 MS
 *   minor ≥ web minor，正常栈不走回退）。特征刷新（entries 引用变化）与 body
 *   读面同一 refresh 通道；
 * - consumed body 几何视口隐藏（M-A3.2a）：active=false 的 body 虽保留元素仍会
 *   被渲染——EmphasizeElements.hideElements(neverDrawn) 整集重建 =
 *   consumed ∪ store.canvas.hiddenIds（手动隐藏），撤销恢复 active / 手动隐藏
 *   变化均按最新并集重算；并集空时 clearHiddenElements 恢复可见。视口由 Session
 *   显式下传并作为 effect 依赖（I3：viewport 晚于 getBodies 创建/重建时重跑）；
 *   无 viewport 静默跳过（壳期/测试）；read surface 不可用时不接管 neverDrawn；
 * - 删除 HITL 回调第二参 = deleteFeature.targetBodyId（getBodies.sourceFeatureId
 *   反查唯一源；无映射 undefined）。B6 M-A5 T2 起 PartStudioSidebar 以
 *   applyOp 接线真删除/抑制（成功后 toast 归 Sidebar；树不乐观改，刷新走
 *   applyOp 内 onCommitted）；canEdit=false 时删除/抑制菜单项禁用+可见 title，
 *   handlers 防御性拒收；
 * - B6 M-A5 T2 零件行守卫：part 行右键菜单只显示 隐藏/显示（会话态 store
 *   hideNodes/showNodes，不直接触 EmphasizeElements）；TreeRow 尾部 eye 同通道，
 *   aria-pressed=有效隐藏态；不进入 edit/delete/suppress/rename 特征路径；
 * - M6-c T5 视口编辑态：特征对话框在场 → 体集（零件段产物）经
 *   useCanvasSelection extraEmphasizedIds 打 Onshape 橙高亮（采集规格
 *   §视口交互最小通道；后续特征灰显挂账）；
 * - 行（TreeRow）：名称 + 错误红显 + 抑制斜体 + 隐藏淡显；行点击选中（树→画布
 *   emphasize 联动的数据源），行右键菜单（os-15 子集：重命名/编辑…/抑制/
 *   删除 HITL，每项左置图标——os-15 V20，M4-T8 D5 收口）；
 * - 特征段头三工具钮（os-11 段头形态；M4-T8 D3 收口）：插入元素/暂停重建/
 *   特征历史——完整 UI 面铁律（照常渲染可点），均无后端面，登记 gated →
 *   能力引导对话框（capabilities.ts 单一真源；full 翻转后接真实路由）；
 * - T6 草图模式：活动草图行红显（os-30 树红显进行中草图，store.sketch 驱动
 *   传 TreeRow sketchActive）；
 * - M6-a T7 草图节点编辑入口（Onshape 语义=双击进编辑）：sketch 节点双击 +
 *   右键「编辑草图…」两路同义——enterSketch(node.id) 进草图模式（ribbon 变身/
 *   覆盖层/红显全由既有 sketch 切片驱动）；通用「编辑…」（FeatureDialog 路由）
 *   对 sketch 节点隐藏（草图不走特征对话框）；非 sketch 节点双击无行为（不动
 *   既有面）；M6-b T1 起编辑入口回显树行 params.plane 到 activeSketchPlane
 *   （进草图模式后 AccuDraw/绘制投影即用落库真平面——T7 平面归零挂账清偿）；
 * - 数据注入：entries（useFeatureSystem.tree 直通）经 useFeatureTree 映射；
 *   变异出口为回调（onRename/onEdit/onSuppress/onDelete——RPC 变异层接线面）；
 * - 菜单监听一次注册（M4-T8 收 M3 终审 T5-⑤ 同款：挂载期一次到位，menu 经
 *   ref 取用，不随每次右键重挂）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmphasizeElements, IModelApp } from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import type { BodyInfo, FeatureTreeEntry, SketchPlaneDto } from '@luban-cad/shared';
import {
  SvgDelete,
  SvgDraw,
  SvgEdit,
  SvgEditAll,
  SvgHideManuallySuppressed,
  SvgVisibilityShow,
} from '@itwin/itwinui-icons-react';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { OnshapeIconName } from '../icons/onshape-icons.js';
import { CapabilityDialog } from '../ribbon/Ribbon.js';
import { isGated } from '../internal/capabilities.js';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import { useFeatureTree } from '../hooks/useFeatureTree.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { useBodyMassProperties } from '../hooks/useBodyMassProperties.js';
import type { FeatureNode, PartNode, TreeTab } from '../types.js';
import { TreeFilter, parseTreeFilter } from './TreeFilter.js';
import type { TreeNode } from './TreeRow.js';
import { formatPartVolume, isFeatureNode, isNodeHidden, isSketchNode, TreeRow } from './TreeRow.js';
import { DEFAULT_DATUM_COUNT } from './DefaultGeometryGroup.js';
import { DefaultGeometryGroup } from './DefaultGeometryGroup.js';

export interface FeatureTreeProps {
  /**
   * 特征段原始条目（Session useFeatureSystem.tree 直通；缺省空集——empty 态，
   * 壳期占位已随 M4-T6 真数据源接线移除）。
   */
  entries?: readonly FeatureTreeEntry[];
  /**
   * Onshape live（2026-11-12）：新建草图对话框打开时，树在默认几何图元下
   * **立即**显示高亮的「草图 N」行（✓ 前即存在；✗ 关闭即消失）。缺省不显示。
   */
  pendingSketchName?: string;
  /** 特征段加载中（useFeatureSystem.loading 透传——骨架行）。 */
  loading?: boolean;
  /** 特征段加载失败文案（useFeatureSystem.error 透传——就地错误条 + 重试）。 */
  error?: string;
  /** 特征段错误重试（useFeatureSystem.refresh 直通）。 */
  onRetry?: () => void;
  /**
   * 连接（legacy 零件段物理元素查询数据源；仅在 body 读面不可用时使用）。
   * 查询随特征刷新（entries 引用变化）重跑——新特征落库产生的实体如实出现。
   */
  connection?: BriefcaseConnection;
  /** W1.5b：Part Studio scope（质量属性读面）；缺省=legacy 全局 arity。 */
  partStudioId?: string;
  /**
   * B6 M-A3.2a：body 读面（Session useFeatureSystem.bodies 直通，仅在该连接成功
   * 读过 getBodies 时下传）。在场时零件段=**authored active body**（名称取
   * BodyInfo.name，缺省「实体 N」）；consumed/orphan 不入树；legacy 物理元素
   * 全量查询不再发起。undefined=读面不可用 → 回退 legacy 查询（MS<1.15/读面故障，
   * 发布门禁要求 MS minor ≥ web minor，正常栈不会走此回退）。
   */
  bodies?: readonly BodyInfo[];
  /** body 读面加载中（零件段骨架；读面未就绪时不抢先发 legacy 查询）。 */
  bodiesLoading?: boolean;
  /**
   * body 读面失败（I1）：初次失败时在 legacy 行旁显示可见错误条 + 重试（不静默回退）；
   * 已加载后的刷新失败 → 就地错误条。重试走 onRetry=同一 refresh 出口。
   */
  bodiesError?: string;
  /**
   * 视口（I3）：consumed 隐藏 effect 依赖真 viewport——viewport 晚于 getBodies 创建/
   * 重建时必须重跑隐藏。生产宿主（PartStudioSession）显式下传；缺省回退
   * `IModelApp.viewManager.selectedView`（壳期/测试语义）。
   */
  viewport?: ScreenViewport;
  /** 重命名提交（缺省 console.warn；RPC 变异层接线后接管）。 */
  onRename?: (node: TreeNode, name: string) => void;
  /** 编辑特征/零件（FeatureDialog 宿主路由接口）。 */
  onEdit?: (node: TreeNode) => void;
  /** 抑制/取消抑制（特征段专属菜单项）。 */
  onSuppress?: (node: FeatureNode, suppressed: boolean) => void;
  /**
   * 删除提交（HITL 确认后调用）。第二参=deleteFeature.targetBodyId 契约值：
   * 由 `deleteTargetBodyIdForFeature`（getBodies.sourceFeatureId 反查）得出；
   * 无唯一源映射时为 undefined（N>1 时后端诚实拒收，绝不猜测目标）。宿主接线
   * 删除 op 时必须原样透传（B6 M-A5 T2 起 PartStudioSidebar 实现真 op 载荷）。
   */
  onDelete?: (node: TreeNode, targetBodyId?: string) => void;
  /**
   * B6 M-A5 T2：编辑面总门（canEdit 单点合流直通）。false 时删除/抑制菜单项
   * 保持渲染但 disabled（可见 title 提示），handlers 防御性拒收；隐藏/显示
   * （会话态）不受影响。缺省 true（测试/壳期语义；生产宿主恒显式传参）。
   */
  canEdit?: boolean;
  /** 2026-11-13：逐 body 透明度会话态（0..1；零件菜单「使之透明…」滑块）。 */
  bodyTransparency?: Readonly<Record<string, number>>;
  onBodyTransparencyChange?: (bodyKey: string, transparency: number) => void;
}

interface MenuState {
  x: number;
  y: number;
  node: TreeNode;
}

/** 双段配置（id 即 store TreeTab；labelKey 指向 partStudio.sidebar.tree.*）。 */
const TREE_SECTIONS: { id: TreeTab; labelKey: string; testidPrefix: string }[] = [
  { id: 'features', labelKey: 'partStudio.sidebar.tree.features', testidPrefix: 'part-studio-feature' },
  { id: 'parts', labelKey: 'partStudio.sidebar.tree.parts', testidPrefix: 'part-studio-part' },
];

/**
 * 特征段头三工具钮（os-11 段头形态；M4-T8 D3）：插入元素/暂停重建/特征
 * 历史——完整 UI 面铁律（照常渲染可点）；三者均无后端面，登记 gated →
 * 能力引导对话框（capabilities.ts 单一真源；翻转 gated→full 时此处零改动，
 * 真实动作在 handleSectionTool 的 full 分支接线）。
 */
const FEATURE_SECTION_TOOLS: { id: string; labelKey: string; capability: string; icon: OnshapeIconName }[] = [
  { id: 'insert-elements', labelKey: 'partStudio.tree.insertElements', capability: 'insertElement', icon: 'new-folder-button' },
  { id: 'pause-rebuild', labelKey: 'partStudio.tree.pauseRebuild', capability: 'pauseRebuild', icon: 'pause-dialog' },
  { id: 'feature-history', labelKey: 'partStudio.tree.featureHistory', capability: 'featureHistory', icon: 'profile-part-studio' },
];

/**
 * 零件段物理元素查询（诚实呈现）：GeometricElement3d 排除草图元素（M6-c T5
 * 小项批——LubanCAD.Sketch（后端 LubanCadSchema LubanSketch extends
 * GeometricElement3d）是特征树的源节点非零件，Onshape「零件数」语义不含它）
 * 后的 ECInstanceId + CodeValue。子查询排除要求库内已导入 LubanCAD schema
 *（modeling-server FeatureService.ensureInitialized 对每个托管 iModel 首个
 * RPC 即导入——本应用打开的 iModel 均满足；未满足时查询报错=零件段就地
 * 错误条，诚实呈现不静默）。查询失败不静默（就地错误条）；随特征刷新重跑
 *（新实体出现）。
 */
const PARTS_QUERY =
  'SELECT ECInstanceId, CodeValue FROM BisCore.GeometricElement3d ' +
  'WHERE ECInstanceId NOT IN (SELECT ECInstanceId FROM LubanCAD.Sketch)';

function usePhysicalElements(
  connection: BriefcaseConnection | undefined,
  refreshToken: unknown,
  enabled = true,
): {
  parts: PartNode[];
  loading: boolean;
  error?: string;
} {
  const { t } = useTranslation();
  const [parts, setParts] = React.useState<PartNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    // B6 M-A3.2a：body 读面在场/加载中时本 legacy 查询整体停用（不显示其它模型/
    // 引用/副本；读面不可用时才回退，保持既有行为）。
    if (!enabled || !connection) {
      setParts([]);
      setLoading(false);
      setError(undefined);
      return undefined;
    }
    let disposed = false;
    setLoading(true);
    setError(undefined);
    void (async () => {
      try {
        const rows: PartNode[] = [];
        // 诚实呈现数量与名：物理元素行（id + CodeValue；草图元素 ECSQL 端排除）。
        const reader = connection.createQueryReader(PARTS_QUERY);
        for await (const row of reader) {
          const id = String(row[0]);
          const codeValue = row[1];
          rows.push({
            id,
            name:
              typeof codeValue === 'string' && codeValue !== ''
                ? codeValue
                : t('partStudio.tree.unnamedElement', { id }),
            isHidden: false,
          });
        }
        if (!disposed) {
          setParts(rows);
          setLoading(false);
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      disposed = true;
    };
    // refreshToken=特征段条目引用：新特征落库 → 树刷新 → 零件段重查。
    //（web 未启用 exhaustive-deps 规则，依赖数组为手工口径，意图在此注记。）
  }, [connection, refreshToken, enabled, t]);

  return { parts, loading, error };
}

/**
 * body 读面 → 零件段行（B6 M-A3.2a）：只取 **active ∧ authored** body（consumed
 * 已消费、authored=false 的防御形态都不入树）；名称取 BodyInfo.name，缺省按
 * active 列表序「实体 N」；id=bodyKey（元素 id，跨冷重开/undo 稳定，名称不是身份）。
 * 纯函数（单测直测），不触 RPC。
 */
export function activeBodyParts(
  bodies: readonly BodyInfo[],
  defaultBodyName: (index: number) => string,
  massByBodyKey?: ReadonlyMap<string, { volume: number }>,
): PartNode[] {
  return bodies
    .filter((body) => body.active && body.authored !== false)
    .map((body, index) => {
      const volume = massByBodyKey?.get(body.bodyKey)?.volume;
      return {
        id: body.bodyKey,
        name: body.name && body.name.trim() !== '' ? body.name : defaultBodyName(index + 1),
        isHidden: false,
        ...(typeof volume === 'number' && Number.isFinite(volume) ? { volumeMm3: volume } : {}),
      };
    });
}

/**
 * 删除特征的 targetBodyId 映射（B6 M-A3.2a）：getBodies.sourceFeatureId 反查
 * **唯一驱动源**。健康态下每个 body 的链尾就是其唯一源（applyInsert 每次把
 * `feature→body` 重连 + 清旧 `prev→body`），而删除入口只对链尾开放——因此
 * 所有可删特征（newBody 与普通链尾）均能命中。多源/悬挂病理态服务端读面省略
 * sourceFeatureId → undefined（绝不猜测；N>1 由后端诚实拒收）。
 */
export function deleteTargetBodyIdForFeature(
  bodies: readonly BodyInfo[] | undefined,
  featureId: string,
): string | undefined {
  if (!bodies) return undefined;
  return bodies.find(
    (body) => body.active && body.authored !== false && body.sourceFeatureId === featureId,
  )?.bodyKey;
}

/** 段内加载骨架行（loading 态的统一呈现）。 */
function SkeletonRows(): React.JSX.Element {
  return (
    <li className="part-studio-tree__loading" data-testid="part-studio-tree-loading" role="status">
      <span className="part-studio-tree__loading-bar" aria-hidden="true" />
      <span className="part-studio-tree__loading-bar part-studio-tree__loading-bar--short" aria-hidden="true" />
    </li>
  );
}

export function FeatureTree({
  entries,
  pendingSketchName,
  loading,
  error,
  onRetry,
  connection,
  partStudioId,
  bodies,
  bodiesLoading,
  bodiesError,
  viewport,
  onRename,
  onEdit,
  onSuppress,
  onDelete,
  canEdit = true,
  bodyTransparency,
  onBodyTransparencyChange,
}: FeatureTreeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [filterInput, setFilterInput] = React.useState('');
  const filter = React.useMemo(() => parseTreeFilter(filterInput), [filterInput]);
  // B6 M-A3.2a：body 读面在场 → 零件段=active authored body；读面加载中 → 骨架
  // （不抢先跑 legacy 全量查询）；读面不可用（MS<1.15/初次失败）→ legacy 回退。
  // W1.5b：逐 body 质量属性（只读）→ 零件段行体积；随 entries 刷新重读。
  // 仅在 body 读面在场时发起（legacy/壳期/无体不付 RPC）。
  const bodyMass = useBodyMassProperties(
    bodies !== undefined && bodies.length > 0 ? connection : undefined,
    partStudioId,
    entries,
  );
  const bodyParts = React.useMemo(
    () => (bodies === undefined
      ? undefined
      : activeBodyParts(
        bodies,
        (index) => t('partStudio.tree.defaultBodyName', { index }),
        bodyMass.byBodyKey,
      )),
    [bodies, t, bodyMass.byBodyKey],
  );
  const legacyPartsEnabled = bodies === undefined && !bodiesLoading;
  // 零件段查询（随特征刷新重跑：entries 引用即 refreshToken）。
  const physical = usePhysicalElements(connection, entries, legacyPartsEnabled);
  const parts = bodyParts ?? physical.parts;
  const partsLoading = bodies !== undefined
    ? bodiesLoading ?? false
    : bodiesLoading === true || physical.loading;
  const partsError = bodies !== undefined
    ? bodiesError
    : bodiesLoading === true
      ? undefined
      : physical.error;
  // I1：读面初次失败（未 loaded）不得静默回退——legacy 行照常 + 可见错误条与重试。
  const bodiesReadFailed = bodies === undefined && bodiesLoading !== true && bodiesError !== undefined;
  const model = useFeatureTree({ entries, parts, filter });
  // 树→画布 emphasize 联动（hook 内 effect：selectedNodeIds → viewport）。
  // M6-c T5 视口编辑态（采集规格 §视口交互的最小通道）：特征对话框在场时
  // 当前特征作用的 body 橙色高亮（useCanvasSelection extraEmphasizedIds →
  // EmphasizeElements.overrideElements Onshape 橙）。体集=零件段查询产物
  //（草图已滤——单 BodySolid 架构下零件段即体集）；「后续特征半透明灰显」
  // 挂账（per-feature 归属映射缺位，见 useCanvasSelection 头注）。
  const featureDialogOpen = usePartStudioStore((s) => s.dialog.active === 'feature');
  const editHighlightIds = React.useMemo(
    () => (featureDialogOpen ? parts.map((part) => part.id) : []),
    [featureDialogOpen, parts],
  );
  useCanvasSelection(editHighlightIds);

  // B6 M-A3.2a：consumed body 几何视口隐藏（持久元素仍会被渲染——树过滤不够）。
  // neverDrawn 集 = consumed body ∪ store.canvas.hiddenIds（手动隐藏），replace=true
  // 整集重建：撤销恢复 active / 手动隐藏/取消隐藏后都按最新并集重算；并集空时
  // clearHiddenElements 令撤销后的 body 重新可见。无 viewport（壳期/测试）静默跳过。
  // 草图不在此列：2026-11-04 起 LubanCAD.Sketch 不再写 native geometry stream
  // （params 唯一数据源，SketchCurvesDecoration 唯一显示源），无需按元素 id 隐藏。
  const consumedBodiesKey = React.useMemo(
    () => (bodies === undefined
      ? null
      : JSON.stringify(bodies.filter((body) => !body.active).map((body) => body.bodyKey))),
    [bodies],
  );
  const manualHiddenIds = usePartStudioStore((s) => s.canvas.hiddenIds);
  const manualHiddenKey = React.useMemo(() => JSON.stringify(manualHiddenIds), [manualHiddenIds]);
  React.useEffect(() => {
    if (consumedBodiesKey === null) return; // 读面不可用：不接管 neverDrawn（legacy 回退）
    // I3：viewport 是 effect 依赖（真下传优先）——getBodies 先于 viewport 创建时，
    // viewport 出现后重跑并应用隐藏；重建/切换视口同理。壳期无下传时回退 selectedView。
    const targetViewport = viewport ?? IModelApp.viewManager?.selectedView;
    if (!targetViewport) return;
    const consumed = JSON.parse(consumedBodiesKey) as string[];
    const manual = JSON.parse(manualHiddenKey) as string[];
    const union = [...new Set([...consumed, ...manual])];
    try {
      const emphasize = EmphasizeElements.getOrCreate(targetViewport);
      if (union.length > 0) emphasize.hideElements(union, targetViewport, true);
      else emphasize.clearHiddenElements(targetViewport);
    } catch (err) {
      console.warn('[part-studio] consumed body 隐藏应用失败（无真实视口？）', err);
    }
  }, [consumedBodiesKey, manualHiddenKey, viewport]);
  // T6 草图模式：活动草图行红显（os-30 树红显进行中草图）。
  const sketchActive = usePartStudioStore((s) => s.sketch.isActive);
  const activeSketchId = usePartStudioStore((s) => s.sketch.activeSketchId);
  // M6-a T7：草图节点编辑入口（双击+右键两路同义）——enterSketch 进草图模式，
  // ribbon 变身/栅格覆盖层/树红显全由既有 sketch 切片消费面驱动。
  const enterSketch = usePartStudioStore((s) => s.enterSketch);
  // Onshape：双击草图行进入编辑时同时打开草图对话框（平面/选项 + ✓/✗）。
  const openSketchDialog = usePartStudioStore((s) => s.openSketchDialog);
  // B6 M-A5 T2：逐 body 可见性走会话态 store（hide/show 单一通道）——不直接触
  // EmphasizeElements；consumed∪manual neverDrawn effect 按 hiddenIds 重算。
  const hideNodes = usePartStudioStore((s) => s.hideNodes);
  const showNodes = usePartStudioStore((s) => s.showNodes);
  const handleToggleVisibility = React.useCallback(
    (node: TreeNode) => {
      if (isNodeHidden(node)) showNodes([node.id]);
      else hideNodes([node.id]);
    },
    [hideNodes, showNodes],
  );
  // Onshape part menu（2026-11-13）：隐藏其他零件 / 隐藏所有零件——会话级批量隐藏
  // （同一 store.hiddenIds 通道；不改 iModel，不可撤销属 Onshape 同口径显示态）。
  const handleHideOtherParts = React.useCallback(
    (node: TreeNode) => {
      const ids = parts.filter((part) => part.id !== node.id).map((part) => part.id);
      if (ids.length > 0) hideNodes(ids);
    },
    [parts, hideNodes],
  );
  const handleHideAllParts = React.useCallback(
    () => {
      const ids = parts.map((part) => part.id);
      if (ids.length > 0) hideNodes(ids);
    },
    [parts, hideNodes],
  );

  // Onshape live（2026-11-12）：树右键「放大选定对象」——part 行按元素 id 缩放；
  // 特征行在其直接驱动的 body 可定位时缩放该体（单 body 文档退化为唯一 active
  // body），多体非链尾特征如实禁用（title 说明），不猜归属。
  const zoomToElementIds = React.useCallback((ids: readonly string[]) => {
    if (ids.length === 0)
      return;
    const targetViewport = viewport ?? IModelApp.viewManager?.selectedView;
    if (!targetViewport)
      return;
    try {
      targetViewport.zoomToElements([...ids]);
    } catch (err) {
      console.warn('[part-studio] 树缩放定位失败（无真实视口？）', err);
    }
  }, [viewport]);
  const zoomTargetForFeature = React.useCallback((node: FeatureNode): readonly string[] => {
    const direct = deleteTargetBodyIdForFeature(bodies, node.id);
    if (direct)
      return [direct];
    const activeBodies = (bodies ?? []).filter((body) => body.active && body.authored !== false);
    return activeBodies.length === 1 ? [activeBodies[0]!.bodyKey] : [];
  }, [bodies]);
  // Onshape live：树选中右键菜单可在原清空选择；part 行「属性…」只读对话框。
  const clearTreeSelection = React.useCallback(() => {
    model.selectNodes([]);
  }, [model]);
  const [propertiesNode, setPropertiesNode] = React.useState<PartNode | null>(null);
  // 2026-11-13：零件「使之透明…」会话滑块（Onshape 同一工具面板的简化切片；
  // 仅逐 body 透明度，展开/零部件控制等未做——如实登记）。
  const [transparencyNode, setTransparencyNode] = React.useState<PartNode | null>(null);
  const [transparencyPercent, setTransparencyPercent] = React.useState(0);
  const setDockTab = usePartStudioStore((s) => s.setDockTab);
  const openDock = usePartStudioStore((s) => s.openDock);
  const handleOpenAppearances = React.useCallback(() => {
    setDockTab('display');
    openDock();
  }, [openDock, setDockTab]);

  const [collapsed, setCollapsed] = React.useState<Record<TreeTab, boolean>>({
    features: false,
    parts: false,
  });
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  // 菜单视口夹紧（Onshape：靠底部时上翻，靠右时左移）——长菜单（零件行 14 项）
  // 在行位于屏幕下半区时不得溢出视口（真栈实测 click 不可达）。
  const [menuShift, setMenuShift] = React.useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const menuElementRef = React.useRef<HTMLDivElement | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<TreeNode | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  // 段头三钮的 gated 引导对话框（D3：能力注册表路由的对话框状态）。
  const [gatedCapability, setGatedCapability] = React.useState<string | null>(null);

  // 菜单开合：外部 mousedown / Escape 收合（画布菜单同口径）。
  // M4-T8 收 M3 终审 T5-⑤（同款）：监听一次注册——挂载期一次到位，menu 经
  // ref 取用，不随每次右键（menu 对象重建）重挂一对监听。
  const menuRef = React.useRef<MenuState | null>(null);
  menuRef.current = menu;
  React.useEffect(() => {
    const close = () => {
      if (menuRef.current) setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
    // 监听终身一次挂载；闭包内一律走 ref（意图在此注记，非遗漏依赖）。
  }, []);

  // 菜单打开后按真实尺寸夹紧到视口内（layout effect：绘制前修正，避免闪跳）。
  React.useLayoutEffect(() => {
    if (!menu) {
      setMenuShift({ dx: 0, dy: 0 });
      return;
    }
    const el = menuElementRef.current;
    if (!el)
      return;
    const rect = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (rect.bottom > window.innerHeight - 8)
      dy = window.innerHeight - 8 - rect.bottom;
    if (rect.right > window.innerWidth - 8)
      dx = window.innerWidth - 8 - rect.right;
    if (rect.top + dy < 8)
      dy = 8 - rect.top;
    if (rect.left + dx < 8)
      dx = 8 - rect.left;
    if (dx !== 0 || dy !== 0)
      setMenuShift({ dx, dy });
  }, [menu]);

  const setActiveTreeTab = usePartStudioStore((s) => s.setActiveTreeTab);

  const handleSectionHeader = React.useCallback(
    (tab: TreeTab) => {
      setActiveTreeTab(tab);
      setCollapsed((prev) => ({ ...prev, [tab]: !prev[tab] }));
    },
    [setActiveTreeTab],
  );

  // 段头工具钮（D3）：能力注册表路由——gated → 能力引导对话框；full → 真实
  // 动作接线位（三者今日均 gated，full 分支诚实占位）。
  const handleSectionTool = React.useCallback((capability: string) => {
    if (isGated(capability)) {
      setGatedCapability(capability);
      return;
    }
    console.warn(`[part-studio] 段头工具 ${capability} 未接线（full 直行通道）`);
  }, []);

  const handleRowContextMenu = React.useCallback(
    (node: TreeNode, event: React.MouseEvent) => {
      event.preventDefault();
      // 右键即选中（os-15：右键行先成选中态再弹菜单）。
      model.selectNodes([node.id]);
      setMenuShift({ dx: 0, dy: 0 });
      setMenu({ x: event.clientX, y: event.clientY, node });
    },
    [model],
  );

  // M6-a T7：编辑既有草图 = 进草图模式编辑该草图（enterSketch 真 id）。
  // M6-b T1（挂账清偿）：平面回显自树行 params.plane 读（后端 insertSketch 落库
  // params={entities,constraints,plane?}，getTree 草图行 params 随 JSON 下发）——
  // enterSketch 恒归零 activeSketchPlane（防上一草图会话残留串场）后紧跟回显：
  // 有 plane → setActiveSketchPlane(dto)，进草图模式后 AccuDraw/绘制投影即用真平面；
  // 无 plane（旧库/未携平面）→ null=契约缺省 XY@z=0（与新建未选平面同语义）。
  const setActiveSketchPlane = usePartStudioStore((s) => s.setActiveSketchPlane);
  const handleEditSketch = React.useCallback(
    (node: TreeNode) => {
      const entry = entries?.find((e) => e.id === node.id);
      const plane = (entry?.params as { plane?: SketchPlaneDto } | undefined)?.plane;
      enterSketch(node.id);
      setActiveSketchPlane(plane ?? null);
      openSketchDialog(node.id);
    },
    [enterSketch, setActiveSketchPlane, openSketchDialog, entries],
  );

  // 双击路由（Onshape 语义=双击进编辑）：草图 → 进草图模式 + 草图对话框；
  // 特征 → 打开 FeatureDialog edit（updateParams 二次编辑）。
  const handleRowDoubleClick = React.useCallback(
    (node: TreeNode) => {
      if (isSketchNode(node)) {
        handleEditSketch(node);
        return;
      }
      if (isFeatureNode(node) && onEdit) onEdit(node);
    },
    [handleEditSketch, onEdit],
  );

  const handleRename = React.useCallback(
    (node: TreeNode, name: string) => {
      setEditingId(null);
      if (onRename) {
        onRename(node, name);
      } else {
        console.warn(`[part-studio] 重命名 ${node.name} → ${name}（onRename 未接线）`);
      }
    },
    [onRename],
  );

  const renderRow = (node: TreeNode): React.JSX.Element => (
    <TreeRow
      key={node.id}
      node={node}
      selected={model.selectedNodeIds.includes(node.id)}
      sketchActive={sketchActive && activeSketchId === node.id}
      onSelect={(n) => model.selectNodes([n.id])}
      onContextMenu={handleRowContextMenu}
      onDoubleClick={handleRowDoubleClick}
      editing={editingId === node.id}
      onCommitRename={handleRename}
      onCancelRename={() => setEditingId(null)}
      onToggleVisibility={handleToggleVisibility}
    />
  );

  /** 段内态行序：loading 骨架 → 就地错误条 → 行/empty（六态统一出口）。 */
  const renderSectionRows = (options: {
    loading: boolean;
    error?: string;
    rows: readonly TreeNode[];
    emptyText: string;
    retryable?: boolean;
    /** 特征段有默认几何组垫底，不再显示「暂无特征」空态。 */
    suppressEmpty?: boolean;
  }): React.JSX.Element => {
    const { loading: sectionLoading, error: sectionError, rows, emptyText, retryable, suppressEmpty } = options;
    if (sectionLoading) return <SkeletonRows />;
    if (sectionError) {
      return (
        <li className="part-studio-tree__error" role="alert" data-testid="part-studio-tree-error">
          <span className="part-studio-tree__error-text">
            {t('partStudio.tree.loadFailed', { message: sectionError })}
          </span>
          {retryable && onRetry && (
            <button
              type="button"
              className="part-studio-tree__retry"
              onClick={onRetry}
            >
              {t('partStudio.tree.retry')}
            </button>
          )}
        </li>
      );
    }
    if (rows.length === 0 && filterInput === '' && !suppressEmpty) {
      return <li className="part-studio-tree__empty">{emptyText}</li>;
    }
    return <>{rows.map(renderRow)}</>;
  };

  // 右键菜单当前行（窄化载体：分支内/闭包内一律用它，避免 menu.node 的
  // 联合型在回调中失去窄化——part 行守卫与特征项分别收敛到 PartNode/FeatureNode）。
  const menuNode = menu?.node;

  return (
    <div className="part-studio-tree" data-testid="part-studio-tree">
      <TreeFilter value={filterInput} onChange={setFilterInput} />

      {TREE_SECTIONS.map((section) => {
        const isCollapsed = collapsed[section.id];
        const isFeatures = section.id === 'features';
        const rows = isFeatures ? model.featureRows : model.partRows;
        // Onshape live（2026-11-12）：过滤态计数显示「匹配/总数」——特征 (1/12)
        //（总数为全部用户特征+默认几何图元+待确认草图；零件段同理不含图元）。
        const pendingCount = filterInput === '' && pendingSketchName !== undefined ? 1 : 0;
        const matchedCount = isFeatures
          ? rows.length + (filterInput === '' ? DEFAULT_DATUM_COUNT : 0) + pendingCount
          : rows.length;
        const totalCount = isFeatures
          ? (entries?.length ?? 0) + DEFAULT_DATUM_COUNT + pendingCount
          : parts.length;
        const countText = filterInput === '' ? `(${matchedCount})` : `(${matchedCount}/${totalCount})`;
        return (
          <section
            key={section.id}
            className={`part-studio-tree__section part-studio-tree__section--${section.id}`}
          >
            <div className="part-studio-tree__section-header-row">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                className="part-studio-tree__section-header"
                data-testid={`part-studio-${section.id === 'features' ? 'feature' : 'part'}-section-header`}
                onClick={() => handleSectionHeader(section.id)}
              >
                {section.id === 'parts' && (
                  <OnshapeIcon name={isCollapsed ? 'collapsed' : 'expanded'} size={10} />
                )}
                <span>{t(section.labelKey)}</span>
                <span
                  className="part-studio-tree__count"
                  data-testid={`${section.testidPrefix}-count`}
                >
                  {countText}
                </span>
              </button>
              {/* 特征段头三工具钮（Onshape live：new-folder / pause / profile）。 */}
              {isFeatures && (
                <div
                  className="part-studio-tree__section-tools"
                  role="group"
                  aria-label={t('partStudio.tree.sectionToolsLabel')}
                >
                  {FEATURE_SECTION_TOOLS.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      className="part-studio-tree__section-tool"
                      aria-label={t(tool.labelKey)}
                      title={t(tool.labelKey)}
                      data-testid={`part-studio-tree-tool-${tool.id}`}
                      onClick={() => handleSectionTool(tool.capability)}
                    >
                      <OnshapeIcon name={tool.icon} size={20} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isCollapsed && (
              <ul className="part-studio-tree__list" data-testid={`part-studio-${section.id === 'features' ? 'feature' : 'part'}-list`}>
                {isFeatures
                  ? (
                    <>
                      {/* Onshape 默认几何图元组：位于用户特征之前；过滤态下隐藏。 */}
                      {filterInput === '' && <DefaultGeometryGroup />}
                      {/* Onshape live：新建草图对话框打开即出现高亮「草图 N」行
                          （✓ 前即存在；✗ 关闭即消失；确认后由真实树行接替）。 */}
                      {filterInput === '' && pendingSketchName !== undefined && (
                        <TreeRow
                          node={{
                            id: '__pending-sketch__',
                            name: pendingSketchName,
                            type: 'sketch',
                            hasError: false,
                            isSuppressed: false,
                            isHidden: false,
                          }}
                          selected
                          onSelect={() => {}}
                          onContextMenu={() => {}}
                          editing={false}
                          onCommitRename={() => {}}
                          onCancelRename={() => {}}
                        />
                      )}
                      {renderSectionRows({
                        loading: loading ?? false,
                        error,
                        rows,
                        emptyText: t('partStudio.sidebar.tree.emptyFeatures'),
                        retryable: true,
                        suppressEmpty: true,
                      })}
                      {/* Onshape 特征链末端的回滚条（live：渐变横条，UI 视觉锚点）。 */}
                      {filterInput === '' && !loading && !error && (
                        <li className="part-studio-tree__rollback" aria-hidden="true" />
                      )}
                    </>
                  )
                  : (
                    <>
                      {/* I1：读面初次失败的可见错误 + 重试（legacy 回退不再静默）。 */}
                      {bodiesReadFailed && (
                        <li
                          className="part-studio-tree__error"
                          role="alert"
                          data-testid="part-studio-part-read-surface-error"
                        >
                          <span className="part-studio-tree__error-text">
                            {t('partStudio.tree.bodiesReadFailed', { message: bodiesError })}
                          </span>
                          {onRetry && (
                            <button
                              type="button"
                              className="part-studio-tree__retry"
                              onClick={onRetry}
                            >
                              {t('partStudio.tree.retry')}
                            </button>
                          )}
                        </li>
                      )}
                      {renderSectionRows({
                        loading: partsLoading,
                        error: partsError,
                        rows,
                        emptyText: t('partStudio.sidebar.tree.emptyParts'),
                        // Onshape live：零件数 (0) 下不渲染「暂无零件」占位行。
                        suppressEmpty: true,
                        // body 读面错误复用特征段 onRetry（同一 refresh 同时刷树+bodies）。
                        retryable: bodies !== undefined && onRetry !== undefined,
                      })}
                    </>
                  )}
              </ul>
            )}
          </section>
        );
      })}

      {/* 行右键菜单（Onshape live 2026-11-12：条目/分组顺序逐项对齐；未支持项
          禁用并 title 说明——不提供假动作、不静默 no-op）。 */}
      {menu && menuNode && (isFeatureNode(menuNode) ? (
        <div
          ref={menuElementRef}
          className="part-studio-tree-menu"
          role="menu"
          aria-label={t('partStudio.tree.contextMenuLabel')}
          style={{ left: menu.x + menuShift.dx, top: menu.y + menuShift.dy }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            onClick={() => {
              setMenu(null);
              setEditingId(menuNode.id);
            }}
          >
            <span className="part-studio-menu-item-icon" aria-hidden="true"><SvgEdit /></span>
            {t('partStudio.tree.rename')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          {isSketchNode(menuNode) ? (
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              onClick={() => {
                setMenu(null);
                handleEditSketch(menuNode);
              }}
            >
              <span className="part-studio-menu-item-icon" aria-hidden="true"><SvgDraw /></span>
              {t('partStudio.tree.editSketch')}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              onClick={() => {
                setMenu(null);
                if (onEdit) {
                  onEdit(menuNode);
                } else {
                  console.warn(`[part-studio] 编辑 ${menuNode.name}（onEdit 未接线）`);
                }
              }}
            >
              <span className="part-studio-menu-item-icon" aria-hidden="true"><SvgEditAll /></span>
              {t('partStudio.tree.edit')}
            </button>
          )}
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuAddToFolder')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuSectionView')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled={!canEdit}
            title={canEdit ? undefined : t('partStudio.tree.readonlyHint')}
            onClick={() => {
              if (!canEdit) return;
              setMenu(null);
              if (onSuppress) {
                onSuppress(menuNode, !menuNode.isSuppressed);
              } else {
                console.warn(`[part-studio] ${menuNode.isSuppressed ? '取消抑制' : '抑制'} ${menuNode.name}（onSuppress 未接线）`);
              }
            }}
          >
            <span className="part-studio-menu-item-icon" aria-hidden="true">
              {menuNode.isSuppressed ? <SvgVisibilityShow /> : <SvgHideManuallySuppressed />}
            </span>
            {menuNode.isSuppressed
              ? t('partStudio.tree.unsuppress')
              : t('partStudio.tree.suppress')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuDynamicSuppress')}
            <span className="part-studio-tree-menu__submenu" aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuAddExpression')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuAddComment')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          {(() => {
            const targetIds = zoomTargetForFeature(menuNode);
            return (
              <button
                type="button"
                role="menuitem"
                className="part-studio-tree-menu__item"
                disabled={targetIds.length === 0}
                title={targetIds.length === 0 ? t('partStudio.tree.zoomUnsupported') : undefined}
                onClick={() => {
                  setMenu(null);
                  zoomToElementIds(targetIds);
                }}
              >
                {t('partStudio.tree.menuZoomToSelection')}
              </button>
            );
          })()}
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            onClick={() => {
              setMenu(null);
              clearTreeSelection();
            }}
          >
            {t('partStudio.tree.menuClearSelection')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuShowDependencies')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuRollbackHere')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuAppearanceForSelection', { count: Math.max(1, model.selectedNodeIds.length) })}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item part-studio-tree-menu__item--danger"
            disabled={!canEdit}
            title={canEdit ? undefined : t('partStudio.tree.readonlyHint')}
            onClick={() => {
              if (!canEdit) return;
              setPendingDelete(menuNode);
              setMenu(null);
            }}
          >
            <span className="part-studio-menu-item-icon" aria-hidden="true"><SvgDelete /></span>
            {t('partStudio.tree.delete')}
          </button>
        </div>
      ) : (
        /* Onshape live（2026-11-12）：零件行菜单分组与顺序；隐藏/放大/属性/外观
           为真实动作，其余未支持项禁用。 */
        <div
          ref={menuElementRef}
          className="part-studio-tree-menu"
          role="menu"
          aria-label={t('partStudio.tree.contextMenuLabel')}
          style={{ left: menu.x + menuShift.dx, top: menu.y + menuShift.dy }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled={!canEdit}
            title={canEdit ? undefined : t('partStudio.tree.readonlyHint')}
            onClick={() => {
              if (!canEdit) return;
              setMenu(null);
              setEditingId(menuNode.id);
            }}
          >
            {t('partStudio.tree.rename')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            data-testid="tree-menu-properties"
            onClick={() => {
              setMenu(null);
              setPropertiesNode(menuNode);
            }}
          >
            {t('partStudio.tree.menuProperties')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuAssignMaterial')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            data-testid="tree-menu-edit-appearance"
            onClick={() => {
              setMenu(null);
              handleOpenAppearances();
            }}
          >
            {t('partStudio.tree.menuEditAppearance')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuCopyHere')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuCreateDrawing', { name: menuNode.name })}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuExport')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuPublish')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            onClick={() => {
              setMenu(null);
              handleToggleVisibility(menuNode);
            }}
          >
            <span className="part-studio-menu-item-icon" aria-hidden="true">
              <OnshapeIcon name={isNodeHidden(menuNode) ? 'eye_open' : 'eye_closed'} size={16} />
            </span>
            {isNodeHidden(menuNode)
              ? t('partStudio.tree.showBody')
              : t('partStudio.tree.hideBody')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            onClick={() => {
              setMenu(null);
              handleHideOtherParts(menuNode);
            }}
          >
            {t('partStudio.tree.hideOtherParts')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            onClick={() => {
              setMenu(null);
              handleHideAllParts();
            }}
          >
            {t('partStudio.tree.hideAllParts')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuIsolate')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            data-testid="tree-menu-make-transparent"
            onClick={() => {
              setMenu(null);
              setTransparencyPercent(Math.round(((bodyTransparency?.[menuNode.id] ?? 0) * 100)));
              setTransparencyNode(menuNode);
            }}
          >
            {t('partStudio.tree.menuMakeTransparent')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuAddComment')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            data-testid="tree-menu-zoom"
            onClick={() => {
              setMenu(null);
              zoomToElementIds([menuNode.id]);
            }}
          >
            {t('partStudio.tree.menuZoomToSelection')}
          </button>
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item part-studio-tree-menu__item--danger"
            disabled
            title={t('partStudio.tree.unsupported')}
          >
            {t('partStudio.tree.menuDeletePart')}
          </button>
        </div>
      ))}

      {/* 删除 HITL 确认（预览=目标具名提示；确认后才提交 onDelete）。 */}
      {pendingDelete && (
        <div className="part-studio-dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('partStudio.tree.deleteTitle', { name: pendingDelete.name })}
            className="part-studio-capability-dialog"
          >
            <h2 className="part-studio-capability-dialog__title">
              {t('partStudio.tree.deleteTitle', { name: pendingDelete.name })}
            </h2>
            <p className="part-studio-capability-dialog__message">
              {t('partStudio.tree.deleteMessage', { name: pendingDelete.name })}
            </p>
            <div className="part-studio-capability-dialog__actions part-studio-capability-dialog__actions--split">
              <button
                type="button"
                className="part-studio-capability-dialog__secondary"
                onClick={() => setPendingDelete(null)}
              >
                {t('partStudio.tree.cancel')}
              </button>
              <button
                type="button"
                className="part-studio-capability-dialog__danger"
                onClick={() => {
                  const node = pendingDelete;
                  setPendingDelete(null);
                  // B6 M-A5 T2：canEdit=false 防御性拒收（菜单项已禁用，此处兜底
                  // 程序化/竞态路径——绝不发起删除回调）。
                  if (!canEdit) return;
                  if (onDelete) {
                    // B6 M-A3.2a：第二参=deleteFeature.targetBodyId（getBodies.sourceFeatureId
                    // 反查；无唯一源映射=undefined，N>1 由后端诚实拒收）。
                    onDelete(node, deleteTargetBodyIdForFeature(bodies, node.id));
                  } else {
                    console.warn(`[part-studio] 删除 ${node.name}（onDelete 未接线）`);
                  }
                }}
              >
                {t('partStudio.tree.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 零件属性（Onshape live 右键「属性…」）：只读、只呈现已有读面（名称/
          体积/可见性），不伪造材料/质量等未读字段。 */}
      {propertiesNode && (
        <div className="part-studio-dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('partStudio.tree.propertiesTitle', { name: propertiesNode.name })}
            className="part-studio-capability-dialog"
            data-testid="part-properties-dialog"
          >
            <h2 className="part-studio-capability-dialog__title">
              {t('partStudio.tree.propertiesTitle', { name: propertiesNode.name })}
            </h2>
            <dl className="part-studio-tree-properties">
              <dt>{t('partStudio.tree.propertiesVolume')}</dt>
              <dd data-testid="part-properties-volume">
                {propertiesNode.volumeMm3 !== undefined && Number.isFinite(propertiesNode.volumeMm3)
                  ? formatPartVolume(propertiesNode.volumeMm3)
                  : '—'}
              </dd>
              <dt>{t('partStudio.tree.propertiesVisibility')}</dt>
              <dd>
                {isNodeHidden(propertiesNode)
                  ? t('partStudio.tree.propertiesHidden')
                  : t('partStudio.tree.propertiesVisible')}
              </dd>
            </dl>
            <div className="part-studio-capability-dialog__actions">
              <button
                type="button"
                className="part-studio-capability-dialog__secondary"
                onClick={() => setPropertiesNode(null)}
              >
                {t('partStudio.tree.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {transparencyNode && (
        <div className="part-studio-dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('partStudio.tree.transparencyTitle', { name: transparencyNode.name })}
            className="part-studio-capability-dialog"
            data-testid="part-transparency-dialog"
          >
            <h2 className="part-studio-capability-dialog__title">
              {t('partStudio.tree.transparencyTitle', { name: transparencyNode.name })}
            </h2>
            <label className="part-studio-tree-properties">
              <span>{t('partStudio.tree.transparencyLevel', { value: transparencyPercent })}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={transparencyPercent}
                data-testid="part-transparency-slider"
                aria-label={t('partStudio.tree.transparencyLevel', { value: transparencyPercent })}
                onChange={(event) => setTransparencyPercent(Number(event.currentTarget.value))}
              />
            </label>
            <div className="part-studio-capability-dialog__actions">
              <button
                type="button"
                className="part-studio-capability-dialog__secondary"
                onClick={() => {
                  onBodyTransparencyChange?.(transparencyNode.id, 0);
                  setTransparencyNode(null);
                }}
              >
                {t('partStudio.tree.transparencyClear')}
              </button>
              <button
                type="button"
                className="part-studio-capability-dialog__secondary"
                onClick={() => setTransparencyNode(null)}
              >
                {t('partStudio.tree.cancel')}
              </button>
              <button
                type="button"
                className="part-studio-capability-dialog__primary"
                data-testid="part-transparency-apply"
                onClick={() => {
                  onBodyTransparencyChange?.(transparencyNode.id, transparencyPercent / 100);
                  setTransparencyNode(null);
                }}
              >
                {t('partStudio.tree.transparencyApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 段头三钮 gated 引导对话框（D3：能力注册表路由的引导面）。 */}
      <CapabilityDialog capability={gatedCapability} onClose={() => setGatedCapability(null)} />
    </div>
  );
}
