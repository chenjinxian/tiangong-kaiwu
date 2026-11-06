# 接口冻结矩阵（公开版）

- 日期：2026-11-04
- 性质：平台级接口治理基线；与 `docs/DEVELOPMENT-RULES.md`（待定稿）配套。
- 隐私/许可边界：**本文只列公开契约与冻结规则**。后端/原生/求解器的逐文件证据在私有仓
  `luban-backend/docs/architecture/backend-native-interface-evidence-2026-11-04.md`；
  imodel-native 相关细节不得复制回公开仓。

---

## 1. 为什么要冻结

平台是多仓 + `link:` + 私有产物 + 原生内核/求解器的组合。以下任一漂移都会让“可撤销编辑、可重建几何、可发布栈”同时失效：

- 前端 `shared` 与后端 FeatureService 的 `FeatureOp`/DTO 不同步；
- `LubanCAD` schema / `params` JSON 形态变化但没有迁移；
- 原生 addon 的 `NativeLibrary.ts` 与 C++ 接口不同步；
- solver-neutral 接口只被单一实现验证；
- Hub REST 契约被本地简化实现带偏；
- IPC channel 名称/RPC interfaceVersion 没有双端发布门。

规则：**P0 接口未冻结/未版本化，不得新增依赖它的功能。**

---

## 2. 公开接口冻结矩阵

| 接口 | Owner | 当前版本/形态 | 冻结级别 | 变更流程 | 验收证据 |
|---|---|---|---|---|---|
| `LubanFeatureRpcInterface` | 平台/后端 | **1.33.0**；`FeatureOp` 11 种；Feature 类型 15 种（+faceExtrude；cPlane/hole 沿用） | P0 | ADR + shared 版本 bump + 双端 PR + 兼容矩阵 | shared 单测、web tsc、backend 契约测试、真栈 e2e |
| `FeatureOp` / `FeatureParams` | 平台/后端 | 11 种 op、12 个参数联合 | P0 | 单源生成 schema/白名单；禁止手工双写 | shared 契约测试、`opDsl` 白名单一致性 |
| `LubanRpcInterface` | 平台 | **1.1.0**；15 方法；旧 edit-command 三方法已删除（X-01） | P0 | 变更需 bump + 双端同发布；编辑一律走 `EditTools`/FeatureOp | 调用图检查（旧三方法 0 调用）、真栈 e2e |
| `LubanIpcInterface` | 平台 | `downloadBriefcase` | P1 | 与官方 IPC 职责合并/对齐 | IPC e2e |
| `@luban-cad/shared` 总契约 | 平台 | 1.33.0；`strict:false` 待修 | P0 | 契约先行；运行时版本握手；禁止并行 REST DTO | shared tsc/单测、双端兼容测试 |
| `LubanCAD` schema / `params` | 后端 | 当前 schema 版本与 `params` JSON 形态 | P0 | ADR + 迁移 + 旧数据 fixture | schema/migration 测试、真栈旧库回归 |
| Native addon 合同 | Native/平台 | `NativeLibrary.ts` + addon ABI | P0 | C++ 接口与 `NativeLibrary.ts` 同 PR；下游回归 | ctest + addon 测试 + 下游替换回归 |
| 真形（TrueForm）公共 API | TrueForm/平台 | **0.1.0（M0，未接入）**；私有仓 `D:\Github\trueform` | P0（接入前冻结） | ADR + SemVer + `SolidKernel.h` 适配层 + 一致性套件 | trueform ctest + 下游真栈回归 |
| Solver-neutral 合同 | 后端/求解器 | `SolverTypes` 接口 | P0 | ADR + 双跑一致性语料 | 求解器 conformance + 矛盾/欠定/弧/样条 |
| Hub REST | Hub/平台 | 官方 clients + `docs/api-specs/*.json` + hub Swagger | P0 | 官方契约优先；本地实现不得私改语义 | 官方 client 契约测试、hub e2e |
| Webhook events/signature | WA/平台 | 官方 samples + `docs/WEBHOOK_CONFIG.md` | P0 | 双仓同 PR；版本化事件名/头 | validator/forwarder 测试、真栈 e2e |
| IPC channels | 平台 | `luban-ipc` / `ipc-app` | P0 | 名称冻结；双端发布门 | 真栈 IPC e2e |
| 端口/环境键 | 平台 | `docs/PORTS.md` | P1 | 先登记后使用 | verify-stack |

