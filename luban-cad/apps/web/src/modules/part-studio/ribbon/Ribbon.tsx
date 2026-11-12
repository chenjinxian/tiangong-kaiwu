/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Ribbon（M3 Task 4）：工具条（对齐 os-11 第二行）——27 工具按 RIBBON_GROUP_ORDER
 * 分组渲染（组间分隔条），8 个「图标 + ▾」飞出菜单（RibbonDropdown），右端
 * 命令搜索触发钮（os-11 command-search-trigger）。gated 工具照常可点（完整
 * UI 面：不灰化不删减），点击开能力引导对话框（spec §5）。命令搜索亮显
 * （os-23 勾选）经 store commandPalette.query 驱动命中工具高亮。
 *
 * useToolActivation：ribbon/palette 统一的激活路由——gated → 能力引导；
 * full → IModelApp.tools.run（id 校准见 ribbon-registry 文件头）+
 * 写 store tool.activeToolId（主钮激活态）。T6 特例：newSketch 开 SketchDialog
 * （os-30 创建草图流程：平面选择+四开关，确认后进草图模式），真实 sketch
 * 工具接线前不经 tools.run。M4-T6 特例：extrude 开 FeatureDialog（new/extrude，
 * 拉伸闭环入口）。M6-b T4/T6 特例：revolve/RoundEdges（圆角）同姿态开
 * FeatureDialog（参数化特征链入口；RoundEdges 直改工具虽仍在册，ribbon/命令
 * 搜索入口已改道对话框——直改通道后续按需单裁入口）。B3：SweepFaces（扫掠）
 * 同姿态改道 new/sweep 对话框（轮廓+路径双草图通道）。B6 M-A4.2a：booleanBodies
 * （布尔运算，原「capability full 但 tools.run 无注册工具」的死命令）改道
 * new/booleanBodies 对话框（target/tools bodyRefs + operation + keepTools），
 * 不再假启动；M7 草图布尔页签通道不变。CapabilityDialog：gated 引导
 * 面（CAPABILITY_GUIDANCE 文案；documents 模块的 CapabilityDialog 绑定
 * GatedCreateAction + documents 命名空间，不可复用，故 part-studio 自建）。
 *
 * T6 草图模式变身（os-30）：store.sketch.isActive → 工具条整体切换为草图
 * 工具组（SKETCH_TOOL_GROUP_ORDER 三组），特征工具组隐去；命令搜索触发钮
 * 禁用（os-30「search 框禁用」）；退出草图走草图对话框绿色 ✓（Onshape 无
 * 额外工具栏退出按钮；2026-11-02 对齐移除原右端按钮，2026-11-03 删除
 * SketchPanel 后同一对话框兼任编辑/完成）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp } from '@itwin/core-frontend';
import { CAPABILITY_GUIDANCE, isGated } from '../internal/capabilities.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import {
  ONSHAPE_RIBBON_GROUP_ORDER,
  RIBBON_TOOLS,
  allRibbonCommands,
  findRibbonCommand,
  onshapeIconFor,
} from './ribbon-registry.js';
import type { RibbonIcon, RibbonTool } from './ribbon-registry.js';
import { SKETCH_PLACEHOLDER_IDS, SKETCH_TOOL_GROUP_ORDER, SKETCH_RIBBON_TOOLS } from './sketch-tools.js';
import type { SketchRibbonTool } from './sketch-tools.js';
import { RibbonDropdown } from './RibbonDropdown.js';

/** useToolActivation 出口：激活路由 + gated 引导对话框状态。 */
export interface ToolActivation {
  /** 激活命令（toolId 或下拉子项 id）：gated → 引导对话框；full → tools.run。 */
  activate: (id: string) => Promise<void>;
  /** 当前待引导的 gated capability（null=对话框关闭）。 */
  gatedCapability: string | null;
  closeGatedDialog: () => void;
}

/**
 * 工具激活路由（ribbon/CommandPalette 共用）：gated capability 开能力引导；
 * 否则写 store 激活态并投 IModelApp.tools.run。未接线命令（id 非真实
 * toolId）由 tools.run 返回 false/抛错打警告——后续里程碑接线。
 * T6：newSketch 例外路由——开 SketchDialog（os-30），不经 tools.run。
 * M4-T6：extrude 例外路由——开 FeatureDialog（new/extrude，拉伸闭环入口：
 * 提交走 useFeatureSystem.applyOp 的 insertFeature，非 PrimitiveTool），
 * 同 newSketch 姿态；真实特征工具化（画布拾取预览）时再裁。
 * M6-b T4/T6：revolve/RoundEdges（圆角）例外路由——同姿态开 new 对话框
 * （圆角经对话框「添加边」驱动 FilletEdgePickTool 拾取）。
 */
