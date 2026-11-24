# ADR-G0-19：供应链、SBOM、签名与许可/出口门

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md`（D0-7 导入导出、D0-12 市场/合规）、`G1-EXECUTION-PLAN.md`（J3、L1/L2/L3）、`../operations/RELEASE-MANIFEST.md`、`EXCEPTIONS.md`（X-08、X-12、X-13）、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §5.6/§13、`10-ARCHITECTURE-HARDENING-PLAN.md` §0.5、WS-L
> 影响面：依赖/制品供应链、SBOM、镜像/产物签名、漏洞与许可扫描、ACIS 分发、libslvs/GPL、STEP/IGES/Parasolid/导出、公开仓边界

> 本 ADR 冻结供应链与许可门禁，**不表示任何法务结论已取得**。本文件不包含、也不得推断法务书面意见；在法务书面结论与自动化门禁齐备前，相关外部分发保持 stop-ship。

---

## 1. 背景与约束

平台使用 ACIS（Modeler + Polyhedra）、自研求解器绳墨（ShengMo，过渡期使用 libslvs）、iTwin.js/imodel-native、官方 clients 与大量第三方依赖；产品还包括 STEP/IGES/Parasolid 等潜在导入导出能力。当前状态（截至 2026-11-24）：

1. **无 SBOM/签名/扫描证据**：没有随发布生成 SBOM；没有镜像/产物签名或 attestation；依赖/镜像/容器的漏洞与许可证扫描未形成发布门。`release-manifest` 只有 `sbomDigest` 字段与格式校验，实际 SBOM 生成/签名/核对未做（`../operations/RELEASE-MANIFEST.md`）。
2. **ACIS 边界**：只允许 Modeler + Polyhedra；3D InterOp/STEP/IGES/healing 未授权，不得接线。含 ACIS 的 MS 产物对外分发需要法务书面授权/第三方通知/出口分类；当前无法务书面结论记录。
3. **libslvs GPL**：libslvs 为 GPL-3.0-only，当前政策为“仅纯云 SaaS”；on-prem/客户端不打包。公开 MS 产物若包含 `slvs.node` 并对外分发，与政策直接冲突；必须在发布前解决（源码邀约/第三方通知/商业例外/移除），并受绳墨替换门约束。X-08 仍 open。
4. **STEP/IGES/Parasolid/导出未裁决**：许可、第三方翻译器、自研路径与出口管制/数据驻留均未形成书面结论；不得对外承诺，也不得把 blocked-license 能力只靠 UI 隐藏。
5. **公开仓边界**：公开仓禁止私有源码、密钥、native 二进制、native 构建证据/宿主绝对路径/内部证据。native provenance 只能以脱敏的版本/哈希/摘要进入受控发布记录，不得把私有构建细节写入公开仓。
6. **stop-ship 清单未关闭**：`10` §0.5 明确 ACIS 分发、`slvs.node`、blocked-license 工具可达、发布产物契约漂移、无 manifest/签名/SBOM 等属于任何外部分发/对外 SaaS 前的阻断项。
7. **供应链事件响应未建立**：没有依赖漏洞告警、制品撤回、签名密钥轮换/吊销、SBOM 差异审计与供应商评估流程的证据。

**约束**：

- P0-09：内核/求解器冻结与许可；ACIS 只用 Modeler+Polyhedra；libslvs 仅纯云 SaaS；blocked-license 能力在 native/服务入口 fail-closed。
- P0-08：fork/native 最小可追溯；单一 canonical native；native 修改有源码 + provenance + ctest + 下游回归。
- P0-07：`@luban-cad/shared` 唯一跨仓契约；公开仓不出现私有源码/密钥/native 细节/内部证据。
- 许可门必须在 native/服务入口执行，不能只靠 UI 不显示；发布门必须能阻断不合规产物。
- 任何例外必须有 owner、失效日期、退出计划；禁止以“暂时没人发现”分发。

---

## 2. 决策

### D-A SBOM（每个发布单元）

1. 每个对外/生产发布必须生成完整 SBOM（SPDX 或 CycloneDX），覆盖：直接/传递依赖、基础镜像、系统包、native 库、构建工具与容器层；不得只列应用层 package.json。
2. SBOM 由 CI 从实际构建输入/产物生成，禁止手工编辑；SBOM 文件与发布清单一起归档、签名并计算 digest；`release-manifest.json` 的 `sbomDigest` 必须对应真实文件。
3. SBOM 必须可按发布 digest/源 commit 重现；依赖升级/重建后重新生成；没有 SBOM 的产物不得对外发布。
4. SBOM 与许可证清单联动：每个组件有名称/版本/来源/许可证/哈希；未知许可证视为阻断。

### D-B 签名、provenance 与部署验证

1. 镜像、发布清单、SBOM 与关键产物必须签名（cosign/Sigstore 或等价 KMS/HSM 方案）；生成可验证的 provenance/attestation（SLSA/in-toto 或等价）。
2. 部署端必须验证签名、digest 与 provenance；未签名/签名不匹配/摘要不符的产物不得部署。
3. 签名密钥在 KMS/HSM，最小权限、轮换与吊销流程；签名必须可追溯到发布审批人；不得把私钥放入仓库/CI 明文变量/镜像。
4. `latest` 或可变 tag 不得作为生产部署源；部署只接受 release manifest 中的不可变 digest（与 ADR-G0-18 一致）。

### D-C 漏洞与许可证扫描

1. CI 必须对依赖、镜像、容器与 native 制品执行漏洞扫描与许可证扫描；结果进入发布记录。
2. **阻断策略**：critical 漏洞未修复/未批准例外即阻断发布；high 漏洞需在发布前分级处置或登记有 owner/期限的例外；中低危进入跟踪。具体 SLA 由 Security Owner 在 G3 前批准。
3. 许可证扫描使用 allowlist/denylist；未知/禁止许可证（如与交付形态冲突的 GPL 组件）必须阻断或替换；不得以“运行时才用”绕过。
4. 供应链告警：依赖漏洞/撤回/恶意包通告必须能触发重新评估/重建；保留 SBOM diff 与处置记录。

### D-D ACIS 重分发门

1. 含 ACIS 的 MS 产物**对外分发前**必须取得法务书面结论，覆盖：重分发权、第三方通知/许可文本、出口管制分类、目标市场/数据驻留；销售/支持材料不得先于结论承诺。
2. ACIS 能力只允许 Modeler + Polyhedra；3D InterOp/STEP/IGES/healing 等未授权能力不得接线；blocked op 在 native/服务入口 fail-closed，IPC/编辑器不可达。
3. 产物构建时必须记录 ACIS 组件与版本，纳入 SBOM/许可清单；没有可审计的 ACIS 清单不得对外分发。
4. 若法务结论限制分发形态（如仅 SaaS、仅特定区域），必须由部署/发布门强制，而不是依赖人工遵守。

### D-E libslvs GPL 与交付形态

1. 维持“libslvs 仅纯云 SaaS”政策；on-prem/客户端/公开产物不得包含 `slvs.node`，除非取得合规方案（源码邀约、第三方通知、商业例外或等价法务结论）并登记。
2. CI/发布门必须扫描 MS/worker/客户端产物与镜像中的 `slvs.node`/GPL 组件；发现即阻断，除非有登记且未过期的例外。
3. 绳墨（ShengMo）替换是长期退出路径；替换前必须保持许可姿态与能力账本诚实；不得把“将替换”当作当前合规依据。
4. 公开仓不得存放 libslvs 二进制、私有源码或构建证据；只记录公开可说明的结论与门禁。

### D-F STEP/IGES/Parasolid/导出与出口分类

1. STEP/IGES/Parasolid 等精确交换能力在法务书面裁决前**不实现、不接线、不承诺**；mesh/DXF 等已裁决范围内的能力按 D0-7 推进。
2. 任何导入导出能力必须有明确的许可来源与出口分类（含加密/双用途/目的地限制）；未分类不得对外分发或收集客户数据。
3. blocked-license 能力在 native/服务入口 fail-closed，并纳入能力账本/UI 诚实状态；不得用隐藏按钮代替门禁。
4. 数据驻留/跨区传输按 D0-12/ADR-G0-20 执行；导出物不得绕过租户/权限/审计边界。

### D-G 公开仓边界与证据

1. 公开仓禁止：native 二进制、私有源码、密钥/凭据、宿主绝对路径、内部构建日志、未脱敏的 provenance/native 证据、客户数据。
2. 发布记录只放脱敏摘要（版本、digest、SBOM 引用、许可结论编号）；私有证据留在受控私有仓/证据库，按需在审计中提供。
3. `docs/ITWINJS_CORE_MODIFICATIONS.md`、`docs/UPSTREAM_SYNC.md` 与 native 台账必须与发布事实一致；不得用公开仓文档泄露私有实现。

### D-H stop-ship 与批准

1. 以下任一项未关闭，**不得对外分发/对外 SaaS**：ACIS 分发无法务书面结论；公开/客户端产物含 `slvs.node` 且无合规方案；blocked-license 工具可经 IPC/编辑器调用；STEP/IGES/Parasolid 未获许可即接线；无 SBOM/签名/漏洞扫描；native 二进制/私有源码/密钥进入公开仓。
2. 外部分发/生产发布需要 Legal + Security + Release Owner 的书面批准；例外只能通过 `EXCEPTIONS.md` 登记，带 owner/失效日期/退出计划，不得自我批准。
3. 本 ADR 不替代法务意见；任何“已合规/已授权”的表述必须有可引用的书面结论与适用范围。

---

## 3. 备选方案

| 方案 | 内容 | 结论 |
|---|---|---|
| A. 先分发、后补 SBOM/许可 | 以“尽快交付”为优先，事后补材料 | **拒绝**；造成不可逆许可/出口/供应链风险 |
| B. 未决期间停止外部分发，先建门禁 | SBOM/签名/扫描/许可门 + 法务结论，逐项关闭 stop-ship | **采用** |
| C. 替换受限组件 | 绳墨替换 libslvs；TrueForm/自研或授权 STEP 翻译器；移除 ACIS 依赖路径 | **长期方向**；仍需阶段门与证据，不能作为当前豁免 |
| D. 仅私有化/气隙部署 | 不对外分发，仅受控内部使用 | **可作过渡**；不豁免 ACIS/libslvs/STEP 与出口义务，仍需法务结论与审计 |
| E. 只依赖供应商声明 | 以第三方“已合规”声明代替 SBOM/扫描 | **拒绝**；必须有可验证 SBOM、签名与自有门禁 |

---

## 4. 后果

**正向**

- 发布产物可追溯到源/依赖/许可证；供应链攻击面与合规风险可量化。
- ACIS/libslvs/STEP 的边界从口头政策变成 native/服务/发布门可执行约束。
- 公开仓与私有证据边界清晰，避免 native/密钥/客户数据泄露。
- 企业客户/审计可获得 SBOM、签名与许可证据，支撑后续 SOC 2/ISO 控制建设。

**负向/成本**

- 外部分发可能被长时间阻断，影响交付/营收节奏；法务评审需要时间与预算。
- SBOM/签名/扫描/密钥管理增加 CI/发布工程成本；误报与例外管理需要人力。
- 替换 libslvs/STEP 翻译器/ACIS 相关能力需要长期研发；短期不能作为合规捷径。
- 气隙/私有部署仍需承担许可与出口义务，不能降低合规要求。

**未决**

- ACIS 重分发/第三方通知/出口分类的法务书面结论（未取得）。
- libslvs 合规方案（源码邀约/商业例外/移除）与绳墨替换时间表。
- STEP/IGES/Parasolid 的许可路径与第三方翻译器选型。
- SBOM 格式/签名工具/密钥管理产品的最终选型。
- 目标市场/数据驻留与出口分类（D0-12）。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移阶段（从“无门禁”到“可阻断”）

| 阶段 | 内容 | 门 |
|---|---|---|
| P1 | 清点依赖/制品/native 组件与许可证；生成首份 SBOM（报告模式） | SBOM 完整性与差异可审计；不阻断发布但记录 |
| P2 | 漏洞/许可证扫描接入 CI；建立例外流程 | 结果可见；critical/high 有处置 |
| P3 | 签名/attestation/部署验证接入 staging | 未签名产物无法部署 |
| P4 | 许可门/stop-ship 门在发布前强制 | ACIS/libslvs/STEP blocked 项不可绕过 |
| P5 | 供应链事件响应/密钥轮换/撤回演练 | 撤回/重建/吊销可在目标内完成 |

### 5.2 回滚与撤回

- **制品撤回**：发现不合规/被篡改/严重漏洞时，立即从 registry/Release 撤回或标记不可部署；撤销签名/密钥；通知使用方；保留证据。
- **发布回滚**：回退到上一个已批准/已签名的 N-1 产物（与 ADR-G0-18 的 N-2 一致）；不得回退到未合规的历史产物。
- **许可结论变化**：若法务结论收紧，立即停止相关分发/功能；已分发产物按法律意见处置；不得以“已发出”为由继续。
- **SBOM/扫描门回滚**：工具故障不得绕过门禁；可临时人工审批但必须有 owner/期限/补偿控制，并登记例外。
- **禁止回滚到“无 SBOM/无签名/含 slvs.node”的分发状态**。

### 5.3 失败判据（发现即 stop-ship）

1. 对外分发/对外 SaaS 未经法务书面结论（ACIS 重分发、libslvs、STEP/IGES/Parasolid/出口分类）。
2. 发布无 SBOM，或 SBOM 不覆盖 native/基础镜像/传递依赖，或 `sbomDigest` 与真实文件不符。
3. 镜像/清单/产物未签名或签名无法验证；部署接受未签名/摘要不符产物。
4. critical 漏洞未处置即发布；未知/禁止许可证未阻断。
5. 公开/on-prem/客户端产物包含 `slvs.node` 且无登记的合规方案。
6. ACIS 3D InterOp/STEP/IGES/healing 未授权接线；blocked-license 工具可经 IPC/编辑器/native 调用。
7. STEP/IGES/Parasolid 在许可裁决前被实现、承诺或对外演示。
8. 公开仓出现 native 二进制、私有源码、密钥、宿主绝对路径或未脱敏 native 证据。
9. 用“供应商声明/即将替换/内部试用”替代书面许可结论或自动化门禁。
10. 供应链事件（恶意包/严重 CVE/签名泄露）无撤回/轮换/通知记录。

---

## 6. 证据状态（截至 2026-11-24）

| 项 | 状态 | 证据/边界 |
|---|---|---|
| SBOM 生成/归档 | **未实现** | `../operations/RELEASE-MANIFEST.md`：仅 `sbomDigest` 格式字段；真实 SBOM 未生成/未核对 |
| 镜像/产物签名/attestation | **未实现** | 无签名/attestation/部署验证证据；工具范围明确不含签名 |
| 漏洞/许可证扫描 | **未形成门禁** | 无 CI 结果/阻断证据；public CI 未实际运行 |
| ACIS 分发法务结论 | **未取得** | 本文件不包含法务意见；不得推断已授权 |
| ACIS 能力边界 | **政策明确，门禁待证** | 仅 Modeler+Polyhedra；InterOp/STEP/healing 未授权；blocked op fail-closed 需真栈证据 |
| libslvs GPL | **open（X-08）** | GPL-3.0-only；仅纯云 SaaS 姿态；公开产物 `slvs.node` 审计/移除未完成 |
| STEP/IGES/Parasolid | **未裁决** | D0-7：先许可裁决，不接线/不承诺；无书面结论 |
| 公开仓 native 边界 | **政策明确，扫描待证** | P0-07/P0-08 禁止 native 二进制/私有源码/内部证据；无自动化泄露扫描证据 |
| stop-ship 清单 | **未关闭** | `10` §0.5；ACIS/libslvs/blocked/发布门项仍在 |
| 供应链事件响应 | **未建立** | 无撤回/密钥轮换/供应商评估演练记录 |

**明确不宣称**：ACIS 已获重分发授权、libslvs 已合规、STEP/IGES/Parasolid 已获许可、SBOM/签名/扫描已上线、外部分发已安全。所有法务结论必须以可引用的书面文件为准；本 ADR 不伪造、不替代。

---

## 7. 未决与后续 ADR

1. ACIS 重分发/第三方通知/出口分类的法务书面结论与适用范围。
2. libslvs 合规方案或绳墨替换里程碑；公开产物 `slvs.node` 的审计与移除。
3. STEP/IGES/Parasolid 的许可路径、第三方翻译器/自研/TrueForm 方案与出口分类。
4. SBOM 格式（SPDX/CycloneDX）、签名工具（cosign/Sigstore/KMS）与部署验证方案。
5. 供应链事件响应、供应商风险评估与客户通知流程。
6. 目标市场/数据驻留/隐私（D0-12，与 ADR-G0-20 协同）。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-24 指令（供应链/许可 ADR 先行）。
- 当前状态：**Proposed — not ARB-signed**。在 ARB、Legal、Security、Release Owner 签字前，本 ADR 只作为约束草案，不能作为“已合规/可发布”的证据。
- 本 ADR 不包含任何法务批准；不得以本文件替代书面法律意见。

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| Legal | | | |
| Security owner | | | |
| Release owner | | | |

---

## 9. 关联文档

- `G0-DECISION-REGISTER.md`（D0-7、D0-12）
- `G1-EXECUTION-PLAN.md`（J3、L1/L2/L3）
- `../operations/RELEASE-MANIFEST.md`（SBOM/digest 字段与未完成项）
- `EXCEPTIONS.md`（X-08 libslvs、X-12 native canonical、X-13 文档基线）
- `../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §5.6、§13
- `../research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md` §0.5、WS-L、G0/G3 验收
- `ADR-G0-18-observability-release-rollback.md`（manifest/签名/发布门）
- `ADR-G0-20-tenant-compliance-audit.md`（数据驻留/合规审计）
- `../ITWINJS_CORE_MODIFICATIONS.md`、`../UPSTREAM_SYNC.md`（native/fork 台账）
- `../../CLAUDE.md`（P0-07/P0-08/P0-09）