---

## 3. 已知公开契约风险

1. `opDsl.ts` 的 `FEATURE_TYPES` 缺 `booleanBodies`，与 `LubanFeatureType` 不一致——这是“手工双写”的直接证据。
2. `shared` `strict:false`；`interfaceVersion` 无运行时协商。
3. ~~`LubanRpcInterface` 仍带旧编辑三方法~~ **已关闭（2026-11-04，1.1.0）**：方法删除，MirrorElements 迁移到标准编辑管道；MS 产物需重建后生效。
4. `shared` 内存在与官方 REST clients 平行的 DTO；官方 clients 才是 Hub REST 语义基准。
5. 文档与代码漂移：架构文档仍称 RPC 路由无鉴权，但代码已有 `rpcGuard`；测试/发布基线数字存在多套。
6. 原生/求解器接口的冻结与验收证据在私有仓；公开仓不得出现源码级证据。
7. `LubanRpcInterface` 1.0.0 → 1.1.0 是**破坏性删除**；旧 web 客户端连接新 MS 会在 RPC 版本校验期失败，需 web/MS 同发布列车。

---

## 4. CI 执行现状（2026-11-04）

| 范围 | 已接入 | 仍是缺口 |
|---|---|---|
| Public | `CI (public)`：shared/editor/viewer/web 单测 + lint + tsc；新增 `LubanFeatureType` 穷举 DSL 测试（防 `FEATURE_TYPES` 漏同步） | 真栈 e2e 仍归发布/手工门 |
| Backend | `CI (backend)`：tsc + middleware 单测；新增 `.github/workflows/interface-freeze.yml`（SolverTypes/LubanCAD schema hash 冻结） | feature 全量、native ctest 未进托管 CI（X-09） |
| Native | 新增 `.github/workflows/interface-freeze.yml`（SolidKernel/PSBRep op surface hash 冻结） | CMake/ctest 需 ACIS/BisSchemas/Windows，尚未进 CI（X-09） |
| 发布 | `docs/RELEASE-CHECKLIST.md` + `verify-stack` | 测试基线需改为脚本生成，禁止手写数字 |

冻结 hash 清单在私有仓：`imodel-native/docs/architecture/interface-freeze.json`、`luban-backend/docs/architecture/interface-freeze.json`。改动接口必须同 PR 更新清单并 bump 版本/ADR。

## 5. 冻结验收规则

- **版本化**：P0 接口每次变更 bump 版本；`shared` 与后端声明兼容范围；web 启动/连接时做运行时校验。
- **单源生成**：`FeatureOp`、`FEATURE_TYPES`、表单 schema、opDsl 白名单由单一 schema 生成；禁止手写多份。
- **双端发布**：RPC/契约/IPC/schema 变更必须 shared → backend → web 同批次；PR 互相链接。
- **旧数据**：schema/params 变更必须带迁移与旧数据 fixture；没有迁移数据不得合并。
- **原生/求解器**：接口变更必须 ctest/addon/下游回归；真形（TrueForm）几何内核/绳墨替换必须有双后端一致性证据。
- **安全/许可**：GPL/研究代码不得进入产品路径；ACIS 授权范围外能力不得接线；SBOM/许可证清单同 PR。

---

## 6. 相关文档

- 开发规则 v1.0（2026-11-04 生效）：`docs/DEVELOPMENT-RULES.md`
- 本轮债务清理 AIRR：`docs/superpowers/specs/2026-11-04-debt-cleanup-x01-x03-airr.md`
- ADR-0002（旧编辑通道退役 + 选择权威）：`docs/adr/0002-retire-legacy-edit-channel-and-unify-selection.md`
- 架构基线：`docs/Architecture.md`
- 上游/iTwin fork 规则：`docs/UPSTREAM_SYNC.md`、`docs/ITWINJS_CORE_MODIFICATIONS.md`
- 发布门：`docs/RELEASE-CHECKLIST.md`、`docs/PORTS.md`
- 私有逐文件证据：`luban-backend/docs/architecture/backend-native-interface-evidence-2026-11-04.md`

---

*本文是公开契约层；原生/后端源码级证据留在私有仓。*