export function useToolActivation(canEdit = true): ToolActivation {
  const [gatedCapability, setGatedCapability] = React.useState<string | null>(null);
  const setActiveTool = usePartStudioStore((s) => s.setActiveTool);
  const openSketchDialog = usePartStudioStore((s) => s.openSketchDialog);
  const openFeatureDialog = usePartStudioStore((s) => s.openFeatureDialog);

  const activate = React.useCallback(async (id: string) => {
    // P2.4 A 只读/权限只读总门：所有写工具/特征对话框入口不响应（gated 能力
    // 引导属纯信息面，仍放行到下方 isGated 分支）。
    if (!canEdit) {
      const command = findRibbonCommand(id);
      if (!isGated(command?.capability ?? id)) return;
    }
    // 2026-11-02：Onshape 草图工具栏里尚未实现的按钮/变体——保留 UI，点击无行为。
    if (SKETCH_PLACEHOLDER_IDS.has(id)) return;
    if (id === 'sketchTrim') {
      // 2026-11-12：草图修剪——Onshape「修剪」工具（toolId Sketch.Trim，真实
      // PrimitiveTool）。reminder：ribbon 命令 id=sketchTrim 只是入口键，
      // 工具 id 用点号族名；store 记入口 id 以驱动 ribbon 高亮。
      setActiveTool('sketchTrim');
      const started = await IModelApp.tools.run('Sketch.Trim');
      if (!started)
        console.warn('[part-studio] Sketch.Trim 未启动');
      return;
    }
    if (id === 'sketchExtend') {
      // 2026-11-12：草图延伸——Onshape Extend（与修剪同一按钮的下拉项，
      // toolId Sketch.Extend）。
      setActiveTool('sketchExtend');
      const started = await IModelApp.tools.run('Sketch.Extend');
      if (!started)
        console.warn('[part-studio] Sketch.Extend 未启动');
      return;
    }
    if (id === 'sketchFillet') {
      // 2026-11-12：草图圆角——Onshape 点击角点立即生成 R 尺寸的圆弧
      // （toolId Sketch.Fillet）。
      setActiveTool('sketchFillet');
      const started = await IModelApp.tools.run('Sketch.Fillet');
      if (!started)
        console.warn('[part-studio] Sketch.Fillet 未启动');
      return;
    }
    if (id === 'sketchInsertDxf') {
      // 2026-11-12：草图「插入 DXF 或 DWG」——ASCII DXF → 当前活动草图图元。
      const { importSketchDxfFromFile } = await import('../internal/sketch-dxf-import.js');
      importSketchDxfFromFile();
      return;
    }
    if (id === 'newSketch') {
      // os-30：草图命令开 SketchDialog（平面选择+四开关，确认进草图模式）；
      // 真实 sketch 工具接线前不经 tools.run（接线时移除本特例）。
      openSketchDialog();
      return;
    }
    if (id === 'cPlane') {
      // ADR-0006 切片 B1：cPlane 闭环入口——专用 CPlaneDialog（参考基准面/偏移/反转法线），
      // 提交 insertFeature cPlane；不投任何直改工具。
      openFeatureDialog({ mode: 'new', featureType: 'cPlane' });
      return;
    }
    if (id === 'extrude') {
      // M4-T6 拉伸闭环入口：new/extrude 对话框（宿主 PartStudioCanvas 按
      // dialog 寻址渲染 + 提交接 applyOp），不经 tools.run。
      // v1.52：upToSurface 目标面在路由时快照（对话框打开即清选择；与 mirror/shell 同口径）。
      const inputFaces = usePartStudioStore.getState().canvas.selection
        .filter((entry) => entry.kind === 'face' && entry.topologyId !== undefined);
      openFeatureDialog({
        mode: 'new',
        featureType: 'extrude',
        ...(inputFaces.length > 0 ? { inputFaces } : {}),
      });
      return;
    }
    if (id === 'revolve') {
      // M6-b T4 旋转闭环入口：new/revolve 对话框（M4-T6 同姿态——草图通道
      // 面域+轴拾取），不经 tools.run。
      openFeatureDialog({ mode: 'new', featureType: 'revolve' });
      return;
    }
    if (id === 'CreateHole') {
      // ADR-0006 切片 A：new/hole 对话框（草图点定位 + blind/throughAll），
      // 参数化特征链入口，不经旧的死命令 CreateHoleTool。
      openFeatureDialog({ mode: 'new', featureType: 'hole' });
      return;
    }
    if (id === 'loft') {
      // B2 loft 闭环入口：new/loft 对话框（双截面草图选择器——参数化特征链，
      // 首版两平行截面）。ribbon 注册表的 'loft' 无对应注册工具（伪 toolId：
      // 真实 LoftProfiles 工具 id 不同且为直改通道），点击原会静默 run 失败——
      // 特例改道对话框（同 extrude/revolve 姿态）。
      openFeatureDialog({ mode: 'new', featureType: 'loft' });
      return;
    }
    if (id === 'SweepFaces') {
      // B3 sweep 闭环入口：new/sweep 对话框（轮廓草图 + 路径草图双选择器——参数化
      // 特征链，首版单闭合轮廓沿单直线路径）。SweepFaces 是 editor 直改工具的真实
      // toolId（面扫掠），但参数化特征链入口不走直改通道——特例改道对话框
      //（与 extrude/revolve/loft/fillet 同姿态；直改入口后续按需单裁）。
      openFeatureDialog({ mode: 'new', featureType: 'sweep' });
      return;
    }
    if (id === 'MirrorElements') {
      // B4 mirror 闭环入口：new/mirror 对话框（世界平面 XY/YZ/XZ 或选中的面 faceRef +
      // 保留原体 Unite）。MirrorElements 是 editor 直改工具的真实 toolId，参数化
      // 特征链入口不走直改通道——特例改道对话框。对话框打开会 pause 选择工具并清空
      // 选择——必须在路由时快照选中的面（与 shell 同口径）。
      const inputFaces = usePartStudioStore.getState().canvas.selection
        .filter((entry) => entry.kind === 'face' && entry.topologyId !== undefined);
      openFeatureDialog({
        mode: 'new',
        featureType: 'mirror',
        ...(inputFaces.length > 0 ? { inputFaces } : {}),
      });
      return;
    }
    if (id === 'LinearPattern') {
      // B5 pattern 闭环入口：new/pattern 对话框（PART/body 级线性阵列——count 含原件、
      // spacing>0、世界 X/Y/Z）。LinearPattern 是真实直改工具 id（逐元素复制），参数化
      // 特征链入口不走直改——特例改道对话框（与 SweepFaces/MirrorElements 同姿态；直改
      // 通道保留在册，后续按需单裁入口）。
      openFeatureDialog({ mode: 'new', featureType: 'pattern', patternKind: 'linear' });
      return;
    }
    if (id === 'CircularPattern') {
      // B5 圆周阵列入口（ribbon 下拉子项）：同 new/pattern 对话框、初始 kind=circular。
      // 子项 id 已校准为 register-edit-tools 登记的真实直改 toolId（旧 'circularPattern'
      // 为伪 id——tools.run 静默失败）；参数化入口改道对话框，不投直改工具。
      openFeatureDialog({ mode: 'new', featureType: 'pattern', patternKind: 'circular' });
      return;
    }
    if (id === 'RoundEdges') {
      // M6-b T6 圆角闭环入口：new/fillet 对话框（M4-T6/T4 同姿态——参数化
      // 特征链非直改工具；拾取归对话框「添加边」钮驱动 FilletEdgePickTool），
      // 不经 tools.run。
      openFeatureDialog({ mode: 'new', featureType: 'fillet' });
      return;
    }
    if (id === 'ChamferEdges') {
      // 2026-11-05（能力补齐 Slice 1）：倒角闭环入口。复用 fillet 的边拾取/
      // owner/target 通道；首版 equal distance（mode=2，values1=values2）。
      openFeatureDialog({ mode: 'new', featureType: 'chamfer' });
      return;
    }
    if (id === 'HollowFaces') {
      // T3 参数化抽壳入口：new/shell 对话框（移除面 + 壁厚 + 方向）。
      // 对话框打开会 pause 选择工具并清空选择——必须在路由时快照输入面。
      const inputFaces = usePartStudioStore.getState().canvas.selection
        .filter((entry) => entry.kind === 'face' && entry.topologyId !== undefined);
      openFeatureDialog({
        mode: 'new',
        featureType: 'shell',
        ...(inputFaces.length > 0 ? { inputFaces } : {}),
      });
      return;
    }
    if (id === 'booleanBodies') {
      // B6 M-A4.2a 体布尔闭环入口：new/booleanBodies 对话框（target 单选 +
      // tools 多选 + operation + keepTools，提交 insertFeature；shared 1.16
      // BooleanBodiesParams）。此前是死命令（capability full 但 tools.run 无
      // 注册工具、静默失败）——改道参数化对话框，不再假启动。M7 草图布尔
      // （booleanAdd/booleanSubtract 页签）保持原通道不变。
      openFeatureDialog({ mode: 'new', featureType: 'booleanBodies' });
      return;
    }
    if (id === 'transform') {
      // ADR-0010 UI 面（2026-11-08 live 证据）：变换专用对话框（XYZ 平动/
      // 世界轴旋转/均匀缩放 + 复制；目标实体在插入时选择）。
      openFeatureDialog({ mode: 'new', featureType: 'transform' });
      return;
    }
    if (id === 'splitPart') {
      // ADR-0012 UI 面（2026-11-08 live 证据）：单侧世界平面切分对话框
      // （目标实体 + XY/YZ/XZ 平面 + 偏移 + 保留侧；面/双侧未支持）。
      openFeatureDialog({ mode: 'new', featureType: 'splitPart' });
      return;
    }
    if (id === 'moveFace') {
      // ADR-0014 UI 面（2026-11-08 live 证据）：moveFace 专用对话框（面 + 偏移
      // 距离）。对话框打开会 pause 选择工具并清空选择——路由时快照输入面。
      const inputFaces = usePartStudioStore.getState().canvas.selection
        .filter((entry) => entry.kind === 'face' && entry.topologyId !== undefined);
      openFeatureDialog({
        mode: 'new',
        featureType: 'moveFace',
        ...(inputFaces.length > 0 ? { inputFaces } : {}),
      });
      return;
    }
    if (id === 'sketchConstruction') {
      // v1.23（ADR-0004）：构造模式开关——不是 iTwin 工具；切换后新绘曲线带
      // construction=true，后端面域生成过滤构造曲线。
      usePartStudioStore.getState().toggleSketchConstruction();
      return;
    }
    const command = findRibbonCommand(id);
    const capability = command?.capability ?? id;
    if (isGated(capability)) {
      setGatedCapability(capability);
      return;
    }
    setActiveTool(id);
    try {
      const started = await IModelApp.tools.run(id);
      if (!started) {
        console.warn(`[part-studio] 命令 ${id} 未启动（尚未接线的工具？）`);
      }
    } catch (err) {
      console.error(`[part-studio] 命令 ${id} 激活失败:`, err);
    }
  }, [setActiveTool, openSketchDialog, openFeatureDialog, canEdit]);

  const closeGatedDialog = React.useCallback(() => setGatedCapability(null), []);

  return { activate, gatedCapability, closeGatedDialog };
}

