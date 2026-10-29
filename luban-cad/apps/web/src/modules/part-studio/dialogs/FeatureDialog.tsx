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
 * - 底部（M6-c T5 对齐采集规格 12-dialog-extrude-1.png：底部=透明度滑杆 +
 *   成品 + ?）：透明度滑杆（0-100，缺省 0=不透明）+ 成品按钮（=✓ 确认出口，
 *   M3 期即成品文案）+ ? 帮助（展开文案）。**透明度语义=预览透明度，🟠 挂账**——
 *   本版无视觉预览通道（useFeatureSystem previewOp 延后，insertFeature 直提交
 *   无预览帧），值仅本地态 + FeatureDialogResult.transparency 回传（接预览
 *   通道时消费）；M3 期的回滚滑杆撤出对话框（采集权威：Onshape 回滚条在特征
 *   树底部非对话框内——树回滚条归 backlog 单裁，不在本对话框复活）。
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
 * 后端 zod 拒收裸空 profile；M6-c T3 起面域寻址升级为 regions 多选数组，
 * regionIndex 不再发——见下方 M6-c T3 段）。数据源裁决（两路取内聚者）：
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
 * 交互（M6-a 最小形态，视口点击拾取归 M6-c；面域选择形态 M6-c T3 起分叉——
 * extrude 多选 chips / revolve 单选下拉，见下方 M6-c T3 段）：草图下拉
 *（多选一）；选中回显 chip「{草图名} 的面」（revolve 多面域追加 ·面域 N，
 * 对齐采集规格「Sketch 1 的 面」chips 形态），×移除=清选择。门禁（对齐 T3 zod 语义，不再空 profile 裸奔）：无草图 → 「先创建
 * 草图」提示 + 提交禁用；regions 缺省/空 → 「草图无可拉伸面域」 + 禁用；
 * 面域读取中/失败 → 禁用（失败经 role=alert 就地呈现）。布尔类型 M7 v1.10 起
 * 同样走草图通道（见下方 v1.10 段），其余特征类型走原 payload 不动。
 *
 * 布尔草图驱动（M7 v1.10，shared BooleanParams——首个里程碑）：布尔作用域页签
 * 映射 featureType（`booleanScopeFeatureType`：加入→booleanAdd、移除→
 * booleanSubtract；新建=基础类型）。映射仅作用于基础类型为 extrude/boolean* 的
 * 对话框（revolve/fillet 无草画面域工具体语义）。布尔通道复用拉伸通道的草图/
 * 面域拾取 UI（本次不做任意面拾取——保留下拉/多选 chips），载荷
 * `{sketchId, distance, regions, operation}`（无 profile 键——与内联 profile
 * 旧路径互斥，服务端 zod 拒收 mixed 形态）；symmetric 对布尔不适用（隐藏+不进载荷）。
 * 上游门禁（B1 复审 Important）：布尔特征 requiresUpstream=true，无实体（hasBodies=false）
 * 时加入/移除页签禁用 + 提交禁用 + 诚实提示（后端 op 边界同口径拒收，双层防御）；
 * 相交无后端特征类型，提交态页签禁用 + 提示（不可静默降级为并集）。
 *
 * revolve 通道（M6-b T4，照 M6-a T6 拉伸通道同构复刻）：sketchChannel 扩
 * revolve——草图/面域拾取两下拉全复用，revolve 分支增：
 * - 轴选择：getSketch entities 过滤 kind==='line'（RevolveParams.axis 的
 *   sketchEntityId 语义=草图内 line 实体 id）→ 下拉按几何判型命名（M6-c T5：
 *   端点解算坐标判向——竖直线/水平线/斜线+同类 1 基序号，对齐 Onshape 采集
 *   「线 3」美化语义；端点坐标缺失（未解算/旧后端）回退「线 {id}」——id 与
 *   载荷同值可对账不丢），缺省选第一条；无 line 实体 →
 *   「草图无可用旋转轴」提示 + 提交禁用；
 * - 全方位复选：fullRevolve 缺省 true（360° 满周）；取消勾选现角度输入——
 *   **UI 度制（用户面单位裁决），载荷前 ×π/180 转弧度**（shared
 *   RevolveParams.angle 契约 (0, 2π]，度制域 (0, 360]；180° → Math.PI 精度
 *   由单测钉死）；
 * - 载荷 `{profile: [], sketchId, regionIndex, axis: {sketchEntityId},
 *   fullRevolve, angle?}`（angle 仅 !fullRevolve 携带）；距离量对 revolve
 *   不适用——距离输入隐藏、距离校验跳过（revolve 分支独立构造器，extrude
 *   通道载荷不动）。
 *
 * 复合面域多选（M6-c T3，shared v1.8 ExtrudeParams.regions——Onshape「面和
 * 草图面域」多选语义，接替 M6-a T6 的面域单选下拉）：extrude 通道 regions>1
 * 时渲染面域多选 chips（点选切换选中态 aria-pressed，样式对齐既有 chip 家族）
 * +「全选/清空」轻量操作；缺省选中 [0]（=最大面域，v1.6 regionIndex 缺省 0
 * 的语义锚同源）；单面域保持自动 [0]（无 UI）。选中态 `selectedRegions`
 *（SketchDto.regions 面积降序下标，升序存储=载荷集语义确定性），载荷
 * `{profile: [], distance, sketchId, regions: selectedRegions,
 * ...(symmetric?{symmetric}:{})}`——**不再发 regionIndex**（shared v1.8 起
 * @deprecated，服务端 zod 与 regions 互斥拒收）。门禁追加：selectedRegions
 * 空（用户清空）→「选择至少一个面域」提示 + ✓ 禁用；regions 读取中/失败/空
 * 既有门禁不动。revolve 通道保持单选下拉 + regionIndex 载荷
 *（**裁决钉死：RevolveParams 未扩 regions——不越契约**；多面域旋转归后续
 * 契约扩展单裁），回显 chip「· 面域 N」后缀亦仅 revolve 保留（extrude 的
 * 面域选中态由多选 chips 自身 aria-pressed 呈现）。
 *
 * 对称复选（M6-b T4，extrude 通道）：Onshape 采集形态「对称」在折叠区外平铺
 *（sketchChannel 下折叠段 symmetric 隐藏，平铺复选顶替）——state 即既有
 * symmetric，随 FeatureDialogResult.symmetric 回传不变；**载荷接线已收口**
 *（T3 契约 shared v1.7 ExtrudeParams.symmetric 落地后控制器接线：勾选才带
 * symmetric:true 键，缺省省略=载荷向后兼容）。
 *
 * fillet 通道（M6-b T6，F8——**不走草图通道**：输入是体边非草画面域）：半径
 * 输入（缺省 5）+切向延伸复选（缺省 true，=FilletParams.propagateSmooth）+
 * 边 chips 列表（「边 N」1 基序号+×移除，按 filletEdgeRefKey 无关键去重——
 * 边自身 id 单键，M6-d v1.9 纯换）+「添加边」钮。**对话框驱动拾取裁决**：
 * 「添加边」启动 FilletEdgePickTool（直构+run，动态 import——工具模块静态依赖
 * editor 基座链，静态引入会强加给全部对话框消费方的 mock 面），工具每拾一条边
 * （已即时 resolveEdgeRef 换边自身持久 id 单引用）回调 chips 增行，右键/Esc/
 * 再点钮结束拾取回对话框。门禁：边集空→「选择要圆角的边」+✓禁用；半径≤0→
 * 就地 Alert（同距离校验口径）；**无 body 诚实降级**——宿主 hasBodies=false
 * （库里无实体）时「添加边」禁用+提示先建实体。载荷
 * `{radius, propagateSmooth, edges:[{edge:{nodeId,entityId}}...]}`（边自身 id
 * 透传，shared v1.9 契约；求值端 edgesFromOwnId 分裂片集合多持全入 blend）；
 * 距离量对 fillet 不适用（隐藏+校验跳过，revolve 同口径）。
 *
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
 * sweep 通道（B3 v1.12）：**双草图选择器 + 语义分叉**——轮廓草图（闭合截面，服务端
 * 取最大面域外环）与路径草图（须恰为一条直线，服务端 op 边界 txn 之前拒收非线/零长）
 * 两个独立下拉（aria 文案「轮廓草图 / 路径草图」明确区分，不用几何序号）；载荷
 * `{profileSketchId, pathSketchId, bodyType:'SOLID'}`（无 distance/profile/regions 键）。
 * 门禁：两张草图均已选、互不相同、且仍存在于实时草图选项（删草图后不得留陈旧 id 放行）；
 * 草图不足两张 → 诚实提示 + 提交禁用。首版无 twist/scale/lock/guides UI（范围裁决）。
 * ribbon 入口：SweepFaces 虽是真实直改工具 id，但参数化特征链入口改道本对话框
 *（与 extrude/revolve/loft/fillet 同姿态，见 Ribbon.tsx 注）。
 * mirror 通道（B4 v1.13）：世界平面下拉（XY/YZ/XZ——**过世界原点**，首版无任意面/
 * 基准面引用）+ 范围提示；载荷 `{plane, keepOriginal:true}`（字面量真值——首版恒保留
 * 原体并与镜像体 Unite，由服务端「原体在前、镜像体在后」的并集次序归正法向）。
 * 无上游实体（hasBodies=false）→ 诚实提示 + 提交禁用（requiresUpstream；后端 op
 * 边界同口径拒收）。距离/草图/chips 输入一律隐藏（镜像无这些量）；ribbon 的
 * MirrorElements 为真实直改工具 id，参数化特征链入口特例改道本对话框。
 * pattern 通道（B5 v1.14）：**PART/body 级阵列**——kind（linear/circular）下拉 +
 * count（含原件，≥2）+ spacing（仅 linear，>0）/ angle（仅 circular，(0,360] 度）+
 * axis（linear 世界 X/Y/Z；circular 锁定世界 Z——与服务端 zod 同口径）。
 * 载荷 `{kind, count, spacing?|angle?, axis}`（PatternParams；两形态键互斥，不发送
 * 对方形态的键）。圆周实例角度=k*step：整周 360 → step=angle/count（无重叠闭合）；
 * 部分角 → step=angle/(count-1)（首末实例夹住「总角度」）。无上游实体
 *（hasBodies=false）→ 诚实提示 + 提交禁用（requiresUpstream；
 * 后端 op 边界同口径拒收）。距离/草图/chips 输入一律隐藏；首版无 FEATURE pattern /
 * 任意轴引用 / 曲线阵列（范围裁决）。
 *
 * newBody / 目标实体（B6 M-A3.2a，shared v1.15）：
 * - extrude 通道「新建实体」复选（new 模式）：勾选才在 params 带 `newBody:true`
 *   （缺省省略=既有 ADD 语义）；edit 模式自 initialParams 回显落库值且**禁用**——
 *   结构键不可经 updateParams 翻转（服务端诚实拒收）；FeatureDialogResult.newBody
 *   仅在 true 时回传，未来 updateParams 接线必须原样保留；
 * - 目标实体下拉：**所有可提交的 insertFeature 通道**（I2：extrude/revolve/boolean/
 *   loft/sweep/mirror/pattern + fillet/chamfer/shell 等依附型——后端 planInsert 对
 *   每个非 newBody insert 在 N>1 时同口径要求 targetBodyId）且 getBodies 读面已就绪、
 *   active authored body>1 时渲染（consumed/orphan 不入选项）；值进 **op.targetBodyId**
 *   （不在 params）。newBody 勾选时隐藏且不发 target（新体由本 op 创建；无 target
 *   的 newBody 由后端锚定全局链尾）。单 body/读面不可用不发 target（legacy）；
 * - 读面刷新中（bodiesLoading）或读面不可用（bodiesError）→ insert 提交禁用 + 诚实
 *   提示——N 未知时不得发无 target 的 regular insert（后端 op 边界同口径拒收）；
 *   例外：勾选 newBody 无需 target，读面失败时仍可提交（Minor 2）。
 * - **Critical 1（fillet target 与拾取边耦合）**：fillet/chamfer/shell 不再显示手动
 *   target 下拉。fillet 的 `targetBodyId` 由**拾取边的父元素 id**（=getBodies.bodyKey）
 *   自动推导：所有边必须属于同一个 active authored body；跨体、孤儿/消费态 owner 或
 *   缺少 owner → 显式错误 + 禁提交（绝不回落默认 body1）。N≤1 保持 legacy 不发 target。
 *   chamfer/shell 的工具体/owner 通道未接线（gated）→ 一律禁提交（不默认）。
 *   手动 target 下拉保留给无拾取耦合的 insert 通道（extrude/revolve/boolean/loft/
 *   sweep/mirror/pattern）。
 *
 * body boolean 通道（B6 M-A4.2a，shared 1.16 BooleanBodiesParams）：
 * - 输入 = getBodies 读面（宿主下传 bodies 的 active authored 子集，consumed/
 *   orphan 不入选项）：**target 单选**（缺省首个）+ **tools 多选**（目标行常态禁用；
 *   若目标后来被改成已选工具，冲突行保持可点以便解选）+ operation（unite/subtract；
 *   intersect 选项禁用+提示，与服务端 v1 拒收同口径，不静默降级）+ keepTools
 *   （缺省 false=成功后消费工具；true=保留并给出 I3 源链锁提示——编辑被引用的
 *   工具实体须先删除该布尔特征）。
 * - 载荷 `{targets:[{bodyKey}], tools:[{bodyKey}...], operation, keepTools}`；目标
 *   只经 params.targets（M4.1 planBooleanInsert 的唯一真源）——op 层**不发**
 *   targetBodyId（通用手动目标下拉对本通道关闭），避免双来源/不一致拒收。
 * - 门禁：<2 active authored body / bodiesLoading / 读面不可用（含无连接）/
 *   tools 空 / target 在 tools → 禁提交 + 字段级/整面提示；canEdit/lease 沿用
 *   既有门；失败就地 alert、成功 toast 与既有提交面同管道。草图布尔
 *   （booleanAdd/booleanSubtract）通道不受影响。
 *
 * Escape 关闭（M5-T1 D-T9-5）：非 iTwinUI Dialog 的自研面板吃不到官方
 * dismissal 处方——document keydown（Escape→onCancel）挂载期一次注册，
 * 对齐 canvas/CanvasContextMenu.tsx:226-234 模式（onCancel 经 ref 取用，
 * 不随 props 变化重挂）；IModelApp Escape 工具语义共存由 P1 波次放行传播
 *（viewer keyboard-shortcuts Escape 分支不拦断，浮层收合与工具取消
 * 两层语义并存）。M6-b T6：拾取态下 Escape 分叉=只结束拾取（stopPick）不关
 * 对话框——「Esc 结束拾取回对话框」语义优先于面板关闭。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { SvgCheckmark, SvgClose } from '@itwin/itwinui-icons-react';
