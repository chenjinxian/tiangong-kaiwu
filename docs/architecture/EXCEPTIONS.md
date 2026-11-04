# 规则例外与债务登记

> 规则依据：`docs/DEVELOPMENT-RULES.md` §5。  
> **P0 例外不是永久豁免**：必须有 owner、理由、失效日期、退出计划。到期未修复必须升级为正式架构决策或停止相关功能。
> 本表只列公开可说明的例外；后端/原生源码级证据在私有仓。
> **确认日期：2026-11-04（owner 确认）**；X-01/X-02/X-03 为第一轮清理项，目标 2026-12-31。

| ID | 规则 | 例外/债务 | 当前影响 | Owner | 失效日期 | 退出计划 |
|---|---|---|---|---|---|---|
| X-01 | P0-05 | 旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 与标准编辑管道并存 | 存在第二套建模 API；新工具可能误用 | 平台/编辑器 | 2026-12-31（已确认） | **已关闭（2026-11-04）**：MirrorElements 改 `EditTools`+`basicManipulationIpc`；删除死工具 CreateHole/DraftFaces；shared 1.1.0/后端删除三方法；`hole` 翻 gated；产品代码 0 调用。发布前置：MS 产物重建（非代码债） |
| X-02 | P0-05/P1-01 | 两套草图创建工具族（editor 工具 + app `SketchCreateTool`） | 同一能力双实现，行为/数据路径分叉 | 编辑器/草图 | 2026-12-31（已确认） | **已关闭（2026-11-04）**：`EditTools.initialize({registerSketchTools:false})` + viewer 注册表删除原生草图六件；产品唯一族=`Sketch.*`；真栈 Tutorial2 草图阶段 18 实体/48 约束/9 尺寸通过 |
| X-03 | P1-01 | `store.canvas.selection` 与 `connection.selectionSet` 双选择权威 | 手工同步、undo/redo 快照恢复复杂 | 编辑器/选择 | 2026-12-31（已确认） | **已关闭（2026-11-04）**：store 唯一权威；`internal/selection-authority.ts` 唯一投影写点；删除反向桥与分散直写；真栈 `newbody` 选择/删除/undo/redo 通过 |
| X-04 | P1-02 | 自建 `useFeatureDisplaySync` 失效克隆、自定义事件总线 | 依赖 core 内部实现，升级易碎 | 前端/平台 | 2027-03-31（已确认） | 接标准 `ModelChangeMonitor`/`BriefcaseTxns` 事件 |
| X-05 | P0-10 | 草图 `insertSketch`/`updateSketch` 等整体覆写 op 非 invertible | Undo 不完整；与“可撤销硬约束”冲突 | 后端/草图 | 2026-12-31（已确认） | 补可逆 op 或正式 HITL + 审计；更新能力声明 |
| X-06 | P0-05/P1-11 | `WriteLease` 为单进程 30s 内存租约 | 多 MS 实例/重启后不一致 | 后端/平台 | 多实例立项前 | 单实例假设写入 ADR；多实例前换持久租约 |
| X-07 | P0-08/P0-09 | 原生接口目前是静态 ABI；真形（TrueForm）几何内核第二后端未落地 | 真形（TrueForm）几何内核替换需链接期 ABI 或重构；无双后端一致性证据 | Native/架构 | 2027-03-31（季度复核） | 冻结 `SolidKernel.h`、加后端选择开关、建双后端一致性套件 |
| X-08 | P0-09 | libslvs 为 GPL-3.0-only，当前仅纯云 SaaS 姿态 | on-prem/客户端交付红线 | 后端/合规 | 绳墨平替或合规方案落地前 | 禁止打包进客户侧产物；SBOM/许可门；绳墨替换 |
| X-09 | P1-07 | backend feature/native/editor-backend 未进托管 CI | 发布门依赖本地人工；回归风险 | 平台/CI | 2026-12-31（已确认） | 建 Windows runner/native ctest/feature 测试 job；至少 nightly |
| X-10 | P1-05 | DanQing 独立渲染引擎未接入 LubanCAD | 存在“第二渲染平台”误解 | 架构/DanQing | 接入 ADR 前 | 保持独立；接入需 ADR + 接口/许可/性能评审 |
| X-11 | P0-07 | `shared` `strict:false`；`interfaceVersion` 无运行时协商 | 契约漂移无法在运行时发现 | 平台/后端 | 2026-12-31（已确认） | 开启 strict；加 runtime handshake；生成类型/白名单 |
| X-12 | P0-08 | 存在多份 `imodel-native` checkout/zip（2.2.1/2.2.5 等） | 版本/provenance 不确定 | Native/发布 | 2026-12-31（已确认） | 建 canonical manifest；归档/删除非 canonical 副本 |
| X-13 | P1-09 | 发布清单/测试基线/架构文档存在过期数字 | 误导评审与发布 | 文档/平台 | 2026-12-31（已确认） | 改为脚本生成基线；PR 同步文档索引/台账 |
| X-14 | P1-06/P1-09 | `tutorial2` 真栈 e2e 在拉伸 2 面域 4 失败：`data-region-points` 给出画布外坐标（页 y=-5），点击无命中 | 基线非全绿；可能被误判为产品回归或误当绿 | Web/编辑器 | 2026-12-31（待 owner 确认） | 修 `FeatureProfilePicker` 保证命中点/取景（含草图范围）或测试前调整视图；重跑 1/1；禁止放宽断言/隐藏用例 |

---

## 例外申请格式

```
ID:
规则:
例外内容:
理由（为什么现在不能遵守）:
影响面（安全/数据/发布/许可）:
Owner:
失效日期:
退出计划（可验证）:
审批（P0 需架构 owner 签字）:
```

## 审计

- 每季度复核全部例外；到期项必须关闭或升级为 ADR。
- 新增 P0 例外必须在本表登记，否则视为违规。
- 例外不得用于绕过安全/许可/数据迁移红线。

*最后更新：2026-11-04（X-01/X-02/X-03 已关闭；X-14 Tutorial2 面域 known-red 待 owner 确认；证据见 AIRR §7.1）*
