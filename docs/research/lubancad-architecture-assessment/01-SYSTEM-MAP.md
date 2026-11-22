# 关联仓与运行时架构地图（2026-11-22）

> 本图用于回答“当前到底由哪些系统拼成、一次建模/协同操作经过哪些层”。
> 私有仓只描述逻辑角色与审计结论，不复制源码/路径/原始证据。

---

## 1. 关联仓职责

| 仓 | 角色 | 本次审计基线 |
|---|---|---|
| **tiangong-kaiwu**（本仓，公开） | 平台总仓：`luban-cad` 应用、vendored `itwinjs-core`、文档、编排/验收脚本 | `b92a2d8fa4`（2026-11-21） |
| **itwinjs-core**（本仓内 vendored fork） | iTwin.js 核心（后端/前端/common/geometry/editor 等）；link: 源码消费 | `0b08bc37cc`（5.14.0-dev.17，2026-09-23 上游基线） |
| **luban-cad**（本仓 workspace） | 前端宿主 + shared 契约 + viewer + 第一方 editor 基座 | 与总仓同 commit |
| **luban-backend**（私有） | `modeling-server`（:5401，FeatureService/Briefcase/RPC/IPC/tile）+ `webhook-agent`（:5402，webhook/baseline） | `231f10f`（2026-11-21） |
| **imodel-native**（私有） | iTwin 原生 + ACIS/PSBRep/SolidKernel + Node addon + tessellation | `840f8b2c6`（2026-11-19，dev/source-build） |
| **trueform**（私有） | 真形 BRep 几何内核，当前 M0 脚手架，只经 `SolidKernel.h` 接入 | `1b3c979`（2026-11-04） |
| **imodelhub-services**（本地服务） | iModel 管理 API :5400 + Postgres + Azurite + Redis/Maildev；iTwin/iModel/briefcase/changeset/lock/permission/webhook | `61e78c5`（2026-11-06） |
| **DanQing**（独立公开项目） | 纯客户端 C++/Filament 图形引擎；大规模 tile/LOD 参考实现；**未接入 LubanCAD** | `4c7daf6eda`（2026-11-04） |
| **onshape-parity-data**（私有） | 语料/live-spec/三态 registry/证据 | `d5689a7c`（2026-11-21） |
| 官方参考客户端/规范 | `viewer`、`itwins-client`、`imodels-clients`、`auth-clients`、`object-storage`、`webhooks-api-samples`、`BisSchemas` | 参考来源，不是运行时 |

**运行栈**：`apps/web`（Vite/React）→ nginx/vite 同源代理 → `modeling-server`（宿主 :5401）→ `imodel-native`（ACIS）；`imodelhub-services`（:5400）+ Azurite/Postgres/Redis 提供持久化、变更集、权限与 webhook；`webhook-agent` 负责 baseline 与事件转发。

---

## 2. 顶层数据模型

```
iTwin
 └─ iModel（= 一个“文档”的持久化容器）
     ├─ BIS 元素/关系（Part Studio scope、Sketch、FeatureDrive、BodySolid、OpLogEntry…）
     ├─ Changeset（线性历史快照）
     ├─ Named Version（对 changeset 的命名引用）
     ├─ Briefcase（某个用户/客户端的本地可写副本；携带 briefcaseId）
     └─ Lock（按 briefcase/对象粒度的并发写锁）

Part Studio scope（B-model）
 ├─ DefinitionModel 分区（特征/草图/变量）
 ├─ PhysicalModel 分区（BodySolid/几何）
 └─ 按 orderKey 组成的特征链 + OpLog（线性撤销栈）
```

- **事实源**：BIS 元素 + `params`（草图/特征参数）是模型事实源；几何流是派生/投影，不能与 params 双写。
- **Part Studio scope**：同一 iModel 可含多个 Part Studio（B 文档），特征/body/草图按 scope 分区。
- **特征图**：常规模型是**每 body 一条线性特征链**（每个 body 恰一个驱动源、特征单输出、按 orderKey 求值）；不是任意 DAG/可编辑历史。
- **文档/页签**：B 文档 = iModel，Part Studio = scope；页签身份是 `UserLabel` 前缀 + JsonProperties，`PartStudioInfo` 无 `tabType`；`listPartStudios` 只认 Part Studio 前缀，没有 `listTabs`。Assembly/Drawing 页签是 gated/未实现占位；后端仅有极小 `createAssembly/listAssemblies`（无实例/配合/BOM，且无调用者）。
- **版本**：changeset 线性推进；Named Version 只是命名元数据，**不生成 checkpoint/缩略图/事件**；只有 baseline checkpoint，冷开重放全部 changeset；**没有分支/合并模型**（fork 是新 iModel，不复制历史）。
- **协同**：iModelHub 有 briefcase/lock/changeset 机制，但应用层加了“单 iModel 单写租约 + 单共享 briefcase”的门禁；第二个同角色打开者会关闭前一会话的 `BriefcaseDb`。