import type {
  BodyInfo,
  BooleanBodiesParams,
  FeatureOp,
  FeatureOpResult,
  FilletEdgeRef,
  LubanFeatureType,
  MirrorParams,
  PatternParams,
  SketchEntityDto,
  SketchRegionDto,
} from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import { filletEdgeRefKey } from '../tools/modeling/fillet-edge-ref.js';
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
  /**
   * 透明度滑杆读数（M6-c T5，0-100，缺省 0=不透明）——🟠 挂账：本版无视觉
   * 预览通道（previewOp 延后），值仅回传不消费；接预览通道时作为预览帧透明度。
   *（M3 期同位的 rollback 滑杆已撤出——采集权威钉底栏=透明度，见文件头注。）
   */
  transparency: number;
  /** M6-b T6（fillet 通道）：已拾边集（边自身持久 id 单引用，shared v1.9；仅 fillet 通道携带）。 */
  filletEdges?: readonly FilletEdgeRef[];
  /**
   * B6 M-A3.2a（extrude）：新建实体结构键回传（仅 true 时携带）。new 模式=复选
   * 当前值；edit 模式=落库 params.newBody 的回显值（结构键不可翻转，复选框禁用）。
   * updateParams 若在本结果基础上构造载荷，必须原样保留该键（否则服务端诚实拒收）。
   */
  newBody?: boolean;
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
  /**
   * B5 pattern 通道初始阵列类型（ribbon 入口寻址：LinearPattern→'linear'、
   * CircularPattern→'circular'；缺省 'linear'）。对话框内 kind 下拉仍可自由切换。
   */
  initialPatternKind?: PatternParams['kind'];
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
   * iModel key（M6-a T6 面域读面 / M6-b T6 边拾取寻址）：选中草图后经 getSketch
   * 拉 SketchRegionDto[]（面积降序，regionIndex=数组下标）；fillet 通道直通
   * FilletEdgePickTool（resolveEdgeRef 寻址键）。缺省 undefined = 面域不可读
   * / 边不可拾（提交禁用 + 就地提示，不发起 RPC）。
   */
  connectionKey?: string;
  /**
   * 库内已有实体（M6-b T6 fillet 通道诚实降级门）：宿主自特征树判
   * （body 产出型条目在场：extrude/revolve/booleanAdd/booleanSubtract/loft/sweep/
   * mirror/pattern）——false 时「添加边」禁用 + 提示先建实体（无体可拾边，不发工具）；
   * mirror/pattern 通道同门（无上游实体可镜像/阵列）。缺省 true（壳期/测试语义保持；
   * 生产宿主恒显式传参）。
   */
  hasBodies?: boolean;
  /**
   * B6 M-A3.2a：body 读面（Session useFeatureSystem.bodies 直通，仅在该连接成功
   * 读过 getBodies 时下传；undefined=读面不可用 → 不做 target 选择，保持 legacy
   * 载荷）。>1 个 active authored body 时对所有 insertFeature 通道（含 fillet/chamfer/
   * shell）显示目标实体下拉；值以 `targetBodyId` 进 insertFeature op（不是 params）。
   */
  bodies?: readonly BodyInfo[];
  /** body 读面刷新中（提交禁用 + 诚实提示——N 未知时不得发无 target 的 regular insert）。 */
  bodiesLoading?: boolean;
  /**
   * body 读面失败（I1）：读面不可用（bodies undefined）时 insert 的 target 无从确定
   * ——提交禁用 + 诚实提示（零件段错误条提供重试出口）。
   */
  bodiesError?: string;
  /**
   * B6 M-A3.2a：既有特征落库 params（mode='edit' 由宿主自特征树行下传）。
   * 仅消费结构键 `newBody`：回显复选框且禁用（翻转=语义变更，服务端拒收）；
   * updateParams 接线时必须原样保留该键（本版 edit 提交仍禁用）。
   */
  initialParams?: unknown;
  /** ✓/成品 确认出口（回传全量载荷；提交成功后由宿主 closeDialog）。 */
  onConfirm?: (result: FeatureDialogResult) => void;
  /** ✗ 取消出口。 */
  onCancel?: () => void;
}

/** 结果类型页签序（os-31）。 */
const RESULT_TYPES: readonly FeatureResultType[] = ['solid', 'surface', 'thinWall'];

/** 布尔作用域页签序（os-31）。 */
const BOOLEAN_SCOPES: readonly FeatureBooleanScope[] = ['new', 'add', 'remove', 'intersect'];

/**
 * 布尔作用域 → 特征类型（M7 v1.10）：加入→booleanAdd、移除→booleanSubtract
 *（shared BooleanParams 草图驱动——operation 由类型名映射，unite/subtract）。
 * 新建=基础特征类型（无映射）；相交无后端特征类型（M7 首版不支持）——提交态
 * 对话框里该页签**禁用**（B1 复审：不可静默降级为并集；纯展示/壳期仍可回传元数据）。
 */
export function booleanScopeFeatureType(scope: FeatureBooleanScope): LubanFeatureType | undefined {
  if (scope === 'add') return 'booleanAdd';
  if (scope === 'remove') return 'booleanSubtract';
  return undefined;
}

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

/**
 * 旋转轴判型描述（M6-c T5）：线段按端点解算坐标判向 + 同类判型内 1 基序号——
 * 下拉文案「竖直线/水平线/斜线 N」（对齐 Onshape 采集的轴命名语义，替代
 * M6-b T4 的「线 {id}」裸 id 形态）。
 */
export interface AxisLineDescriptor {
  /** 草图内 line 实体 id（=载荷 axis.sketchEntityId，同值可对账）。 */
  id: number;
  /** 判型：竖直（x 相等）/水平（y 相等）/斜线；端点坐标缺失=unknown。 */
  kind: 'vertical' | 'horizontal' | 'slanted' | 'unknown';
  /** 同类判型内的 1 基序号（unknown 不编号，UI 回退「线 {id}」）。 */
  ordinal: number;
}

/** 判向容差（草图局部坐标，内部米制；sketch-offset-logic 链扩展同款 1e-6 纪律）。 */
const AXIS_COORD_EPSILON = 1e-6;

/**
 * 旋转轴判型（M6-c T5，纯函数——FeatureDialog.test 直测）：按线段两端点的
 * 解算坐标判竖直/水平/斜线。端点坐标任一缺失（未解算/旧后端不下发坐标）→
 * unknown（UI 回退「线 {id}」，载荷寻址不受影响）。序号按实体集出现顺序计。
 */
export function classifyAxisLines(entities: readonly SketchEntityDto[]): AxisLineDescriptor[] {
  const points = new Map<number, { x: number; y: number }>();
  for (const entity of entities) {
    if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined) {
      points.set(entity.id, { x: entity.x, y: entity.y });
    }
  }
  const counters: Record<AxisLineDescriptor['kind'], number> = {
    vertical: 0,
    horizontal: 0,
    slanted: 0,
    unknown: 0,
  };
  const descriptors: AxisLineDescriptor[] = [];
  for (const entity of entities) {
    if (entity.kind !== 'line') continue;
    const p1 = points.get(entity.p1);
    const p2 = points.get(entity.p2);
    let kind: AxisLineDescriptor['kind'] = 'unknown';
    if (p1 !== undefined && p2 !== undefined) {
      if (Math.abs(p1.x - p2.x) <= AXIS_COORD_EPSILON) kind = 'vertical';
      else if (Math.abs(p1.y - p2.y) <= AXIS_COORD_EPSILON) kind = 'horizontal';
      else kind = 'slanted';
    }
    counters[kind] += 1;
    descriptors.push({ id: entity.id, kind, ordinal: counters[kind] });
  }
  return descriptors;
}

/** 草图选项缺省（M6-a T6：props 未接线/壳期空集——「先创建草图」门禁数据源；模块级常量防引用抖动）。 */
const EMPTY_SKETCHES: readonly FeatureDialogSketchOption[] = [];

/** body 读面缺省（M-A3.2a：未接线/不可用时不做 target 选择）。 */
const EMPTY_BODIES: readonly BodyInfo[] = [];

/**
 * 落库 params 的 newBody 结构键读取（B6 M-A3.2a）：只有显式 true 才算勾选；
 * 非对象/缺键/false 均 false（不伪造、不静默翻转）。
 */