export interface CapabilityDialogProps {
  /** 待引导 capability（null=不渲染）。 */
  capability: string | null;
  onClose: () => void;
}

/** 能力引导对话框（gated 点击后的引导面，文案取 CAPABILITY_GUIDANCE）。
 * 自研非 iTwinUI 对话框：setFocus 等价面在此手工落——ref 回调 focus() 打开即
 * 焦点入对话框（React autoFocus 对 div 无效，commitMount 仅认表单元素；Escape
 * dismissal 可达前提，review-8 I-1 P2 补齐），Escape onKeyDown 收合（同 iTwinUI
 * Dialog closeOnEsc 口径）。 */
export function CapabilityDialog({ capability, onClose }: CapabilityDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!capability) return null;
  const guidance = CAPABILITY_GUIDANCE[capability];
  if (!guidance) return null;
  return (
    <div className="part-studio-dialog-backdrop">
      <div
        ref={(el) => el?.focus()}
        role="dialog"
        aria-modal="true"
        aria-label={t(guidance.titleKey)}
        className="part-studio-capability-dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 className="part-studio-capability-dialog__title">{t(guidance.titleKey)}</h2>
        <p className="part-studio-capability-dialog__message">{t(guidance.messageKey)}</p>
        <div className="part-studio-capability-dialog__actions">
          <button type="button" className="part-studio-capability-dialog__confirm" onClick={onClose}>
            {t('partStudio.capability.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 工具钮模型（RibbonTool/SketchRibbonTool 结构子集——渲染只依赖这四键）。 */
interface RibbonButtonModel {
  id: string;
  icon: RibbonIcon;
  labelKey: string;
  shortcut?: string;
  showLabel?: boolean;
}

/** 撤消/重做组（Onshape 工具栏首组；特征/草图模式共用）。 */
function HistoryGroup({
  canEdit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="part-studio-ribbon__group part-studio-ribbon__group--history" role="group" aria-label={t('partStudio.ribbon.groups.history')}>
      <button
        type="button"
        className="part-studio-ribbon__tool"
        aria-label={t('partStudio.topBar.edit.undo')}
        title={t('partStudio.topBar.edit.undo')}
        disabled={!canEdit || !canUndo}
        onClick={onUndo}
        data-testid="part-studio-ribbon-undo"
      >
        <OnshapeIcon name="undo-button" size={20} />
      </button>
      <button
        type="button"
        className="part-studio-ribbon__tool"
        aria-label={t('partStudio.topBar.edit.redo')}
        title={t('partStudio.topBar.edit.redo')}
        disabled={!canEdit || !canRedo}
        onClick={onRedo}
        data-testid="part-studio-ribbon-redo"
      >
        <OnshapeIcon name="redo-button" size={20} />
      </button>
    </div>
  );
}

/** 单工具按钮（无下拉变体的工具；草图/特征模式共用）。 */
function RibbonToolButton({ tool, onActivate, active, highlighted, disabled = false }: {
  tool: RibbonButtonModel;
  onActivate: (id: string) => void;
  active: boolean;
  highlighted: boolean;
  /** 只读总门（P2.4 A 文档/权限只读）：写工具钮禁用（gated 信息面不算）。 */
  disabled?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const label = t(tool.labelKey);
  const Icon = tool.icon;
  const onshapeIcon = onshapeIconFor(tool.id);
  const className = [
    'part-studio-ribbon__tool',
    tool.showLabel ? 'part-studio-ribbon__tool--labeled' : '',
    active ? 'part-studio-ribbon__tool--active' : '',
    highlighted ? 'part-studio-ribbon__tool--highlight' : '',
  ].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      aria-label={label}
      title={tool.shortcut ? `${label} (${tool.shortcut})` : label}
      aria-pressed={active}
      className={className}
      disabled={disabled}
      onClick={(event) => { event.currentTarget.blur(); onActivate(tool.id); }}
    >
      {onshapeIcon ? <OnshapeIcon name={onshapeIcon} size={20} /> : <Icon />}
      {tool.showLabel && <span className="part-studio-ribbon__tool-label">{label}</span>}
    </button>
  );
}

/**
 * 工具 ribbon：分组工具条 + 命令搜索触发钮。激活态/亮显态全 store 驱动。
 * T6 草图模式（os-30）：sketch.isActive → 整体切换为草图工具组 + 搜索禁用
 * + 退出草图钮。
 */
export interface RibbonProps {
  /** 只读总门（P2.4）：false 时写工具钮禁用且激活不派发；gated 信息面仍可点。
   *  缺省 true（独立组件测试/旧调用语义）。 */
  canEdit?: boolean;
  /** 撤消可用（BriefcaseTxns.isUndoPossible；Onshape 工具栏首组）。 */
  canUndo?: boolean;
  /** 重做可用。 */
  canRedo?: boolean;
  /** 撤消回调（页面层 IModelApp.tools.run('Undo') 通道）。 */
  onUndo?: () => void;
  /** 重做回调。 */
  onRedo?: () => void;
}

export function Ribbon({
  canEdit = true,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: RibbonProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { activate, gatedCapability, closeGatedDialog } = useToolActivation(canEdit);
  const activeToolId = usePartStudioStore((s) => s.tool.activeToolId);
  const palette = usePartStudioStore((s) => s.commandPalette);
  const toggleCommandPalette = usePartStudioStore((s) => s.toggleCommandPalette);
  const sketchActive = usePartStudioStore((s) => s.sketch.isActive);
  // ADR-0017 追补：Onshape 点击「草图」即切换为草图工具栏（平面未选/草图未创建
  // 时工具禁用）；草图创建后（sketch.isActive）启用。对话框期间不再停留在特征工具栏。
  const sketchDialogActive = usePartStudioStore((s) => s.dialog.active === 'sketch');
  const sketchToolbarVisible = sketchActive || sketchDialogActive;
  const sketchToolsDisabled = !canEdit || !sketchActive;
  const constructionMode = usePartStudioStore((s) => Boolean(s.sketch.constructionMode));

  // os-23「亮显工具栏中的工具」：面板开 + 勾选 + 有查询词 → 命中命令高亮。
  const highlightIds = React.useMemo(() => {
    if (!palette.isOpen || !palette.highlightEnabled) return null;
    const query = palette.query.trim().toLowerCase();
    if (!query) return null;
    return new Set(
      allRibbonCommands()
        .filter((command) => t(command.labelKey).toLowerCase().includes(query))
        .map((command) => command.id),
    );
  }, [palette.isOpen, palette.highlightEnabled, palette.query, t]);

  return (
    <div
      className={`part-studio-ribbon${sketchToolbarVisible ? ' part-studio-ribbon--sketch' : ''}`}
      data-testid="part-studio-ribbon"
    >
      {sketchToolbarVisible ? (
        /* 草图模式变身（os-30）：草图工具组替换特征工具组。 */
        <div className="part-studio-ribbon__groups" role="toolbar" aria-label={t('partStudio.ribbon.sketchToolbarLabel')}>
          <HistoryGroup
            canEdit={canEdit}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
          {SKETCH_TOOL_GROUP_ORDER.map((group) => {
            const tools = SKETCH_RIBBON_TOOLS.filter((tool) => tool.group === group);
            return (
              <div
                key={group}
                className="part-studio-ribbon__group"
                role="group"
                aria-label={t(`partStudio.ribbon.sketchGroups.${group}`)}
              >
                {tools.map((sketchTool: SketchRibbonTool) => (
                  sketchTool.dropdownItems ? (
                    <RibbonDropdown
                      key={sketchTool.id}
                      tool={sketchTool as unknown as RibbonTool}
                      onActivate={activate}
                      active={sketchTool.id === 'sketchConstruction' ? constructionMode : activeToolId === sketchTool.id}
                      highlighted={false}
                      disabled={sketchToolsDisabled}
                    />
                  ) : (
                    <RibbonToolButton
                      key={sketchTool.id}
                      tool={sketchTool}
                      onActivate={activate}
                      active={sketchTool.id === 'sketchConstruction' ? constructionMode : activeToolId === sketchTool.id}
                      highlighted={false}
                      disabled={sketchToolsDisabled}
                    />
                  )
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="part-studio-ribbon__groups" role="toolbar" aria-label={t('partStudio.ribbon.toolbarLabel')}>
          {/* Onshape 首组：撤消/重做（32×32，无标签）。 */}
          <HistoryGroup
            canEdit={canEdit}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
          {ONSHAPE_RIBBON_GROUP_ORDER.map((group) => {
            const tools = RIBBON_TOOLS.filter((tool) => tool.group === group);
            if (tools.length === 0) return null;
            return (
              <div
                key={group}
                className="part-studio-ribbon__group"
                role="group"
                aria-label={t(`partStudio.ribbon.groups.${group}`)}
              >
                {tools.map((tool) => {
                  // 只读总门：full 写工具禁用；gated 项仅信息引导，保持可点（完整 UI 面）。
                  const disabled = !canEdit && !isGated(tool.capability);
                  const active = activeToolId === tool.id;
                  return tool.dropdownItems ? (
                    <RibbonDropdown
                      key={tool.id}
                      tool={tool}
                      onActivate={activate}
                      active={active}
                      highlighted={highlightIds?.has(tool.id) ?? false}
                      disabled={disabled}
                      readOnly={!canEdit}
                    />
                  ) : (
                    <RibbonToolButton
                      key={tool.id}
                      tool={tool}
                      onActivate={activate}
                      active={active}
                      highlighted={highlightIds?.has(tool.id) ?? false}
                      disabled={disabled}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {/* 命令搜索触发钮（os-11 最右：搜索工具… alt+/）；os-30：草图模式禁用。 */}
      <button
        type="button"
        className="part-studio-ribbon__search-trigger"
        onClick={toggleCommandPalette}
        disabled={sketchToolbarVisible}
      >
        <span>{t('partStudio.ribbon.searchTools')}</span>
        <kbd className="part-studio-ribbon__search-kbd">{t('partStudio.ribbon.searchShortcut')}</kbd>
      </button>
      {/* Onshape 草图模式没有额外的「退出草图」工具栏按钮：退出走草图特性
          对话框的绿色 ✓（编辑态同一对话框）。 */}
      <CapabilityDialog capability={gatedCapability} onClose={closeGatedDialog} />
    </div>
  );
}