---

## 3. 一次“建模操作”的调用链

```
React 工具/对话框
  └─ FeatureDialog / SketchTool（选择/参数/预览）
      └─ LubanFeatureRpcInterface.applyFeatureOp(op, sessionId, partStudioId?)
          └─ modeling-server FeatureRpcImpl
              ├─ WriteLease.assertHeld(iModelKey, sessionId)   ← 单写者门禁
              ├─ FeatureService.applyOp
              │   ├─ 参数校验（registry/zod/表达式/作用域）
              │   ├─ 预热/缓存（FeatureEngine/FeatureOutputCache）
              │   ├─ EditTxn（BIS 写）
              │   ├─ 特征求值（ACIS/PSBRep via native）
              │   ├─ OpLog 追加（可撤销 op 的审计/undo）
              │   └─ txn.end("save") → saveChanges → EDE 传播
              └─ 可选 push → iModelHub changeset
```

读路径：

```
getFeatureTree / getBodies / getSketch / getMassProperties
  → FeatureService 读面（BIS + 内存缓存）
  → 前端树/草图/零件段
```

几何显示路径：

```
native BRep / element geometry
  → iTwin tile 生成（modeling-server）
  → Azurite tile 云缓存 / 本地 .Tiles
  → 前端 TileAdmin → WebGL viewport
  → BRep 拓扑叠加/选择装饰（WorldDecoration + 屏幕空间高亮）
```

预览路径：

```
FeatureDialog（参数变化，150ms 防抖）
  → previewFeatureOp
  → 后端影子求值（不落库；fillet/hole/shell/pattern 等）
  → PreviewResult.preview（iMdl/entries）
  → TileRpc requestElementGraphics / 前端 ghost + 橙色高亮
```

---

## 4. 协同/版本路径

```
用户 A 打开 Part Studio
  → 前端 acquireWriteLease(sessionId)
  → 10s renew；其他用户取租约被拒（写 op 35s 后失败）
  → MS 复用同一 briefcase 文件；用户 B 同角色打开会 close A 的 BriefcaseDb（断线）

用户 A 提交
  → saveChanges → 20s 防抖 pushChanges（先 pullMergePush）
  → hub 创建 changeset（清空原生 undo/redo 栈）
  → 其他客户端不会实时收到“某人正在编辑/光标/选择”的感知
  → 重新打开/刷新/拉取才能看到新 changeset

版本
  → Named Version 只写元数据；无 checkpoint/缩略图/事件
  → 冷开从 baseline 重放全部 changeset；历史随 20s autosave 线性增长
  → 无 branch/merge/restore/compare UI；fork 是新 iModel、不保历史
```

**要点**：当前是“单写者 + 单 briefcase + 变更集”协作，不是 Onshape 的“多用户同时编辑 + 实时 presence + 可撤销历史”；Hub 底座支持异步多 briefcase，但应用层未接。

---

## 5. 实际内核与几何能力

| 层 | 事实 |
|---|---|
| 几何内核 | **ACIS**（Modeler + Polyhedra）经 `SolidKernel.h`（111 static API）与 PSBRep op 0–37；native 还提供拓扑 ID、tessellation、质量属性、Imprint 等；基础特征 B，高级曲面/螺纹/钣金 C |
| 内核线程/实例 | 双车道引擎池（owner + per-key）有压测；**无 BRep 实例化**（重复体深拷贝）；生产 tile facet 回落 owner 串行 |
| 内核持久化 | iModel geometry stream 存 **ACIS SAB**；per-element 回滚是内存快照、不持久化；SAB 兼容是 TrueForm 切换的隐藏门禁 |
| 真形 TrueForm | 仅 **M0** 脚手架（version/status）；无生产几何能力；未来切换需合同一致性/双后端一致性/下游真栈/性能/回滚/SAB 格式门禁 |
| 约束 | solver-neutral 2D 层 + libslvs 过渡；5 类实体、19 类约束；没有 3D 装配约束 |
| 导入导出 | 仅草图 ASCII DXF 导入；GLTF 导出为占位；没有 STEP/IGES/DWG/STL/3MF 产品通道；STL/OBJ 可从 facet 派生但未实现 |
| 许可边界 | ACIS 仅 Modeler+Polyhedra；InterOp/healing/STEP/ThickenSheet 等未授权能力不得接线；**Thicken 仍经 op16/`createBRepGeometry` 暴露给 JS（fail-open）** |
| 发布门禁 | `check-interface-freeze.mjs` 当前失败（opCount 38≠37、哈希不匹配）；对外 MS 产物 provenance 早于 native HEAD，op37 等修复不在产物 |