export function readStoredNewBody(params: unknown): boolean {
  return typeof params === 'object' && params !== null && (params as { newBody?: unknown }).newBody === true;
}

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
  initialPatternKind,
  applyOp,
  leaseOk,
  canEdit = true,
  entities,
  sketches,
  connectionKey,
  hasBodies = true,
  bodies,
  bodiesLoading,
  bodiesError,
  initialParams,
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
  // 透明度滑杆（M6-c T5 对齐采集底栏；0=不透明。语义挂账见文件头注）。
  const [transparency, setTransparency] = React.useState(0);
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
  // M6-b T6：Escape 出口经 ref 间接——拾取态下分叉为「只结束拾取」（回对话框
  // 不关面板），分叉逻辑在 stopPick 定义后回填（渲染体内同步完成，先于任何
  // 事件可达；缺省回落 onCancel 保持 M5-T1 语义）。
  const onEscapeRef = React.useRef<() => void>(() => onCancelRef.current?.());
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscapeRef.current();
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

  // 布尔作用域 → 提交特征类型（M7 v1.10）：仅拉伸/布尔对话框参与映射（revolve/fillet
  // 无草画面域工具体语义，页签保持元数据回传）；加入→booleanAdd、移除→booleanSubtract。
  const booleanScopeCapable =
    mode === 'new' &&
    (featureType === 'extrude' || featureType === 'booleanAdd' || featureType === 'booleanSubtract') &&
    applyOp !== undefined;
  const booleanScopeMapped = booleanScopeCapable ? booleanScopeFeatureType(booleanScope) : undefined;
  const effectiveFeatureType = booleanScopeMapped ?? featureType;
  // 草图通道（M6-a T6 extrude / M6-b T4 revolve；M7 v1.10 扩布尔）：新建提交走 sketchId 寻址
  //（数据源/门禁裁决见文件头注）；其余特征类型与 edit/壳期路径一概不进本通道。
  const booleanChannel =
    mode === 'new' && (effectiveFeatureType === 'booleanAdd' || effectiveFeatureType === 'booleanSubtract') && applyOp !== undefined;
  const sketchChannel =
    mode === 'new' && (effectiveFeatureType === 'extrude' || effectiveFeatureType === 'revolve' || booleanChannel) && applyOp !== undefined;
  const revolveChannel = sketchChannel && effectiveFeatureType === 'revolve';
  const extrudeChannel = sketchChannel && effectiveFeatureType === 'extrude';
  // 布尔上游门禁（B1 复审 Important）：布尔特征 requiresUpstream=true，无上游时后端
  // 只会把失败吞成 status=1 死节点（op 仍 ok:true）——UI 侧先挡：无实体时禁用
  // 加入/移除页签与提交（诚实提示），后端 op 边界另有同口径拒收（双层防御）。
  const booleanScopeNoBody = booleanScopeCapable && !hasBodies;
  const booleanUpstreamMissing = booleanChannel && !hasBodies;
  // fillet 通道（M6-b T6）：体边拾取非草画面域——不进草图通道；输入集=体上
  // 拾得的边（持久拓扑 id 对），提交面同 applyOp。
  const filletChannel = mode === 'new' && featureType === 'fillet' && applyOp !== undefined;
  // B2 loft 通道（首版两平行截面）：**双截面草图**选择器——不走 sketchChannel
  //（loft 无面域读取：服务端每草图取最大面域；载荷 {sketchIds, bodyType:'SOLID'}）。
  // ribbon 现有 'loft' 条目无注册工具（伪 toolId，见 Ribbon.tsx 注记），入口改道
  // 本对话框；guides/端条件/sections UI 首版不做。
  const loftChannel = mode === 'new' && featureType === 'loft' && applyOp !== undefined;
  // B3 sweep 通道（首版单闭合轮廓沿单直线路径）：**双草图选择器**——不走 sketchChannel
  //（sweep 无面域读取：服务端轮廓取最大面域、路径须恰一条直线；载荷
  // {profileSketchId, pathSketchId, bodyType:'SOLID'}）。ribbon 的 SweepFaces 为真实直改
  // 工具 id，但参数化特征链入口特例改道本对话框（见 Ribbon.tsx 注）；twist/scale/lock/
  // guides UI 首版不做。
  const sweepChannel = mode === 'new' && featureType === 'sweep' && applyOp !== undefined;
  // B4 v1.13 mirror 通道：世界平面三选一（XY/YZ/XZ）+ keepOriginal 恒 true（首版保留原体
  // 并与镜像体 Unite）。无草图/面域/边拾取输入——参数只有平面；上游体由服务端特征链供给
  //（requiresUpstream——无实体时 UI 先挡 + 后端 op 边界同口径拒收）。ribbon 的 MirrorElements
  // 是真实直改工具 id，但参数化特征链入口特例改道本对话框（见 Ribbon.tsx 注）。
  const mirrorChannel = mode === 'new' && featureType === 'mirror' && applyOp !== undefined;
  const mirrorUpstreamMissing = mirrorChannel && !hasBodies;
  // B5 v1.14 pattern 通道：PART/body 级阵列（kind=linear/circular；count 含原件）。
  // 无草图/面域/边拾取输入——参数只有 kind/count/spacing?/angle?/axis；上游体由服务端
  // 特征链供给（requiresUpstream——无实体时 UI 先挡 + 后端 op 边界同口径拒收）。
  const patternChannel = mode === 'new' && featureType === 'pattern' && applyOp !== undefined;
  const patternUpstreamMissing = patternChannel && !hasBodies;
  // B6 M-A4.2a body boolean 通道（shared 1.16 BooleanBodiesParams）：以 body 为
  // 操作对象——target 单选 + tools 多选（均取 getBodies 的 active authored 读面），
  // operation unite/subtract（v1 服务端拒 intersect），keepTools 决定成功后是否
  // 消费工具。载荷目标只经 params.targets（M4.1 planBooleanInsert：params 是唯一
  // 真源；op 层 targetBodyId 可选且不一致会被拒——本通道不发）。**与 M7 的草图
  // 布尔（booleanAdd/booleanSubtract 页签/通道）互不相干，后者保持原样。**
  const booleanBodiesChannel =
    mode === 'new' && featureType === 'booleanBodies' && applyOp !== undefined;
  // ── B6 M-A3.2a：newBody / target body（body-producing 特征）─────────────────
  // extrude 新建实体结构键（new 模式=用户勾选；edit 模式由落库 params 回显且
  // 禁用——结构键不可翻转）；N>1 的目标实体选择（值进 op.targetBodyId）。
  const [newBody, setNewBody] = React.useState<boolean>(() => readStoredNewBody(initialParams));
  const [targetBodyKey, setTargetBodyKey] = React.useState('');
  // 结构键生效值：new 模式=本地复选；edit 模式=落库 params 回显（禁用，绝不翻转）。
  const effectiveNewBody = mode === 'edit' ? readStoredNewBody(initialParams) : newBody;
  // 复选可见面：new=extrude 提交通道；edit=extrude 既有特征（只读回显）。
  const newBodyVisible = mode === 'edit' ? featureType === 'extrude' : extrudeChannel;
  // active authored body（consumed/orphan 不作写目标；服务端 getBodies 亦只回 authored）。
  const activeBodies = React.useMemo(
    () => (bodies ?? EMPTY_BODIES).filter((body) => body.active && body.authored !== false),
    [bodies],
  );
  // I2：**所有**可提交的 insertFeature 通道都需要 target 能力——后端 planInsert 对
  // 每个非 newBody insert 在 N>1 时同口径要求 targetBodyId（fillet/chamfer/shell 等
  // 依附型特征也不例外，只是它们不产新体）。newBody 唯一的例外（新体由本 op 创建）。
  const insertTargetChannel =
    mode === 'new' &&
    applyOp !== undefined &&
    effectiveFeatureType !== undefined;
  // ── Critical 1：fillet/chamfer/shell 的 target 不能手动选 ──────────────────
  // fillet：target 由**拾取边的父体**自动推导（owner=拾取元素 id=getBodies.bodyKey）。
  // 混合体/孤儿/消费态 owner → 显式错误 + 禁提交，绝不回落默认 target。
  // chamfer/shell：工具体/picker 未接线，无法提供 owner → 禁提交（不默认）。
  // 拾取边 + 父体 elementId 原子成对（Critical 1）：去重键含 owner——两 body 的边
  // 即使 refKey（边自身 id）碰撞也不会互相覆盖；跨体即混合错误，绝不错体提交。
  const [filletPicks, setFilletPicks] = React.useState<Array<{ ref: FilletEdgeRef; ownerElementId: string }>>([]);
  const filletEdges = React.useMemo(() => filletPicks.map((pick) => pick.ref), [filletPicks]);
  const activeBodyKeys = React.useMemo(
    () => new Set(activeBodies.map((body) => body.bodyKey)),
    [activeBodies],
  );
  const filletOwnerIds = React.useMemo(
    () => filletPicks.map((pick) => pick.ownerElementId),
    [filletPicks],
  );
  const filletOwnersValidated = filletChannel && bodies !== undefined && filletEdges.length > 0;
  const filletMissingOwner = filletOwnersValidated
    ? filletOwnerIds.find((owner) => owner === undefined || !activeBodyKeys.has(owner))
    : undefined;
  const filletDistinctOwners = React.useMemo(
    () => [...new Set(filletOwnerIds.filter((owner): owner is string => owner !== undefined))],
    [filletOwnerIds],
  );
  const filletMixedOwners = filletOwnersValidated && filletDistinctOwners.length > 1;
  const filletDerivedTargetBodyId =
    filletOwnersValidated && !filletMissingOwner && !filletMixedOwners && filletDistinctOwners.length === 1
      ? filletDistinctOwners[0]
      : undefined;
  const filletTargetError = !filletOwnersValidated
    ? undefined
    : filletMissingOwner !== undefined
      ? t('partStudio.featureDialog.filletOwnerInvalid', { bodyKey: filletMissingOwner ?? '?' })
      : filletMixedOwners
        ? t('partStudio.featureDialog.filletMixedBodies')
        : undefined;
  const filletDerivedBody = filletDerivedTargetBodyId === undefined
    ? undefined
    : activeBodies.find((body) => body.bodyKey === filletDerivedTargetBodyId);
  // N>1 时 fillet 必须发自动推导的 target；N≤1 保持 legacy（不发 target）。
  const filletAutomaticTargetId =
    filletChannel && bodies !== undefined && activeBodies.length > 1 && filletTargetError === undefined
      ? filletDerivedTargetBodyId
      : undefined;
  // chamfer/shell：owner 通道未接线 → 一律禁提交（gated；不落默认 target）。
  const unownedTargetChannel =
    mode === 'new' &&
    applyOp !== undefined &&
    (effectiveFeatureType === 'chamfer' || effectiveFeatureType === 'shell');
  // 手动 target 下拉只保留给「无拾取耦合」的 insert 通道；fillet/chamfer/shell 排除。
  // B6 M-A4.2a：booleanBodies 的 target 走通道内自管选择并进 params.targets
  //（不是 op.targetBodyId）——排除通用下拉，避免双选择器/错载荷面。
  const manualTargetChannel =
    insertTargetChannel &&
    effectiveFeatureType !== 'fillet' &&
    effectiveFeatureType !== 'chamfer' &&
    effectiveFeatureType !== 'shell' &&
    effectiveFeatureType !== 'booleanBodies';
  // newBody 时无需 target（无 target 的 newBody 后端允许——锚定全局链尾）。
  const targetSelectorVisible =
    manualTargetChannel && bodies !== undefined && activeBodies.length > 1 && !effectiveNewBody;
  const effectiveTargetBodyKey = activeBodies.some((body) => body.bodyKey === targetBodyKey)
    ? targetBodyKey
    : (activeBodies[0]?.bodyKey ?? '');
  // 读面刷新中：N 未知 → insert 提交挂起（不得发无 target 的 regular insert）。
  const bodiesPending = insertTargetChannel && bodiesLoading === true;
  // I1：读面不可用（初次失败且未在刷新）→ target 无从确定，insert 提交禁用 + 可见提示。
  // Minor 2：勾选 newBody 时无需 target（后端允许无 target 的新体）——豁免本门。
  // B6 M-A4.2a：booleanBodies 自带通道级读面门（booleanBodiesUnavailable，含
  // 无连接/无 bodiesError 的不可用态）——通用门让位，避免同一禁提交因双报。
  const newBodyReadExempt = extrudeChannel && effectiveNewBody;
  const bodiesReadFailed =
    insertTargetChannel && effectiveFeatureType !== 'booleanBodies'
    && bodies === undefined && bodiesLoading !== true
    && bodiesError !== undefined && !newBodyReadExempt;
  const sketchOptions = sketches ?? EMPTY_SKETCHES;
  const [selectedSketchId, setSelectedSketchId] = React.useState('');
  // revolve 通道面域序（RevolveParams.regionIndex 单选语义——M6-c T3 起 extrude
  // 不再消费此态，其面域选择走下方 selectedRegions 多选集）。
  const [regionIndex, setRegionIndex] = React.useState(0);
  // M6-c T3（extrude 通道）：多面域选中集——SketchDto.regions 面积降序下标，
  // 升序存储（载荷集语义确定性；后端重复下标按集去重幂等）。缺省 [0]=最大面域
  //（v1.6 regionIndex 缺省 0 的语义锚同源），随面域读取落定回填。
  const [selectedRegions, setSelectedRegions] = React.useState<number[]>([]);
  // 面域读面（getSketch.regions——面积降序数组；undefined=未选/读取中）。
  const [regions, setRegions] = React.useState<SketchRegionDto[] | undefined>(undefined);
  const [regionsLoading, setRegionsLoading] = React.useState(false);
  const [regionsError, setRegionsError] = React.useState<string | undefined>(undefined);
  // M6-b T4（revolve 通道）：getSketch.entities 原样留存（与 regions 同一
  // 响应落定，无独立读取窗）；undefined=未选草图/读取中。
  const [sketchEntities, setSketchEntities] = React.useState<SketchEntityDto[] | undefined>(undefined);
  // M6-b T4（revolve 通道）：旋转轴选择——fullRevolve 缺省 true（满周）；
  // 角度 UI 度制（用户面单位裁决），载荷前转弧度（见 handleConfirm 注记）。
  const [selectedAxisId, setSelectedAxisId] = React.useState<number | undefined>(undefined);
  const [fullRevolve, setFullRevolve] = React.useState(true);
  const [angleDegrees, setAngleDegrees] = React.useState('360');
  // 面域读取代际：换草图/换连接时 +1，慢响应过期即丢弃（useSketchSystem
  // activeEpochRef 同款纪律——stale-clobber 防旧草图面域覆写新选择）。
  const regionsEpochRef = React.useRef(0);
  // B2 loft 通道：两截面草图选择（LoftParams.sketchIds 二元组；两键均选且互不相同
  // 才可提交——同草图重复是退化放样，服务端 zod 同口径拒收）。
  const [loftSketchA, setLoftSketchA] = React.useState('');
  const [loftSketchB, setLoftSketchB] = React.useState('');
  // B3 sweep 通道：轮廓草图 + 路径草图（两键均选且互不相同才可提交——同草图是退化
  // 扫掠/同平面路径，服务端 zod 同口径拒收）。
  const [sweepProfileSketchId, setSweepProfileSketchId] = React.useState('');
  const [sweepPathSketchId, setSweepPathSketchId] = React.useState('');
  // B4 mirror 通道：镜像平面（世界系过原点；缺省 XZ=法向 Y，与 Onshape 默认前视镜像同锚）。
  const [mirrorPlane, setMirrorPlane] = React.useState<MirrorParams['plane']>('XZ');
  // B5 pattern 通道：kind（ribbon 入口可指定初始值）+ count（含原件，缺省 3）+
  // spacing（linear 缺省 10）/ angle（circular 缺省 360°）+ axis（linear 缺省 X；
  // circular 锁定 Z，见下方载荷/渲染）。
  const [patternKind, setPatternKind] = React.useState<PatternParams['kind']>(initialPatternKind ?? 'linear');
  const [patternCount, setPatternCount] = React.useState('3');
  const [patternSpacing, setPatternSpacing] = React.useState('10');
  const [patternAngle, setPatternAngle] = React.useState('360');
  const [patternAxis, setPatternAxis] = React.useState<PatternParams['axis']>('X');
  // B6 M-A4.2a booleanBodies 通道：target 键 + tools 键集 + operation + keepTools。
  // target 缺省 ''（生效值回落首个 active authored body）；tools 以键集维护
  //（点选切换天然去重——载荷再按 activeBodies 序归一，无重复项）。
  const [booleanTargetKey, setBooleanTargetKey] = React.useState('');
  const [booleanToolKeys, setBooleanToolKeys] = React.useState<string[]>([]);
  const [booleanOperation, setBooleanOperation] =
    React.useState<BooleanBodiesParams['operation']>('unite');
  const [booleanKeepTools, setBooleanKeepTools] = React.useState(false);
  // 生效目标：选中键仍在读面则用它，否则回落首个 active authored body。
  const booleanEffectiveTargetKey = activeBodies.some((body) => body.bodyKey === booleanTargetKey)
    ? booleanTargetKey
    : (activeBodies[0]?.bodyKey ?? '');
  // 生效工具：只保留仍在读面中的键，按 activeBodies 序归一（载荷确定/无重复）。
  const booleanEffectiveToolKeys = React.useMemo(
    () => activeBodies
      .filter((body) => booleanToolKeys.includes(body.bodyKey))
      .map((body) => body.bodyKey),
    [activeBodies, booleanToolKeys],
  );
  // 门禁（对齐 M4.1 planBooleanInsert 的 op 边界语义，UI 先挡 + 后端同口径拒收）：
  // <2 active authored body / 读面刷新中 / 读面不可用 / tools 空 / target 在 tools。
  const booleanBodiesNeedsTwo =
    booleanBodiesChannel && bodies !== undefined && bodiesLoading !== true && activeBodies.length < 2;
  const booleanBodiesUnavailable =
    booleanBodiesChannel && bodies === undefined && bodiesLoading !== true;
  const booleanBodiesToolsMissing =
    booleanBodiesChannel && booleanEffectiveToolKeys.length === 0;
  const booleanBodiesTargetInTools =
    booleanBodiesChannel && booleanEffectiveTargetKey !== ''
    && booleanEffectiveToolKeys.includes(booleanEffectiveTargetKey);
  const booleanBodiesReady =
    !booleanBodiesChannel
    || (bodies !== undefined
      && bodiesLoading !== true
      && activeBodies.length >= 2
      && booleanEffectiveTargetKey !== ''
      && booleanEffectiveToolKeys.length >= 1
      && !booleanBodiesTargetInTools);
  const handleBooleanTargetChange = React.useCallback((bodyKey: string) => {
    setBooleanTargetKey(bodyKey);
  }, []);
  // 点选切换（目标行常态禁用——冲突态保持可点以便解选，见渲染注记）。
  const handleToggleBooleanTool = React.useCallback((bodyKey: string) => {
    setBooleanToolKeys((prev) =>
      prev.includes(bodyKey) ? prev.filter((key) => key !== bodyKey) : [...prev, bodyKey],
    );
  }, []);

  // ── fillet 通道（M6-b T6）：半径/切向延伸/边 chips + 对话框驱动拾取会话 ──
  const [radius, setRadius] = React.useState('5');
  const [propagateSmooth, setPropagateSmooth] = React.useState(true);
  // 拾取态：picking 供渲染（按钮切换/✓禁用），ref 镜像供 Escape 分叉（监听
  // 终身一次挂载，不吃闭包旧态——与 onCancelRef 同纪律）；工具实例经 ref 持有
  //（stop/卸载守卫时 exitTool，实例类型来自动态 import，不静态引入工具模块）。
  const [picking, setPicking] = React.useState(false);
  const pickingRef = React.useRef(false);
  const pickToolRef = React.useRef<{ exitTool(): Promise<void> } | null>(null);

  /** 结束拾取（三通道汇合：Esc 分叉/再点钮/卸载守卫；工具自然退出亦归此态）。 */
  const stopPick = React.useCallback(() => {
    if (!pickingRef.current) return;
    pickingRef.current = false;
    setPicking(false);
    const tool = pickToolRef.current;
    pickToolRef.current = null;
    // 工具已被框架先行退出（Esc 经 startDefaultTool 替换）时 exitTool 为 no-op。
    void tool?.exitTool();
  }, []);

  /** 添加边（M6-b T6）：动态 import 启动 FilletEdgePickTool（工具模块静态依赖
   * editor 基座链，动态拆包见文件头注 fillet 通道裁决）；回调直改 chips。 */
  const startPick = React.useCallback(() => {
    if (pickingRef.current || !connectionKey) return;
    pickingRef.current = true;
    setPicking(true);
    void (async () => {
      let tool: { exitTool(): Promise<void> } | undefined = undefined;
      try {
        const { startFilletEdgePick } = await import('../tools/modeling/FilletEdgePickTool.js');
        tool = await startFilletEdgePick({
          connectionKey,
          onEdgeAdded: (ref, ownerElementId) => {
            // Critical 1：owner=拾取元素 id（=getBodies.bodyKey）；去重键含 owner，
            // 跨体同 refKey 不折叠（否则会丢失混合体错误、造成错体 target）。
            const key = `${ownerElementId}:${filletEdgeRefKey(ref)}`;
            setFilletPicks((prev) =>
              prev.some((pick) => `${pick.ownerElementId}:${filletEdgeRefKey(pick.ref)}` === key)
                ? prev
                : [...prev, { ref, ownerElementId }],
            );
          },
          onEdgeRemoved: (ref, ownerElementId) => {
            const key = `${ownerElementId}:${filletEdgeRefKey(ref)}`;
            setFilletPicks((prev) =>
              prev.filter((pick) => `${pick.ownerElementId}:${filletEdgeRefKey(pick.ref)}` !== key),
            );
          },
          onError: (message) =>
            IModelApp.notifications.outputMessage(
              new NotifyMessageDetails(OutputMessagePriority.Error, message),
            ),
          onEnded: stopPick,
        });
      } catch {
        tool = undefined; // 动态加载/安装异常与启动失败同面——回非拾取态不悬挂
      }
      pickToolRef.current = tool ?? null;
      if (!tool) {
        // 启动失败（视口不适配/宿主未就绪）——回非拾取态（诚实不悬挂）。
        pickingRef.current = false;
        setPicking(false);
      }
    })();
  }, [connectionKey, stopPick]);

  // 卸载守卫：对话框关闭/确认成功而拾取仍在场——退出工具不留孤儿拾取会话。
  React.useEffect(() => {
    return () => {
      const tool = pickToolRef.current;
      if (tool) {
        pickingRef.current = false;
        pickToolRef.current = null;
        void tool.exitTool();
      }
    };
  }, []);

  // Escape 分叉回填（见上方 onEscapeRef 注记）：拾取态=只结束拾取回对话框。
  onEscapeRef.current = () => {
    if (pickingRef.current) stopPick();
    else onCancelRef.current?.();
  };


  // 面域读面（对话框直调 getSketch RPC——裁决见文件头注）：读操作不涉写租约；
  // 未选草图/连接缺失时清态（后者以就地提示诚实禁提交，不发起 RPC）。
  React.useEffect(() => {
    const epoch = ++regionsEpochRef.current;
    if (!sketchChannel || selectedSketchId === '') {
      setRegions(undefined);
      setSketchEntities(undefined);
      setSelectedRegions([]); // M6-c T3：多选集随身份清空（不跨草图残留）
      setRegionsLoading(false);
      setRegionsError(undefined);
      return;
    }
    if (!connectionKey) {
      setRegions(undefined);
      setSketchEntities(undefined);
      setSelectedRegions([]);
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
          setSketchEntities(sketch?.entities ?? []); // M6-b T4：revolve 轴候选源（同响应落定）
          // M6-c T3：多选集缺省回填 [0]=最大面域（单/多面域同式；空集=无面域）。
          setSelectedRegions((sketch?.regions?.length ?? 0) > 0 ? [0] : []);
          setRegionsLoading(false);
        },
        (err: unknown) => {
          if (regionsEpochRef.current !== epoch) return;
          setRegions([]);
          setSketchEntities([]);
          setSelectedRegions([]);
          setRegionsError(err instanceof Error ? err.message : String(err));
          setRegionsLoading(false);
        },
      );
  }, [sketchChannel, selectedSketchId, connectionKey, t]);

  // 轴候选（M6-b T4 revolve 通道；M6-c T5 判型升级）：草图内 line 实体按端点
  // 解算坐标判型（classifyAxisLines——竖直/水平/斜线+同类序号；id 即载荷
  // axis.sketchEntityId，同值可对账）。非 revolve 通道不消费（extrude 无轴语义）。
  const axisLines = React.useMemo<AxisLineDescriptor[]>(
    () => (revolveChannel ? classifyAxisLines(sketchEntities ?? []) : []),
    [revolveChannel, sketchEntities],
  );

  // 轴缺省选第一条（任务规格）；换草图/实体集变化致选中失效时回落首条，无
  // line（空数组）即清选（提交随 sketchReady 禁用 + 无轴提示呈现）。
  React.useEffect(() => {
    if (axisLines.length === 0) {
      if (selectedAxisId !== undefined) setSelectedAxisId(undefined);
      return;
    }
    if (selectedAxisId === undefined || !axisLines.some((line) => line.id === selectedAxisId)) {
      setSelectedAxisId(axisLines[0]!.id);
    }
  }, [axisLines, selectedAxisId]);

  // 提交门（M6-a T6；M6-c T3 面域判据分叉）：草图通道就绪 = 已选草图 ∧ 面域
  // 已载且非空 ∧ 面域选择就绪——extrude=多选集非空（用户清空 →「选择至少一个
  // 面域」+ ✓ 禁用）；revolve=单选序未越界（换草图瞬间旧值残留防御）∧ 轴线
  // 已选。不就绪 → ✓/成品 禁用——T3 zod 拒收语义前置到 UI（无 sketchId 的空
  // profile 裸奔不再发放行）。
  const regionCount = regions?.length ?? 0;
  const sketchReady =
    !sketchChannel ||
    (selectedSketchId !== '' &&
      !regionsLoading &&
      regionsError === undefined &&
      regionCount > 0 &&
      (revolveChannel
        ? regionIndex < regionCount && selectedAxisId !== undefined
        : selectedRegions.length > 0));
  // 提交门（M6-b T6 fillet 追加）：已拾至少一条边（空边集禁提交——shared
  // FilletParams.edges 非空语义前置）∧ 拾取会话已结束（会话在场时禁提交）。
  const filletReady = !filletChannel || (filletEdges.length > 0 && !picking);
  // 提交门（B2 loft）：两截面均已选、互不相同、**且仍存在于实时草图选项**——
  // 非模态对话框打开期间删除已选草图（sketches 缩水）不得留下陈旧 id 放行提交
  //（loftNeedsTwo/loftSelectionStale 均入就绪判据；服务端 zod/存在性检查兜底）。
  const loftNeedsTwo = loftChannel && sketchOptions.length < 2;
  const loftDuplicate = loftChannel && loftSketchA !== '' && loftSketchA === loftSketchB;
  const loftSelectionStale = loftChannel && loftSketchA !== '' && loftSketchB !== ''
    && (!sketchOptions.some((option) => option.id === loftSketchA)
      || !sketchOptions.some((option) => option.id === loftSketchB));
  const loftReady = !loftChannel
    || (!loftNeedsTwo && !loftDuplicate && !loftSelectionStale
      && loftSketchA !== '' && loftSketchB !== '');
  // 提交门（B3 sweep）：轮廓与路径均已选、互不相同、**且仍存在于实时草图选项**——
  // 非模态对话框打开期间删除已选草图（sketches 缩水）不得留下陈旧 id 放行提交
  //（服务端 zod/存在性检查兜底）。
  const sweepNeedsTwo = sweepChannel && sketchOptions.length < 2;
  const sweepDuplicate = sweepChannel && sweepProfileSketchId !== '' && sweepProfileSketchId === sweepPathSketchId;
  const sweepSelectionStale = sweepChannel && sweepProfileSketchId !== '' && sweepPathSketchId !== ''
    && (!sketchOptions.some((option) => option.id === sweepProfileSketchId)
      || !sketchOptions.some((option) => option.id === sweepPathSketchId));
  const sweepReady = !sweepChannel
    || (!sweepNeedsTwo && !sweepDuplicate && !sweepSelectionStale
      && sweepProfileSketchId !== '' && sweepPathSketchId !== '');
  // 提交门（B5 pattern）：count 须为 ≥2 的整数；linear spacing >0；circular angle
  // (0,360] 度——与服务端 zod 同域（UI 先挡 + 后端 txn 前拒收双层防御）。
  const patternCountNumber = Number(patternCount);
  const patternCountValid = Number.isInteger(patternCountNumber) && patternCountNumber >= 2 && patternCountNumber <= 1000; // M1：与 zod 同域 2..1000
  const patternSpacingNumber = Number(patternSpacing);
  const patternSpacingValid = Number.isFinite(patternSpacingNumber) && patternSpacingNumber > 0;
  const patternAngleNumber = Number(patternAngle);
  const patternAngleValid = Number.isFinite(patternAngleNumber) && patternAngleNumber > 0 && patternAngleNumber <= 360;
  // ✓/成品统一禁用面（各通道门禁 + 上游门禁；两处按钮同源防漂移）。pattern 的数值
  // 非法不在此禁用——提交时给字段级诚实文案（同 extrude distance 的既有手感：
  // 数字域错误在确认出口报，而非静默灰化）。
  const submitDisabled = submitting || editStandalone || !canEdit || !sketchReady || !filletReady
    || !loftReady || !sweepReady || booleanUpstreamMissing || mirrorUpstreamMissing
    || patternUpstreamMissing
    // B6 M-A3.2a：读面刷新中（N 未知）/读面不可用（target 无从确定）禁提交；
    // 目标下拉在场时必须已有有效目标；Critical 1：边跨体/孤儿 owner 或无 owner
    // 通道（chamfer/shell）一律禁提交，绝不回落默认 target。
    || bodiesPending || bodiesReadFailed
    || filletTargetError !== undefined || unownedTargetChannel
    || (targetSelectorVisible && effectiveTargetBodyKey === '')
    // B6 M-A4.2a：body boolean 通道门禁（体不足/读面不可用/工具空/目标在工具）。
    || !booleanBodiesReady;

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

  // 草图选择（M6-a T6）：换草图即重置面域选择（regions 语义=该草图的面积降序
  // 数组，旧下标不跨草图续用；读取中的过渡窗由 sketchReady 禁提交兜住）——
  // 单选序归零 + 多选集同步清空（M6-c T3：多选集不清则载荷会以新 sketchId 配
  // 旧草图下标，读取 effect 落定前的过渡帧故须就地失效）。
  const handleSketchChange = React.useCallback((sketchId: string) => {
    setSelectedSketchId(sketchId);
    setRegionIndex(0);
    setSelectedRegions([]);
  }, []);

  // 草图 chip ×移除 = 清选择（回到「选择草图…」占位，提交随 sketchReady 禁用）。
  const handleRemoveSketchChip = React.useCallback(() => {
    setSelectedSketchId('');
    setRegionIndex(0);
    setSelectedRegions([]);
  }, []);

  // 面域多选（M6-c T3 extrude 通道）：点 chip 切换选中态；升序存储（载荷集
  // 语义确定性）；「全选/清空」轻量操作补全 Onshape 多选手感的两端。
  const handleToggleRegion = React.useCallback((index: number) => {
    setSelectedRegions((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b),
    );
  }, []);
  const handleSelectAllRegions = React.useCallback(() => {
    setSelectedRegions((regions ?? []).map((_, index) => index));
  }, [regions]);
  const handleClearRegions = React.useCallback(() => setSelectedRegions([]), []);

  const buildResult = React.useCallback((): FeatureDialogResult => ({
    resultType,
    booleanScope,
    entities: chips,
    direction,
    startOffset,
    symmetric,
    draft,
    // M6-c T5：底部滑杆=透明度（采集对齐；预览消费挂账见文件头注）。
    transparency,
    // M6-b T6：仅 fillet 通道携带已拾边集（其余通道键缺省——既有钉形载荷不破）。
    ...(filletChannel ? { filletEdges } : {}),
    // B6 M-A3.2a：extrude 结构键回传（仅 true 时携带；edit 模式=落库落值回显）。
    ...(newBodyVisible && effectiveNewBody ? { newBody: true } : {}),
  }), [resultType, booleanScope, chips, direction, startOffset, symmetric, draft, transparency, filletChannel, filletEdges, newBodyVisible, effectiveNewBody]);

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
    if (filletChannel && !filletReady) return; // fillet 通道门禁（空边集/拾取中——防御兜底）
    if (loftChannel && !loftReady) return; // loft 通道门禁（两截面未选/同草图——防御兜底）
    if (sweepChannel && !sweepReady) return; // sweep 通道门禁（轮廓/路径未选/同草图——防御兜底）
    if (booleanUpstreamMissing) return; // 布尔上游门禁（无实体——✓ 已禁用，防御兜底）
    if (mirrorUpstreamMissing) return; // mirror 上游门禁（无实体可镜像——✓ 已禁用，防御兜底）
    if (patternUpstreamMissing) return; // pattern 上游门禁（无实体可阵列——✓ 已禁用，防御兜底）
    if (booleanBodiesChannel && !booleanBodiesReady) return; // 体布尔通道门禁（体不足/工具空/目标在工具——防御兜底）
    // B6 M-A3.2a：读面刷新中（N 未知）不派发；N>1 目标必选（禁止无 target 的 regular insert）。
    if (bodiesPending || bodiesReadFailed) return;
    if (filletTargetError !== undefined || unownedTargetChannel) return;
    if (targetSelectorVisible && effectiveTargetBodyKey === '') return;
    // B5 pattern 参数校验：按当前形态给具体文案（count/spacing/angle——与服务端 zod 同域）。
    if (patternChannel) {
      if (!patternCountValid) {
        setError(t('partStudio.featureDialog.patternCountInvalid'));
        return;
      }
      if (patternKind === 'linear' && !patternSpacingValid) {
        setError(t('partStudio.featureDialog.patternSpacingInvalid'));
        return;
      }
      if (patternKind === 'circular' && !patternAngleValid) {
        setError(t('partStudio.featureDialog.patternAngleInvalid'));
        return;
      }
    }
    // 距离校验（extrude/通用路径；revolve/fillet/loft/sweep/mirror/pattern 无距离量——旋转角即参数/
    // 半径即参数/放样无扫掠距离/扫掠无扫掠距离/镜像无距离/阵列无距离，输入已隐藏）。
    let parsedDistance = 0;
    if (!revolveChannel && !filletChannel && !loftChannel && !sweepChannel && !mirrorChannel
      && !patternChannel && !booleanBodiesChannel) {
      parsedDistance = Number(distance);
      if (distance.trim() === '' || !Number.isFinite(parsedDistance) || parsedDistance <= 0) {
        setError(t('partStudio.featureDialog.distanceInvalid'));
        return;
      }
    }
    // 半径校验（M6-b T6 fillet 通道）：内部米制直传（单位换算在显示层——
    // architecture.md §四；缺省 5 与 Onshape 采集默认同量级）。
    let parsedRadius = 0;
    if (filletChannel) {
      parsedRadius = Number(radius);
      if (radius.trim() === '' || !Number.isFinite(parsedRadius) || parsedRadius <= 0) {
        setError(t('partStudio.featureDialog.radiusInvalid'));
        return;
      }
    }
    // 角度校验与换算（M6-b T4 revolve 且非全周）：UI 度制（用户面单位裁决）→
    // 载荷弧度制（shared RevolveParams.angle 契约 (0, 2π]，度制域 (0, 360]）；
    // 180° → Math.PI 的 π 精度由单测钉死。fullRevolve=true 时不带 angle 键。
    let angleRadians: number | undefined;
    if (revolveChannel && !fullRevolve) {
      const degrees = Number(angleDegrees);
      if (angleDegrees.trim() === '' || !Number.isFinite(degrees) || degrees <= 0 || degrees > 360) {
        setError(t('partStudio.featureDialog.angleInvalid'));
        return;
      }
      angleRadians = (degrees * Math.PI) / 180;
    }
    // Critical 1：fillet 的 target 只来自拾取边父体（N>1）；其余通道来自手动下拉。
    const opTargetBodyId = filletChannel
      ? filletAutomaticTargetId
      : targetSelectorVisible && effectiveTargetBodyKey !== ''
        ? effectiveTargetBodyKey
        : undefined;
    setError(undefined);
    setSubmitting(true);
    void (async () => {
      let result: FeatureOpResult;
      try {
        result = await applyOp({
          kind: 'insertFeature',
          // M7 v1.10：布尔作用域映射后的提交类型（新建=基础类型；加入/移除=booleanAdd/
          // booleanSubtract）。外层门禁已确保 featureType 在场，effectiveFeatureType 随之非空
          //（`!` 收窄：布尔映射只在基础类型为 extrude/boolean* 时产生）。
          featureType: effectiveFeatureType!,
          // M6-a T6：extrude 走草图通道——{sketchId} 草图寻址 + 空 profile
          //（shared 互斥语义：sketchId 在场时 profile 须空数组，后端
          // sketchRegionsFrom 按面域数组产轮廓）。M7 v1.10：布尔草图驱动独立
          // 分支见下方 booleanChannel（{sketchId, distance, regions, operation}，
          // 无 profile 键）；revolve/fillet 各有独立构造器。
          // M6-c T3：面域寻址升级——regions 多选数组直出（缺省 [0]=最大面域；
          // 不再发 regionIndex——shared v1.8 起该键 @deprecated，服务端 zod 与
          // regions 互斥拒收，同给两键即拒）。
          // M6-b T4：revolve 分支独立构造器——{sketchId, regionIndex,
          // axis, fullRevolve, angle?}（shared v1.7 RevolveParams；**裁决钉死：
          // RevolveParams 未扩 regions，revolve 保持单选 regionIndex 不越契约**；
          // symmetric 等 extrude 扩展不适用，对称载荷挂账见文件头注 T4-minor）。
          // M6-b T6：fillet 分支独立构造器——{radius, propagateSmooth,
          // edges:[{edge:{nodeId,entityId}}...]}（边自身持久 id 透传，shared v1.9
          // M6-d 纯换契约；无 profile/distance 语义）。
          params: patternChannel
            ? (patternKind === 'linear'
                ? {
                    // B5 pattern（shared v1.14 PatternParams）：PART/body 线性阵列——
                    // count 含原件 + spacing>0 + 世界轴。无 angle 键（两形态键集互斥）。
                    kind: 'linear' as const,
                    count: patternCountNumber,
                    spacing: patternSpacingNumber,
                    axis: patternAxis,
                  }
                : {
                    // 圆周阵列：绕世界 Z 过原点；axis 恒 'Z'（UI 锁定 + 服务端 zod 同口径）。
                    // angle 度制 (0,360]；实例角度=k*step（360→angle/count；部分角→
                    // angle/(count-1)，首末夹总角）。无 spacing 键。
                    kind: 'circular' as const,
                    count: patternCountNumber,
                    angle: patternAngleNumber,
                    axis: 'Z' as const,
                  })
            : mirrorChannel
            ? {
                // B4 mirror（shared v1.13 MirrorParams）：世界平面三选一 + keepOriginal 字面量
                // true（首版恒保留原体并与镜像体 Unite）。无 distance/profile/regions/草图键。
                plane: mirrorPlane,
                keepOriginal: true,
              }
            : sweepChannel
            ? {
                // B3 sweep（shared v1.12 SweepParams）：轮廓草图 + 路径草图 + 实体类型。
                // 无 distance/profile/regions/twist/scale/lock/guides 键（首版范围裁决）。
                profileSketchId: sweepProfileSketchId,
                pathSketchId: sweepPathSketchId,
                bodyType: 'SOLID',
              }
            : loftChannel
            ? {
                // B2 loft（shared v1.11 LoftParams）：两截面草图二元组 + 实体类型。
                // 无 distance/profile/regions/guides 键（首版范围裁决）。
                sketchIds: [loftSketchA, loftSketchB],
                bodyType: 'SOLID',
              }
            : filletChannel
            ? {
                radius: parsedRadius,
                propagateSmooth,
                edges: filletEdges.map((edge) => ({ edge: edge.edge })),
              }
            : revolveChannel
            ? {
                // 注：不带 profile 键（RevolveParams 契约无此字段；后端 zod 会剥离——
                // B5 起 PatternParams 也带 axis，三元上下文按 axis 收窄后该冗余键触发
                // 过配检查，顺带对齐契约）。
                sketchId: selectedSketchId,
                regionIndex,
                axis: { sketchEntityId: selectedAxisId! },
                fullRevolve,
                ...(angleRadians !== undefined ? { angle: angleRadians } : {}),
              }
            // B6 M-A4.2a：body boolean（shared 1.16 BooleanBodiesParams）——
            // target/tools 均为 BodyRef（bodyKey=getBodies[].bodyKey）；target 恰 1、
            // tools ≥1 且与 target 互斥（booleanBodiesReady 已前置）；keepTools 显式
            // 布尔（false=成功后工具被消费）。目标只经 params.targets——op 层不带
            // targetBodyId（M4.1 planBooleanInsert：params 唯一真源，不一致值被拒）。
            : booleanBodiesChannel
            ? {
                targets: [{ bodyKey: booleanEffectiveTargetKey }],
                tools: booleanEffectiveToolKeys.map((bodyKey) => ({ bodyKey })),
                operation: booleanOperation,
                keepTools: booleanKeepTools,
              }
            // M7 v1.10：草图驱动布尔（shared BooleanParams）——operation 由映射后的类型名
            // 唯一决定（booleanAdd⇔unite / booleanSubtract⇔subtract，服务端 zod 一致性拒收）；
            // 无 profile 键（与内联 profile 旧路径互斥）；面域多选语义与 extrude 同锚。
            // symmetric 不适用（BooleanParams 无该键，工具体沿草图法向单向扫掠）。
            : booleanChannel
            ? {
                sketchId: selectedSketchId,
                distance: parsedDistance,
                regions: [...selectedRegions],
                operation: effectiveFeatureType === 'booleanAdd' ? 'unite' : 'subtract',
              }
            : sketchChannel
              ? {
                  profile: [],
                  distance: parsedDistance,
                  sketchId: selectedSketchId,
                  regions: [...selectedRegions],
                  // M6-b T3 契约（shared v1.7 ExtrudeParams.symmetric）落地后的
                  // T4-minor 接线收口：对称复选勾选才带键（缺省省略=载荷向后
                  // 兼容，既有钉形测试不破）。
                  ...(symmetric ? { symmetric: true } : {}),
                  // B6 M-A3.2a：新建实体结构键——勾选才带键（缺省省略；后端缺省
                  // false=既有 ADD 语义逐字不变）。
                  ...(effectiveNewBody ? { newBody: true } : {}),
                }
              : { profile: [], distance: parsedDistance },
          // B6 M-A3.2a：N>1 的显式目标 body 在 op 层（不在 params）；N≤1/newBody
          // 缺省不发（legacy/全局链尾语义由后端裁决）。Critical 1：fillet 的值=
          // 拾取边父体（filletAutomaticTargetId），不是任何默认值。
          ...(opTargetBodyId === undefined ? {} : { targetBodyId: opTargetBodyId }),
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
    effectiveFeatureType,
    sketchChannel,
    booleanChannel,
    booleanUpstreamMissing,
    mirrorChannel,
    mirrorUpstreamMissing,
    mirrorPlane,
    patternChannel,
    patternUpstreamMissing,
    patternKind,
    patternCountNumber,
    patternCountValid,
    patternSpacingNumber,
    patternSpacingValid,
    patternAngleNumber,
    patternAngleValid,
    patternAxis,
    // B6 M-A4.2a：booleanBodies 载荷面。
    booleanBodiesChannel,
    booleanBodiesReady,
    booleanEffectiveTargetKey,
    booleanEffectiveToolKeys,
    booleanOperation,
    booleanKeepTools,
    revolveChannel,
    sketchReady,
    filletChannel,
    filletReady,
    filletEdges,
    radius,
    propagateSmooth,
    loftChannel,
    loftReady,
    loftSketchA,
    loftSketchB,
    sweepChannel,
    sweepReady,
    sweepProfileSketchId,
    sweepPathSketchId,
    selectedSketchId,
    regionIndex,
    selectedRegions,
    selectedAxisId,
    fullRevolve,
    angleDegrees,
    distance,
    // B6 M-A3.2a：newBody/target 载荷面。
    effectiveNewBody,
    targetSelectorVisible,
    effectiveTargetBodyKey,
    bodiesPending,
    bodiesReadFailed,
    filletAutomaticTargetId,
    filletTargetError,
    unownedTargetChannel,
    t,
    onConfirm,
    buildResult,
    featureName,
  ]);

  // 选中回显 chip（M6-a T6；M6-c T3 分叉）：「{草图名} 的面」——对齐采集规格
  // 「Sketch 1 的 面」chips 形态；「· 面域 N」后缀仅 revolve 保留（单选下拉的
  // 回显位），extrude 的面域选中态由多选 chips 自身 aria-pressed 呈现（后缀
  // 表达不了集合）。
  const selectedSketch = sketchOptions.find((option) => option.id === selectedSketchId);
  const sketchChipLabel = selectedSketch
    ? revolveChannel && regionCount > 1
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

  // 轴下拉项（M6-c T5 判型命名）：竖直线/水平线/斜线+同类序号；unknown（端点
  // 无解算坐标）回退「线 {id}」——载荷寻址（axis.sketchEntityId=id）不受影响。
  const axisOptionLabel = (line: AxisLineDescriptor): string => {
    switch (line.kind) {
      case 'vertical':
        return t('partStudio.featureDialog.axisOptionVertical', { index: line.ordinal });
      case 'horizontal':
        return t('partStudio.featureDialog.axisOptionHorizontal', { index: line.ordinal });
      case 'slanted':
        return t('partStudio.featureDialog.axisOptionSlanted', { index: line.ordinal });
      default:
        return t('partStudio.featureDialog.axisOption', { id: line.id });
    }
  };

  // body 选项名（getBodies.name；缺省「实体 N」——目标下拉/零件段同款命名）。
  const bodyOptionLabel = (body: BodyInfo, index: number): string =>
    body.name && body.name.trim() !== ''
      ? body.name
      : t('partStudio.tree.defaultBodyName', { index: index + 1 });

  // 折叠段可见集（M6-b T4）：草图通道「对称」以平铺复选顶替（Onshape 采集
  // 形态），折叠段 symmetric 隐藏防双复选绑同态；非通道（edit/布尔/壳期）不动。
  const visibleSections = React.useMemo(
    () => (sketchChannel || loftChannel || sweepChannel || mirrorChannel || patternChannel ? SECTIONS.filter((section) => section.id !== 'symmetric') : SECTIONS),
    [sketchChannel, loftChannel, sweepChannel, mirrorChannel, patternChannel],
  );

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
            disabled={submitDisabled}
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

      {/* 布尔作用域双页签（os-31）。**booleanBodies（体布尔）不渲染**：该通道的
          结果类型/布尔作用域均由 M4.1 契约固定（实体 + unite/subtract），遗留页签
          全部惰性；尤其「相交」页签在体布尔下可点却不会改变 operation，会误导用户
          以为提交了相交（实际仍 unite）——体布尔的相交仅由下方 operation 下拉的
          禁用选项表达，杜绝静默降级。 */}
      {featureType !== 'booleanBodies' && (
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
            {BOOLEAN_SCOPES.map((scope) => {
              // 提交态禁用（B1 复审）：①相交无后端特征类型，禁用防静默并集；
              // ②无实体时加入/移除无上游，禁用防「成功 toast + status=1 死特征」。
              const scopeDisabled =
                booleanScopeCapable &&
                (scope === 'intersect' || (booleanScopeNoBody && (scope === 'add' || scope === 'remove')));
              const scopeDisabledHint =
                scope === 'intersect'
                  ? t('partStudio.featureDialog.booleanIntersectUnsupported')
                  : t('partStudio.featureDialog.booleanNoBodyHint');
              return (
                <button
                  key={scope}
                  type="button"
                  role="tab"
                  aria-selected={booleanScope === scope}
                  disabled={scopeDisabled}
                  title={scopeDisabled ? scopeDisabledHint : undefined}
                  className={[
                    'part-studio-feature-dialog__tab',
                    booleanScope === scope ? 'part-studio-feature-dialog__tab--active' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setBooleanScope(scope)}
                >
                  {t(`partStudio.featureDialog.booleanScopes.${scope}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

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

        {/* B6 M-A3.2a：body 读面刷新中——N 未知，body-producing 提交挂起（不得发
            无 target 的 regular insert）；读面就绪即自动解除。 */}
        {bodiesPending && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-bodies-loading-hint"
          >
            {t('partStudio.featureDialog.bodiesLoadingHint')}
          </p>
        )}
        {/* I1：读面不可用（初次失败）——target 无从确定，提交禁用；零件段错误条可重试。 */}
        {bodiesReadFailed && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-bodies-unavailable-hint"
          >
            {t('partStudio.featureDialog.bodiesUnavailableHint', { message: bodiesError })}
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

        {/* 布尔上游门禁 / 相交不支持提示（B1 复审 Important/Minor）——禁用页签的可见原因，
            不静默降级：无实体时布尔无上游，相交无后端特征类型。 */}
        {booleanScopeNoBody && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-boolean-no-body-hint"
          >
            {t('partStudio.featureDialog.booleanNoBodyHint')}
          </p>
        )}
        {booleanScopeCapable && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-intersect-unsupported-hint"
          >
            {t('partStudio.featureDialog.booleanIntersectUnsupported')}
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

        {/* 距离（M4-T6：insertFeature extrude 的唯一可编辑量；常驻不折叠）。
            M6-b T4：revolve 通道不适用（无距离量——全周/角度即参数），输入
            隐藏、handleConfirm 跳过距离校验。M6-b T6：fillet 通道同口径
            （无距离量——半径即参数）。 */}
        {!revolveChannel && !filletChannel && !loftChannel && !sweepChannel && !mirrorChannel
          && !patternChannel && !booleanBodiesChannel && (
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
        )}

        {/* 对称平铺复选（M6-b T4，extrude 通道）：Onshape 采集形态——「对称」
            在折叠区外平铺（sketchChannel 下折叠段 symmetric 隐藏，见下方
            visibleSections）。本版仅渲染+本地态（state 即既有 symmetric，随
            onConfirm 载荷回传不变）；op 载荷不含 symmetric——ExtrudeParams
            .symmetric 契约由并行 T3 落，落地后此处接线（T4-minor 挂账）。 */}
        {extrudeChannel && (
          <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-feature-dialog-symmetric-flat">
            <input
              type="checkbox"
              checked={symmetric}
              onChange={(event) => setSymmetric(event.target.checked)}
            />
            <span>{t('partStudio.featureDialog.sections.symmetric')}</span>
          </label>
        )}

        {/* B6 M-A3.2a：extrude「新建实体」复选（结构键）——勾选才在 params 带
            newBody:true；edit 模式回显落库值且禁用（翻转=语义变更，服务端拒收）。 */}
        {newBodyVisible && (
          <label
            className="part-studio-feature-dialog__checkbox"
            data-testid="part-studio-feature-dialog-new-body"
          >
            <input
              type="checkbox"
              checked={effectiveNewBody}
              disabled={mode === 'edit' || submitting}
              onChange={(event) => setNewBody(event.target.checked)}
            />
            <span>{t('partStudio.featureDialog.newBodyLabel')}</span>
          </label>
        )}

        {/* revolve 参数区（M6-b T4）：全方位复选（fullRevolve 缺省 true）+
            角度输入（取消勾选才现；UI 度制，载荷前转弧度——见 handleConfirm）。
            独立于 extrude 距离区（revolve 分支独立构造器）。 */}
        {revolveChannel && (
          <React.Fragment>
            <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-feature-dialog-full-revolve">
              <input
                type="checkbox"
                checked={fullRevolve}
                onChange={(event) => setFullRevolve(event.target.checked)}
              />
              <span>{t('partStudio.featureDialog.fullRevolveLabel')}</span>
            </label>
            {!fullRevolve && (
              <section className="part-studio-feature-dialog__angle">
                <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-angle">
                  {t('partStudio.featureDialog.angleLabel')}
                </label>
                <input
                  id="part-studio-feature-dialog-angle"
                  type="text"
                  inputMode="decimal"
                  aria-label={t('partStudio.featureDialog.angleLabel')}
                  className="part-studio-feature-dialog__input"
                  value={angleDegrees}
                  disabled={submitting}
                  onChange={(event) => setAngleDegrees(event.target.value)}
                />
              </section>
            )}
          </React.Fragment>
        )}

        {/* fillet 参数区（M6-b T6）：半径（缺省 5，米制直传）+切向延伸复选
            （缺省 true = FilletParams.propagateSmooth）。独立构造器（见
            handleConfirm fillet 分支）。 */}
        {filletChannel && (
          <React.Fragment>
            <section className="part-studio-feature-dialog__distance">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-radius">
                {t('partStudio.featureDialog.radiusLabel')}
              </label>
              <input
                id="part-studio-feature-dialog-radius"
                type="text"
                inputMode="decimal"
                aria-label={t('partStudio.featureDialog.radiusLabel')}
                className="part-studio-feature-dialog__input"
                value={radius}
                disabled={submitting}
                onChange={(event) => setRadius(event.target.value)}
              />
            </section>
            <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-feature-dialog-propagate-smooth">
              <input
                type="checkbox"
                checked={propagateSmooth}
                onChange={(event) => setPropagateSmooth(event.target.checked)}
              />
              <span>{t('partStudio.featureDialog.propagateSmoothLabel')}</span>
            </label>
          </React.Fragment>
        )}

        {/* 芯片式实体选择框（os-31）。M6-a T6 分叉：拉伸新建 = 草图通道——
            草图下拉 + 面域下拉（regions>1 才现）+ 选中回显 chip（采集规格
            「Sketch 1 的 面」形态）；无草图/无面域 → 诚实提示 + 提交禁用。
            M6-b T6 分叉：fillet 新建 = 边 chips + 添加边（对话框驱动拾取）。
            其余（edit/非通道特征/壳期）保持通用 chips + 快速拾取不动。 */}
        <section className="part-studio-feature-dialog__entities">
          <div className="part-studio-feature-dialog__entities-header">
            <span className="part-studio-feature-dialog__entities-label">
              {booleanBodiesChannel
                ? t('partStudio.featureDialog.booleanBodiesParametersLabel')
                : filletChannel
                ? t('partStudio.featureDialog.filletEdgesLabel')
                : patternChannel
                  ? t('partStudio.featureDialog.patternParametersLabel')
                  : mirrorChannel
                    ? t('partStudio.featureDialog.mirrorPlaneLabel')
                    : sweepChannel
                      ? t('partStudio.featureDialog.sweepSketchesLabel')
                      : loftChannel
                        ? t('partStudio.featureDialog.loftSectionsLabel')
                        : t('partStudio.featureDialog.entitiesLabel')}
            </span>
            {!sketchChannel && !filletChannel && !loftChannel && !sweepChannel && !mirrorChannel
              && !patternChannel && !booleanBodiesChannel && (
              <button
                type="button"
                className="part-studio-feature-dialog__fast-pick"
                onClick={handleFastPick}
              >
                {t('partStudio.featureDialog.fastPick')}
              </button>
            )}
          </div>

          {/* B6 M-A3.2a：目标实体（N>1 active authored body 的显式写目标）——
              值进 op.targetBodyId（不是 params）；newBody 时隐藏（新体由本 op 创建）。
              手动选择仅给无拾取耦合的 insert 通道；fillet/chamfer/shell 走下方
              自动推导/禁用（Critical 1）。单 body/读面不可用保持 legacy 载荷。 */}
          {targetSelectorVisible && (
            <section
              className="part-studio-feature-dialog__distance"
              data-testid="part-studio-feature-dialog-target-body"
            >
              <label
                className="part-studio-feature-dialog__distance-label"
                htmlFor="part-studio-feature-dialog-target-body"
              >
                {t('partStudio.featureDialog.targetBodyLabel')}
              </label>
              <select
                id="part-studio-feature-dialog-target-body"
                aria-label={t('partStudio.featureDialog.targetBodyLabel')}
                className="part-studio-feature-dialog__select"
                value={effectiveTargetBodyKey}
                disabled={submitting}
                onChange={(event) => setTargetBodyKey(event.target.value)}
              >
                {activeBodies.map((body, index) => (
                  <option key={body.bodyKey} value={body.bodyKey}>
                    {bodyOptionLabel(body, index)}
                  </option>
                ))}
              </select>
            </section>
          )}

          {/* Critical 1：fillet 的 target 按拾取边父体自动确定（只读显示）；跨体/
              孤儿/消费态 owner → 显式错误 + 禁提交，绝不回落默认 body。 */}
          {filletChannel && bodies !== undefined && activeBodies.length > 1 && (
            filletTargetError !== undefined ? (
              <p
                role="alert"
                className="part-studio-feature-dialog__alert"
                data-testid="part-studio-feature-dialog-fillet-target-error"
              >
                {filletTargetError}
              </p>
            ) : filletDerivedBody ? (
              <p
                role="note"
                className="part-studio-feature-dialog__hint"
                data-testid="part-studio-feature-dialog-fillet-target-body"
              >
                {t('partStudio.featureDialog.filletTargetBody', {
                  name: filletDerivedBody.name && filletDerivedBody.name.trim() !== ''
                    ? filletDerivedBody.name
                    : t('partStudio.tree.defaultBodyName', {
                        index: activeBodies.indexOf(filletDerivedBody) + 1,
                      }),
                })}
              </p>
            ) : null
          )}

          {/* chamfer/shell：工具体/owner 通道未接线（gated）——显式禁提交，不默认 target。 */}
          {unownedTargetChannel && (
            <p
              role="note"
              className="part-studio-feature-dialog__hint"
              data-testid="part-studio-feature-dialog-unowned-target-hint"
            >
              {t('partStudio.featureDialog.unownedTargetHint')}
            </p>
          )}

          {/* B6 M-A4.2a：body boolean 通道——target 单选（active authored，缺省首个）+
              tools 多选（active authored；目标行常态禁用；冲突态保持可点以便解选）+
              operation（unite/subtract；intersect 禁用+提示）+ keepTools（缺省 false；
              消费提示 / true → I3 工具链锁提示）。读面不可用/体不足为整面门禁，
              不渲染半残字段。 */}
          {booleanBodiesChannel && (
            booleanBodiesUnavailable ? (
              <p
                role="note"
                className="part-studio-feature-dialog__hint"
                data-testid="part-studio-feature-dialog-boolean-bodies-unavailable"
              >
                {bodiesError !== undefined
                  ? t('partStudio.featureDialog.bodiesUnavailableHint', { message: bodiesError })
                  : t('partStudio.featureDialog.booleanBodiesUnavailableHint')}
              </p>
            ) : booleanBodiesNeedsTwo ? (
              <p
                role="note"
                className="part-studio-feature-dialog__hint"
                data-testid="part-studio-feature-dialog-boolean-needs-two-hint"
              >
                {t('partStudio.featureDialog.booleanBodiesNeedsTwoHint')}
              </p>
            ) : bodies === undefined ? (
              // 读面刷新中（bodies 尚未落定）——全局 bodiesLoading 提示已呈现，
              // 此处不渲染半残字段（N 未知）。
              null
            ) : (
              <React.Fragment>
                <section className="part-studio-feature-dialog__distance">
                  <label
                    className="part-studio-feature-dialog__distance-label"
                    htmlFor="part-studio-feature-dialog-boolean-target"
                  >
                    {t('partStudio.featureDialog.booleanBodiesTargetLabel')}
                  </label>
                  <select
                    id="part-studio-feature-dialog-boolean-target"
                    aria-label={t('partStudio.featureDialog.booleanBodiesTargetLabel')}
                    className="part-studio-feature-dialog__select"
                    value={booleanEffectiveTargetKey}
                    disabled={submitting}
                    onChange={(event) => handleBooleanTargetChange(event.target.value)}
                  >
                    {activeBodies.map((body, index) => (
                      <option key={body.bodyKey} value={body.bodyKey}>
                        {bodyOptionLabel(body, index)}
                      </option>
                    ))}
                  </select>
                </section>

                <div
                  role="group"
                  aria-label={t('partStudio.featureDialog.booleanBodiesToolsLabel')}
                  data-testid="part-studio-feature-dialog-boolean-tools"
                >
                  <span className="part-studio-feature-dialog__entities-label">
                    {t('partStudio.featureDialog.booleanBodiesToolsLabel')}
                  </span>
                  {activeBodies.map((body, index) => {
                    const isTarget = body.bodyKey === booleanEffectiveTargetKey;
                    const checked = booleanEffectiveToolKeys.includes(body.bodyKey);
                    return (
                      <label
                        key={body.bodyKey}
                        className="part-studio-feature-dialog__checkbox"
                        data-testid={`part-studio-feature-dialog-boolean-tool-${body.bodyKey}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          // 目标行不可再选为工具；但已是工具时（无 pruned 的冲突态）
                          // 保持可点，否则用户无法解选（错误面见下方 alert）。
                          disabled={submitting || (isTarget && !checked)}
                          onChange={() => handleToggleBooleanTool(body.bodyKey)}
                        />
                        <span>{bodyOptionLabel(body, index)}</span>
                      </label>
                    );
                  })}
                </div>
                {booleanBodiesTargetInTools ? (
                  <p
                    role="alert"
                    className="part-studio-feature-dialog__alert"
                    data-testid="part-studio-feature-dialog-boolean-target-in-tools"
                  >
                    {t('partStudio.featureDialog.booleanBodiesTargetInToolsError')}
                  </p>
                ) : booleanBodiesToolsMissing ? (
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-boolean-tools-missing-hint"
                  >
                    {t('partStudio.featureDialog.booleanBodiesToolsMissingHint')}
                  </p>
                ) : null}

                <section className="part-studio-feature-dialog__distance">
                  <label
                    className="part-studio-feature-dialog__distance-label"
                    htmlFor="part-studio-feature-dialog-boolean-operation"
                  >
                    {t('partStudio.featureDialog.booleanBodiesOperationLabel')}
                  </label>
                  <select
                    id="part-studio-feature-dialog-boolean-operation"
                    aria-label={t('partStudio.featureDialog.booleanBodiesOperationLabel')}
                    className="part-studio-feature-dialog__select"
                    value={booleanOperation}
                    disabled={submitting}
                    onChange={(event) =>
                      setBooleanOperation(event.target.value as BooleanBodiesParams['operation'])}
                  >
                    <option value="unite">
                      {t('partStudio.featureDialog.booleanBodiesOperationOptions.unite')}
                    </option>
                    <option value="subtract">
                      {t('partStudio.featureDialog.booleanBodiesOperationOptions.subtract')}
                    </option>
                    {/* v1 服务端拒收 intersect（shared 1.16 契约保留）——禁用不降级。 */}
                    <option value="intersect" disabled>
                      {t('partStudio.featureDialog.booleanBodiesOperationOptions.intersect')}
                    </option>
                  </select>
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-boolean-intersect-hint"
                  >
                    {t('partStudio.featureDialog.booleanBodiesIntersectHint')}
                  </p>
                </section>

                <label
                  className="part-studio-feature-dialog__checkbox"
                  data-testid="part-studio-feature-dialog-boolean-keep-tools"
                >
                  <input
                    type="checkbox"
                    checked={booleanKeepTools}
                    disabled={submitting}
                    onChange={(event) => setBooleanKeepTools(event.target.checked)}
                  />
                  <span>{t('partStudio.featureDialog.booleanBodiesKeepToolsLabel')}</span>
                </label>
                {/* 消费语义（false）/ I3 工具链锁（true）二选一提示——不静默。 */}
                {booleanKeepTools ? (
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-boolean-tool-lock-hint"
                  >
                    {t('partStudio.featureDialog.booleanBodiesToolLockHint')}
                  </p>
                ) : (
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-boolean-consume-hint"
                  >
                    {t('partStudio.featureDialog.booleanBodiesConsumeHint')}
                  </p>
                )}
              </React.Fragment>
            )
          )}

          {/* fillet 通道（M6-b T6）：无 body/无连接诚实降级 / 添加边拾取钮 /
              拾取中提示 / 边 chips 列表（「边 N」+×移除）/ 空边集门禁。 */}
          {filletChannel && (
            <React.Fragment>
              {!hasBodies ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-body-hint"
                >
                  {t('partStudio.featureDialog.noBodyHint')}
                </p>
              ) : !connectionKey ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-edge-unpickable"
                >
                  {t('partStudio.featureDialog.edgeUnpickable')}
                </p>
              ) : (
                <React.Fragment>
                  <button
                    type="button"
                    className="part-studio-feature-dialog__fast-pick"
                    data-testid="part-studio-feature-dialog-add-edge"
                    aria-pressed={picking}
                    disabled={submitting}
                    onClick={picking ? stopPick : startPick}
                  >
                    {picking
                      ? t('partStudio.featureDialog.stopPick')
                      : t('partStudio.featureDialog.addEdge')}
                  </button>
                  {picking && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-picking-hint"
                    >
                      {t('partStudio.featureDialog.pickingHint')}
                    </p>
                  )}
                </React.Fragment>
              )}

              {filletEdges.length > 0 && (
                <ul className="part-studio-feature-dialog__chips" data-testid="part-studio-feature-dialog-edge-chips">
                  {filletPicks.map((pick, index) => (
                    <li
                      key={`${pick.ownerElementId}:${filletEdgeRefKey(pick.ref)}`}
                      className="part-studio-feature-dialog__chip"
                    >
                      <span className="part-studio-feature-dialog__chip-label">
                        {t('partStudio.featureDialog.edgeChip', { index: index + 1 })}
                      </span>
                      <button
                        type="button"
                        aria-label={t('partStudio.featureDialog.removeEdge', { index: index + 1 })}
                        className="part-studio-feature-dialog__chip-remove"
                        disabled={submitting}
                        onClick={() => {
                          setFilletPicks((prev) => prev.filter((_, i) => i !== index));
                        }}
                      >
                        <SvgClose />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 空边集门禁（M6-b T6）：「选择要圆角的边」+ ✓禁用（filletReady
                  判据；无 body 提示在场时让位——同一禁提交因，不双报）。 */}
              {hasBodies && filletEdges.length === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-edges-hint"
                >
                  {t('partStudio.featureDialog.noEdgesHint')}
                </p>
              )}
            </React.Fragment>
          )}

          {/* B4 mirror 通道：世界平面下拉（XY/YZ/XZ——过世界原点；首版无任意面/基准面引用）。
              无上游实体 → 诚实提示 + 提交禁用（requiresUpstream；后端 op 边界同口径拒收）。
              keepOriginal 恒 true（首版保留原体并与镜像体 Unite），无额外输入。 */}
          {mirrorChannel && (
            <React.Fragment>
              {mirrorUpstreamMissing ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-mirror-needs-body-hint"
                >
                  {t('partStudio.featureDialog.mirrorNeedsBodyHint')}
                </p>
              ) : (
                <React.Fragment>
                  <select
                    aria-label={t('partStudio.featureDialog.mirrorPlaneLabel')}
                    className="part-studio-feature-dialog__select"
                    value={mirrorPlane}
                    disabled={submitting}
                    onChange={(event) => setMirrorPlane(event.target.value as MirrorParams['plane'])}
                  >
                    <option value="XY">{t('partStudio.featureDialog.mirrorPlaneOptions.XY')}</option>
                    <option value="YZ">{t('partStudio.featureDialog.mirrorPlaneOptions.YZ')}</option>
                    <option value="XZ">{t('partStudio.featureDialog.mirrorPlaneOptions.XZ')}</option>
                  </select>
                  {/* 首版范围提示（世界平面 + 保留原体；服务端保持同一语义）。 */}
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-mirror-scope-hint"
                  >
                    {t('partStudio.featureDialog.mirrorScopeHint')}
                  </p>
                </React.Fragment>
              )}
            </React.Fragment>
          )}

          {/* B5 pattern 通道：PART/body 级阵列参数——kind（linear/circular）+ count
              （含原件，≥2）+ spacing（linear，>0）/ angle（circular，(0,360] 度）+
              axis（linear 世界 X/Y/Z；circular 锁定 Z）。无上游实体 → 诚实提示 +
              提交禁用（requiresUpstream；后端 op 边界同口径拒收）。 */}
          {patternChannel && (
            <React.Fragment>
              {patternUpstreamMissing ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-pattern-needs-body-hint"
                >
                  {t('partStudio.featureDialog.patternNeedsBodyHint')}
                </p>
              ) : (
                <React.Fragment>
                  <select
                    aria-label={t('partStudio.featureDialog.patternKindLabel')}
                    className="part-studio-feature-dialog__select"
                    value={patternKind}
                    disabled={submitting}
                    onChange={(event) => {
                      const kind = event.target.value as PatternParams['kind'];
                      setPatternKind(kind);
                      // 圆周首版仅世界 Z：切换即锁定（切回线性保留 Z 亦合法）。
                      if (kind === 'circular') setPatternAxis('Z');
                    }}
                  >
                    <option value="linear">{t('partStudio.featureDialog.patternKindOptions.linear')}</option>
                    <option value="circular">{t('partStudio.featureDialog.patternKindOptions.circular')}</option>
                  </select>
                  <section className="part-studio-feature-dialog__distance">
                    <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-pattern-count">
                      {t('partStudio.featureDialog.patternCountLabel')}
                    </label>
                    <input
                      id="part-studio-feature-dialog-pattern-count"
                      type="text"
                      inputMode="numeric"
                      aria-label={t('partStudio.featureDialog.patternCountLabel')}
                      className="part-studio-feature-dialog__input"
                      value={patternCount}
                      disabled={submitting}
                      onChange={(event) => setPatternCount(event.target.value)}
                    />
                  </section>
                  {patternKind === 'linear' ? (
                    <section className="part-studio-feature-dialog__distance">
                      <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-pattern-spacing">
                        {t('partStudio.featureDialog.patternSpacingLabel')}
                      </label>
                      <input
                        id="part-studio-feature-dialog-pattern-spacing"
                        type="text"
                        inputMode="decimal"
                        aria-label={t('partStudio.featureDialog.patternSpacingLabel')}
                        className="part-studio-feature-dialog__input"
                        value={patternSpacing}
                        disabled={submitting}
                        onChange={(event) => setPatternSpacing(event.target.value)}
                      />
                    </section>
                  ) : (
                    <section className="part-studio-feature-dialog__angle">
                      <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-pattern-angle">
                        {t('partStudio.featureDialog.patternAngleLabel')}
                      </label>
                      <input
                        id="part-studio-feature-dialog-pattern-angle"
                        type="text"
                        inputMode="decimal"
                        aria-label={t('partStudio.featureDialog.patternAngleLabel')}
                        className="part-studio-feature-dialog__input"
                        value={patternAngle}
                        disabled={submitting}
                        onChange={(event) => setPatternAngle(event.target.value)}
                      />
                    </section>
                  )}
                  <select
                    aria-label={t('partStudio.featureDialog.patternAxisLabel')}
                    className="part-studio-feature-dialog__select"
                    value={patternKind === 'circular' ? 'Z' : patternAxis}
                    disabled={submitting || patternKind === 'circular'}
                    onChange={(event) => setPatternAxis(event.target.value as PatternParams['axis'])}
                  >
                    <option value="X">{t('partStudio.featureDialog.patternAxisOptions.X')}</option>
                    <option value="Y">{t('partStudio.featureDialog.patternAxisOptions.Y')}</option>
                    <option value="Z">{t('partStudio.featureDialog.patternAxisOptions.Z')}</option>
                  </select>
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-pattern-scope-hint"
                  >
                    {t('partStudio.featureDialog.patternScopeHint')}
                  </p>
                </React.Fragment>
              )}
            </React.Fragment>
          )}

          {/* B2 loft 通道：双截面草图选择器（首版两平行截面——每草图取最大面域）。
              草图不足两张 → 诚实提示 + 提交禁用；两键互不相同（同草图重复=退化放样，
              服务端 zod 同口径拒收）。无 guides/端条件/sections UI。 */}
          {loftChannel && (
            <React.Fragment>
              {sketchOptions.length < 2 ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-loft-needs-two-hint"
                >
                  {t('partStudio.featureDialog.loftNeedsTwoSketchesHint')}
                </p>
              ) : (
                <React.Fragment>
                  <select
                    aria-label={t('partStudio.featureDialog.loftSectionLabel', { index: 1 })}
                    className="part-studio-feature-dialog__select"
                    value={loftSketchA}
                    disabled={submitting}
                    onChange={(event) => setLoftSketchA(event.target.value)}
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
                  <select
                    aria-label={t('partStudio.featureDialog.loftSectionLabel', { index: 2 })}
                    className="part-studio-feature-dialog__select"
                    value={loftSketchB}
                    disabled={submitting}
                    onChange={(event) => setLoftSketchB(event.target.value)}
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
                  {loftDuplicate && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-loft-duplicate-hint"
                    >
                      {t('partStudio.featureDialog.loftDuplicateHint')}
                    </p>
                  )}
                  {loftSelectionStale && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-loft-stale-hint"
                    >
                      {t('partStudio.featureDialog.loftSelectionStaleHint')}
                    </p>
                  )}
                  {/* 首版范围提示（服务端 op 边界对不平行截面同口径拒收）。 */}
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-loft-parallel-hint"
                  >
                    {t('partStudio.featureDialog.loftParallelHint')}
                  </p>
                </React.Fragment>
              )}
            </React.Fragment>
          )}

          {/* B3 sweep 通道：轮廓草图 + 路径草图双选择器（首版单闭合轮廓沿单直线路径）。
              草图不足两张 → 诚实提示 + 提交禁用；两键互不相同（同草图=退化扫掠/同平面
              路径，服务端 zod 同口径拒收）。路径直线语义由服务端 op 边界守卫兜底，
              前端只做范围提示（不做草图几何读取——路径合法性不需要面域读面）。 */}
          {sweepChannel && (
            <React.Fragment>
              {sketchOptions.length < 2 ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-sweep-needs-two-hint"
                >
                  {t('partStudio.featureDialog.sweepNeedsTwoSketchesHint')}
                </p>
              ) : (
                <React.Fragment>
                  <select
                    aria-label={t('partStudio.featureDialog.sweepProfileLabel')}
                    className="part-studio-feature-dialog__select"
                    value={sweepProfileSketchId}
                    disabled={submitting}
                    onChange={(event) => setSweepProfileSketchId(event.target.value)}
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
                  <select
                    aria-label={t('partStudio.featureDialog.sweepPathLabel')}
                    className="part-studio-feature-dialog__select"
                    value={sweepPathSketchId}
                    disabled={submitting}
                    onChange={(event) => setSweepPathSketchId(event.target.value)}
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
                  {sweepDuplicate && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-sweep-duplicate-hint"
                    >
                      {t('partStudio.featureDialog.sweepDuplicateHint')}
                    </p>
                  )}
                  {sweepSelectionStale && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-sweep-stale-hint"
                    >
                      {t('partStudio.featureDialog.sweepSelectionStaleHint')}
                    </p>
                  )}
                  {/* 首版范围提示（服务端 op 边界对非直线/零长路径同口径拒收）。 */}
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-sweep-path-hint"
                  >
                    {t('partStudio.featureDialog.sweepPathHint')}
                  </p>
                </React.Fragment>
              )}
            </React.Fragment>
          )}

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

              {/* 面域选择（M6-a T6 最小形态 → M6-c T3 分叉）：extrude=多选 chips
                  （regions>1 才现；点选切换 aria-pressed，缺省 [0]=最大面域；
                  「全选/清空」轻量操作）——Onshape「面和草图面域」多选语义；
                  revolve=单选下拉保持（**裁决钉死：RevolveParams 未扩 regions——
                  不越契约**，载荷仍 regionIndex）。单面域两通道均自动 [0]（缺省
                  语义无需选择，无 UI）。 */}
              {regions !== undefined && regionCount > 1 && !revolveChannel && (
                <div
                  className="part-studio-feature-dialog__region-picker"
                  data-testid="part-studio-feature-dialog-region-chips"
                >
                  <ul className="part-studio-feature-dialog__chips">
                    {regions.map((region, index) => (
                      <li key={`region-${index}`}>
                        <button
                          type="button"
                          aria-pressed={selectedRegions.includes(index)}
                          className="part-studio-feature-dialog__region-chip"
                          disabled={submitting}
                          onClick={() => handleToggleRegion(index)}
                        >
                          {regionOptionLabel(index, region.area)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="part-studio-feature-dialog__region-actions">
                    <button
                      type="button"
                      className="part-studio-feature-dialog__fast-pick"
                      data-testid="part-studio-feature-dialog-region-select-all"
                      disabled={submitting}
                      onClick={handleSelectAllRegions}
                    >
                      {t('partStudio.featureDialog.regionSelectAll')}
                    </button>
                    <button
                      type="button"
                      className="part-studio-feature-dialog__fast-pick"
                      data-testid="part-studio-feature-dialog-region-clear"
                      disabled={submitting}
                      onClick={handleClearRegions}
                    >
                      {t('partStudio.featureDialog.regionClearAll')}
                    </button>
                  </div>
                </div>
              )}
              {regions !== undefined && regionCount > 1 && revolveChannel && (
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

              {/* 空选门禁（M6-c T3）：extrude 多面域下用户清空全部选中 →
                  「选择至少一个面域」提示 + ✓ 禁用（sketchReady extrude 判据）。
                  revolve 无此态（单选下拉恒有值）。 */}
              {!revolveChannel && !regionsError && regions !== undefined && regionCount > 0 && selectedRegions.length === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-region-selected-hint"
                >
                  {t('partStudio.featureDialog.noRegionSelectedHint')}
                </p>
              )}

              {/* 旋转轴下拉（M6-b T4 revolve 通道；M6-c T5 判型命名）：选项
                  「竖直线/水平线/斜线 N」（端点解算坐标判向；unknown 回退
                  「线 {id}」——id=草图内实体 id，与载荷 axis.sketchEntityId
                  同值）；缺省首条（见轴缺省 effect）。revolve 专属——extrude
                  无轴语义不渲染。 */}
              {revolveChannel && axisLines.length > 0 && (
                <select
                  aria-label={t('partStudio.featureDialog.axisLabel')}
                  className="part-studio-feature-dialog__select"
                  value={selectedAxisId ?? ''} /* ?? ''=恒受控（缺省 effect 落定前的过渡帧防 uncontrolled 警告；未选态提交由 sketchReady 拦） */
                  disabled={submitting}
                  onChange={(event) => setSelectedAxisId(Number(event.target.value))}
                >
                  {axisLines.map((line) => (
                    <option key={`axis-${line.id}`} value={line.id}>
                      {axisOptionLabel(line)}
                    </option>
                  ))}
                </select>
              )}

              {/* 无旋转轴门禁（M6-b T4）：选中草图读得实体集但无 line →
                  「草图无可用旋转轴」提示 + 提交禁用（sketchReady 轴判据）。
                  读取失败（regionsError）时让位错误 alert，不双报。 */}
              {revolveChannel && !regionsError && sketchEntities !== undefined && axisLines.length === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-axis-hint"
                >
                  {t('partStudio.featureDialog.noAxisHint')}
                </p>
              )}

              {/* 选中回显 chip：「{草图名} 的面」（revolve 多面域 + regionIndex）；×=清选择。 */}
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

          {!sketchChannel && !loftChannel && !sweepChannel && !mirrorChannel && !patternChannel
            && !booleanBodiesChannel && (
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

        {/* 折叠段：方向/起始偏移/对称/拔模（os-31）。草图通道对称段隐藏
            （M6-b T4：平铺复选顶替，见 visibleSections 注记）。 */}
        <div className="part-studio-feature-dialog__sections">
          {visibleSections.map((section) => {
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

      {/* 底部（M6-c T5 采集对齐 12-dialog-extrude-1.png）：透明度滑杆（无可见
          标签，aria 供名）+ 成品 + ?。透明度=预览透明度语义（挂账：无预览通道，
          值仅本地态+载荷回传——见文件头注）；M3 期回滚滑杆撤出（Onshape 回滚条
          在特征树底部，归树 backlog 单裁）。 */}
      <footer className="part-studio-feature-dialog__footer">
        <div className="part-studio-feature-dialog__transparency">
          <input
            type="range"
            aria-label={t('partStudio.featureDialog.transparencyLabel')}
            data-testid="part-studio-feature-dialog-transparency"
            className="part-studio-feature-dialog__transparency-slider"
            min={0}
            max={100}
            value={transparency}
            onChange={(event) => setTransparency(Number(event.target.value))}
          />
        </div>
        <div className="part-studio-feature-dialog__footer-actions">
          <button
            type="button"
            className="part-studio-feature-dialog__finish"
            disabled={submitDisabled}
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
