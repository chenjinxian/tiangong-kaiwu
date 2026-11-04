# 规范来源表（Canonical Sources）

> 规则依据：`docs/DEVELOPMENT-RULES.md` P0-02/P0-03。  
> 任何“新实现”必须先在本表找到对应能力；若找不到，需 AIRR 记录“为什么规范来源不覆盖”。  
> 私有 native/后端源码级证据不复制到公开仓；本表只列公开可引用的规范入口。

| 能力 | 规范来源 | 允许的用法 | 禁止 |
|---|---|---|---|
| iModel 数据/事务/BIS | `itwinjs-core`（BIS/Schema/TxnManager）、`BisSchemas` | link: 源码、Schema 发布包、标准 API | 自建数据库/文件存储、手改生成产物、复制 schema 工作区 |
| 前端视图/工具/选择/渲染 | `itwinjs-core/core-frontend` + `luban-cad/packages/{viewer,editor}` | 继承标准工具、标准视图/装饰件、标准事件 | 自建渲染平台、第二套工具生命周期、克隆核心失效流程 |
| 编辑命令/IPC | `@itwin/editor-*`（`luban-cad/packages/editor`）、`basicManipulationIpc`、`solidModelingIpc` | 标准命令、标准事务 | 旧 `startEditCommand/callEditMethod` 新调用、第二套建模 API |
| 特征 op/RPC | `@luban-cad/shared` `LubanFeatureRpcInterface` + `luban-backend` FeatureService | 版本化契约、FeatureOp 管道 | app 内私货 DTO、并行 REST DTO、绕过 FeatureService 写模型 |
| iTwins/项目 | `@itwin/itwins-client`；`docs/api-specs/itwins.json` | 官方 client + 官方 DTO | 自造 REST/hal/DTO |
| iModels/变更集/锁/检查点 | `@itwin/imodels-client-*`、`@itwin/imodels-access-frontend/-backend`；`docs/api-specs/imodels-v2.json` | 官方 client/adapters | 自造 changeset/lock/checkpoint 语义 |
| 权限/RBAC | `@itwin/access-control-client`；`docs/api-specs/access-control-v2.json` | 官方 client/角色词表 | 自造权限字符串 |
| 认证 | `@itwin/auth-clients`（Bentley IMS）；`AuthorizationClient` 适配本地 hub | 官方 OAuth/适配器 | 自写 OAuth 流程、token 私货格式 |
| 对象存储/预签名 | `@itwin/object-storage-*` | 官方 provider/接口 | 自造 storage 抽象、私改容器布局 |
| Webhooks | `webhooks-api-samples`、`docs/api-specs/webhooks-v2.json`、`docs/WEBHOOK_CONFIG.md` | 官方事件名/签名头/HMAC | 自造事件名、跳过验签 |
| Hub 本地实现 | `imodelhub-services`（Swagger/官方 API specs） | 以 GHCR 镜像消费；官方契约 | fork 源码、宿主 `dist` 遮蔽镜像 |
| 草图/约束求解接口 | `luban-backend` `SolverTypes`（solver-neutral）；参考 SolveSpace 行为/基准 | 只经中立接口；过渡实现隔离 | 业务层直接 import libslvs、复制 GPL 代码进产品 |
| 原生 BRep 兼容层/tile | 私有 `imodel-native` 源码与公开的 `SolidKernel.h` 契约（证据在私有仓） | 源码构建、官方 ABI、下游回归 | 用 registry 二进制替换、手改 `lib/`、未登记 patch |
| 真形（TrueForm）几何内核 / 绳墨 | `D:\Github\trueform` 私有仓 + `SolidKernel.h` / solver-neutral 契约 | **真形（TrueForm）几何内核是唯一几何内核来源**；经冻结接口接入 | 另起平台、绑架主线、未过一致性测试即切换 |
| 参考/实验项目 | FreeCAD、SolveSpace、OpenCADStudio、modeling-app、usd-brep、filament | 只读行为/算法参考；许可证审查 | 复制/链接/分发研究或 GPL 代码、把实验仓并入产品路径 |
| UI/UX 对齐 | Onshape live 证据（截图/DOM/交互）、iTwin viewer 参考 | 证据优先、像素/行为基线 | 凭空设计交互、伪造验收截图 |
| 大体量渲染 | `DanQing`（独立项目，未接入） | 参考 tile/LOD 架构；未来经 ADR 接入 | 把引擎 fork 进 web、作为第二数据平台 |
| 参考/实验项目 | FreeCAD、SolveSpace、OpenCADStudio、modeling-app、usd-brep、filament | 只读行为/算法参考；许可证审查 | 复制/链接/分发研究或 GPL 代码、把实验仓并入产品路径 |

---

## 使用规则

1. **先查表，再写码**：AIRR 必须引用本表中的行；新增能力需补充本表。
2. **官方契约优先**：Hub/REST/存储/认证/Webhook 一律以官方 clients/specs 为准。
3. **参考实现是规格**：移植需标注真实来源；不得用参考代码“装点”自创实现。
4. **许可证先于技术**：GPL/研究代码不进产品路径；ACIS 仅授权范围；SBOM/清单同 PR。
5. **实验隔离**：DanQing、FreeCAD/SolveSpace 及任何未获合法授权的代码或资料未过 ADR 不得进入可发布路径。

*最后更新：2026-11-04*