> 详见 `05-RENDERING-AND-ADJACENT-DOMAINS.md` 与公共 `docs/parity/KERNEL-BOUNDARIES.md`。

---

## 6. 前端/编辑器架构

| 层 | 现状 |
|---|---|
| 应用壳 | React 18 + Vite；路由只有 documents/document-details/part-studio/examples/settings；无 assembly/drawing 路由 |
| 编辑器 | Part Studio 五区布局（ribbon/特征树/画布/参数面板/状态栏），Onshape 式对话框/树/右键/快捷键/ViewCube |
| 工具 | iTwin 标准工具基类 + 第一方 editor；草图 `Sketch.*` 唯一族；参数化特征走 FeatureOp；直接编辑走 EditTools/IPC |
| 选择 | `store.canvas.selection` 单一权威 + `OnshapeSelectTool` + 子实体/透明/框选规则；但 `CanvasSelection` 只有 ownerBodyKey+topologyId，无 occurrence path |
| 特征 UI | `FeatureDialog.tsx` 约 6,761 行、新增字段跨约 9 个注册点；后端 `getFeatureFormModel` 未被消费；表单/契约漂移风险 |
| 渲染 | iTwin `ScreenViewport` + 默认灯光/材质 + BRep 拓扑叠加 + FeaturePreviewOverlay |
| 状态 | 服务端态在 react-query；连接/工具会话态在 hooks；UI store 用 zustand 模块单例（多文档/多视口需重构） |
| 测试 | 174 个 web 单测文件、238 个 e2e spec、18 个 viewer 单测文件；真栈/冷重开/视觉基线 |

---

## 7. 后端/持久化/部署

| 层 | 现状 |
|---|---|
| modeling-server | 单 Express 进程；HTTP + WebSocket IPC 同端口；LocalhostIpcHost；Bentley RPC；tile 生成/缓存；FeatureService 模块级缓存 |
| 并发 | 单 iModel 单写租约；每 dbKey 求值锁；跨 iModel 可并行但同进程资源竞争 |
| 持久化 | iModel/BIS + changeset；只有 baseline checkpoint，无 changeset checkpoint 生成；Postgres/Azurite/Redis（hub）；本地 briefcase 缓存 |
| 认证 | 前端 JWT；WS Upgrade 验签；hub RBAC/access control；**审计发现 RPC/IPC 缺逐 iModel ACL、WS token 缓存后不再验、后端服务账号直通 hub；IPC 对所有连接广播、共享 briefcase、直改绕过租约/OpLog**（需修复/复核） |
| 限流 | HTTP RPC 100 req/15min/IP；**Web RPC 走 `/ipc` WS，不经过 HTTP 限流/CSRF/rpcGuard**；WS 只做升级 JWT 校验 |
| 部署 | docker compose（Postgres/Azurite/Redis/Maildev/hub/webhook-agent/nginx）+ 宿主 MS + web 镜像；verify-stack 全栈验收 |
| 发布 | 最新发布 tag `backend-20261110`（shared 1.64）vs 源码 shared 1.85；20+ 契约版本只在源码模式可用；interface-freeze/opDsl 漂移；native provenance 为 store fallback、早于 native HEAD |
| 规模证据 | Part Studio 级 perf（10 个 PS/127 body）与真栈 e2e；没有多租户/大团队/超大装配吞吐证明；同步内核在主线程；20s autosave 约 720 changeset/日/文档，冷开线性劣化；无 active lock TTL/GC/HA |

---

## 8. 文档与代码的不一致（需要治理）

1. 公开 `docs/Architecture.md` 仍描述旧 `LubanRpcInterface` 编辑通道与 TrueForm 为平台内核；实际编辑通道已删除、几何内核是 ACIS、TrueForm M0。该文档需按代码重修，否则会误导新成员/AI。
2. 公开文档中“全量 Onshape”叙事与 2026-11-19 计划的 Part Studio 范围不一致；需要在产品文档与能力账本中统一口径。
3. 代码中仍有若干 gated 入口/静态分支 pill（如 top bar 的 `main`）呈现为“已有功能”，需与能力账本交叉校验，避免假控件。
4. 研究文档/基准测试中的时间点与当前基线不同（如旧测试计数、旧 release 说明），引用时必须标注快照日期。

---

## 9. 结论

- 这是**一个真实可运行的 Part Studio CAD 栈**：前端编辑器、特征契约、ACIS 内核、iModel 持久化、changeset/权限、tile 渲染、真栈测试都在。
- 还**不是全产品 Onshape 栈**：协同模型（多用户）、装配、工程图、PDM/发布/PLM、导入导出、Render Studio、企业 SaaS 都缺独立子系统或方向性改造。
- 因此“先做主要功能”的正确姿势是：**锁定 Part Studio + 基础 PDM 为第一产品面；协同/装配/工程图/导入导出按 ADR 逐个立项，而不是在同一波里全面推进。**
