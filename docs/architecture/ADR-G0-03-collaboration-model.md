# ADR-G0-03：协同模型：单写者、异步多 Briefcase 与实时协同边界

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**（业主指令下拟制，尚未经 ARB 签字）
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md`（D0-3 协同模型）、`G0-EXECUTION-PLAN.md` §4/§6、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §6/§11、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-C/WS-I、`SESSION-ISOLATION-DESIGN.md`、`G1-WAVE2-STATUS-2026-11-23.md`
> 影响面：MS 会话/briefcase/Editor/undo、Hub 租约与 changeset、前端多用户 UI、分享/权限产品面、HA/多实例部署
> 本 ADR 只冻结协同目标与门禁，不表示多用户已可用；不含私有源码、密钥、私有路径或 native 构建证据。

---

## 1. 背景与当前事实

1. 目标架构支持三种协同路线：单写者、异步多 briefcase、实时；三者对会话、租约、undo、缓存的假设不同，不能在同一实现里含糊共存（09 §6.1/§11）。
2. D0-3 的建议默认是：**异步多 briefcase 为近期目标，单写者为当前可用基线，实时协同独立 ADR，不在 G1/G2 实现**。失败判据是“未做会话隔离就上 presence/实时 UI；把共享 briefcase + 广播当多用户”。
3. 当前基线是单写者：写租约为单进程 30s 内存租约（X-06），briefcase 缓存按 iModelId 复用，Editor 命令曾是进程级单槽；这些假设在多用户下会导致互踢、串响应、串 undo（`SESSION-ISOLATION-DESIGN.md` §1 的 F1–F14）。
4. 公开设计（2026-11-22）记录：C1 的响应按连接路由已做，但分片重组状态、处理队列、push/progress 广播仍存在跨连接残留；C2/C3 当时仍是设计，未开工（`SESSION-ISOLATION-DESIGN.md` F1/F3–F5）。
5. 按业主 2026-11-24 指令核对的当前状态：**C1–C3/C6 已有代码切片；没有任何真实双用户同文档的部署 canary；C5（外部 lease/fencing）与 C7（会话恢复）未实现**（`G1-WAVE2-STATUS-2026-11-23.md` §2 第 6 条）。代码存在不等于验收通过，本 ADR 不把切片当证据。
6. C6 已有公开隔离 canary：查询串 token 默认拒绝、有状态 HTTP RPC 默认 403、`getConfiguration` 移除宿主 cacheDir、`saveChanges/pushChanges` 增加写租约校验；隔离真栈 B5a/C6/B1.2a/B1.2b 通过（G1 状态 §1/§5）。这些是**会话/路径/撤销**证据，不是多人协作证据。
7. 唯一的双会话真栈证据是 B1.2b：A/B 两个 WS 会话，A logout 仅 A 在约 29,985 ms 后以 4401 关闭，B 保持 OPEN；Hub 瞬断 40s 时 B 保持，恢复后仍 OPEN。这证明的是**认证撤销不误伤其他会话**，不是同文档编辑隔离。
8. 当前 per-doc ACL 仍默认 off：B3.1c 读强制/B3.1d 写强制已实现但 `AUTH_B3_READ_MODE`/`AUTH_B3_WRITE_MODE` 默认 `off`，未部署；B3.1e Hub 内容路由强制默认 off；分享 UI/组权限未完成（G1 状态 §2/§12–§14；X-27）。因此即使存在会话切片，也不能对用户承诺“多用户安全协作”。
9. 当前写租约仅单 MS 实例有效（X-06）；C5 缺失时多实例会双写。C7 缺失时崩溃/重启不能从 checkpoint 水化会话（G1 状态 §2）。

---

## 2. 决策

### D-A 近期协同目标：异步多 Briefcase、单写者

1. **当前可用基线 = 单写者（single writer）**：同一文档同一时刻最多一个写者；在会话隔离证据关闭前，不承诺多用户（含只读）同文档。
2. **近期目标 = 异步多 briefcase**：每个用户拥有独立 briefcase 文件/key；编辑是显式 pull/push 的异步过程；同一文档同一时刻仍由租约保证单写者；多用户可顺序编辑，而不是同时编辑。
3. **“异步多 briefcase”必须满足**：per-user briefcase、owner 校验、undo 按 user/briefcase 过滤、pull 后缓存失效、冲突检测/冲突 UI、租约以稳定 docId 为键。缺一不得对外称为“多用户协作”。
4. **不承诺实时协同**：presence、评论、Follow、实时共同编辑不在 G1/G2 实现；实时协同是独立 ADR，需单独评估服务端权威 op 流、排序/幂等/重放、逐用户 undo、会话隔离与成本（09 §11）。
5. **不以共享 briefcase + 广播冒充多用户**：共享文件、全局 Editor 单槽、跨连接广播都不构成隔离；出现任一即视为失败，不是“过渡方案”。

### D-B 多用户声明前置门禁

6. **任何多用户/分享声明前必须同时具备**：
   - C1–C3 的连接/briefcase/Editor 隔离在真实部署的双用户 canary 通过（仅单测/切片不算）；
   - C5 外部 lease/fencing 与 C7 会话恢复完成，多实例不双写；
   - C6 的路径/所有权与有状态 RPC 收敛保持默认拒绝；
   - B2/B3 的真实用户归因与 per-doc ACL 在默认配置下强制（不是 shadow/off）；
   - D4/D5 的 checkpoint/版本路径可支撑 pull/恢复；
   - I1–I4 的冲突/undo/缓存/锁语义有真栈证据。
7. **门禁未满足时的产品口径**：只能描述为“单写者 + 受控只读验证（若已证）”，不得使用“多人协作”“实时协同”“共享编辑”“多用户生产可用”等表述；分享/邀请 UI 在 B3/B4 与租户门禁前保持关闭或标注 blocked。
8. **租户不是协作门禁的替代**：同一租户内的非成员仍需 per-doc ACL；跨租户协作在 B10 前 blocked（ADR-G0-02/X-22）。
9. **直改与 FeatureOp 共享边界**：直接编辑与参数化写入必须共享同一写租约、ACL、审计与 undo 所有者语义；不得为协作新增第二套写入口或第二套 undo（P0-05/P0-10）。

### D-C 冲突、undo 与恢复语义

10. **冲突不静默合并**：异步 pull 发现本地与远端 changeset 分叉时，必须显式检测并呈现冲突/拒绝写入；不得用“最后写入获胜”或后台 rebase 掩盖。
11. **undo 所有权**：undo/redo 只处理当前 user/briefcase 作者的操作组；A 的 undo 不得回退 B 已 pull 的编辑。操作组是唯一用户可见撤销单位（D0-10）。
12. **缓存失效**：收到 `onChangesetApplied`/pull 成功后，FeatureOutputCache/FeatureService/服务态缓存必须失效并重建；不得只看 featureId 是否存在。
13. **租约与 fencing**：租约必须带 user/session/briefcase 与过期/回收；C5 前只允许单 MS 实例，配置必须显式限制，禁止“多实例 + 内存租约”。
14. **恢复**：会话失败/重连从 checkpoint/账本水化；本地 briefcase 视为可丢弃缓存。C7 前不承诺崩溃恢复或无缝重连。

### D-D 实时协同的独立 ADR 边界

15. 实时 ADR 必须决定：服务端权威 op 流 vs 客户端 OT/CRDT（09 §11 倾向服务端权威）；操作排序/幂等/重放；逐用户 undo；presence/评论与几何事务分离；权限/租户/审计；成本与容量。
16. 实时能力不得复用共享 `BriefcaseDb` 的原生 undo，也不得把 presence/评论写入 BIS 几何事务；实时服务不得成为第二个模型事实源。

---

## 3. 备选方案与拒绝理由

| 选项 | 内容 | 拒绝理由 |
|---|---|---|
| A | 永久单写者 | 可作为当前基线，但不能支撑产品目标；会限制分享/团队使用 |
| B（本 ADR） | 异步多 briefcase 先；单写者基线；实时独立 ADR | 与当前 briefcase/changeset 模型兼容；成本可控；不提前冻结实时契约 |
| C | 直接做实时协同 | 需要独立 op 流服务、排序/幂等/逐用户 undo；会话隔离/ACL/账本未闭环；成本最高 |
| D | 共享一个 briefcase + 广播 | 不是隔离；会出现互踢、串响应、跨用户 undo；违反 P0-10 与 09 §14 的会话隔离不变量 |
| E | 每个文档一个 briefcase，无 per-session 所有权 | 后开者复用/关闭前者；owner 校验缺失；无法支持双用户 |
| F | 先上 presence/评论，再补会话隔离 | presence 泄露在线状态/文档信息；无 ACL 时是权限旁路 |
| G | 跳过 C5，多 MS 实例靠内存租约 | 双实例双写；X-06 已登记该债务；数据损坏不可逆 |
| H | 只读用户先开放，读写以后再说 | 只读也需要独立 briefcase/连接/权限；tile/progress/storage 仍可能泄露；当前无双用户 canary |

---

## 4. 后果与风险

### 正向

- 以异步多 briefcase 为近期目标，复用既有 briefcase/changeset 模型，避免先建实时 op 流服务。
- 单写者基线明确，避免在未隔离时做“假多用户”。
- undo/冲突/缓存/租约语义与 ADR-G0-04 的账本、ADR-G0-16 的归因一致。

### 负向/成本

- 没有同时编辑体验；与 Onshape 式实时协同存在产品差距。
- 需要冲突 UI、per-user briefcase 存储/清理、pull/push 体验与缓存失效，前端与后端工作量都不小。
- C5/C7 是 HA/多实例的前置；在完成前只能单实例部署，限制可用性。

### 主要风险

| 风险 | 触发 | 缓解 |
|---|---|---|
| 代码切片被当作验收 | 有 C1–C3 代码但无双用户部署 canary | 本 ADR 门禁；S0-1/S0-2 未 PASS 前不宣称多用户 |
| 多实例双写 | C5 未实现仍部署多个 MS | 单实例硬限制/启动拒绝；完成 C5 前不做 HA 写入 |
| undo 跨用户 | OpLog 不按 user/briefcase 过滤 | I2 验收；A 的 undo 不得影响 B |
| 缓存陈旧 | pull 后不失效/只查 featureId | 订阅 changeset applied，显式失效并重建 |
| 权限旁路 | ACL 默认 off、分享 UI 先行 | B3/B4 默认强制后再开分享；blocked 入口不可达 |
| 共享 briefcase 回潮 | 为省存储复用同一文件 | 明确禁止；per-session 文件/key 是验收项 |
| 实时范围蔓延 | 以“presence 小功能”先上线 | 独立 ADR；presence 不得绕过 ACL/租户 |
| 会话撤销窗口 | X-20 约 30s 周期复验 | 文档披露；实时/协作声明前收敛到目标窗口 |

---

## 5. 迁移、回滚与失败判据

### 迁移阶段（指示性，非承诺）

1. **C1 补强**：分片重组/处理队列 per-connection，push/progress 按订阅路由，消除广播。
2. **C2 shadow**：per-session briefcase 文件/key 与 owner 校验先记录不拒绝；验证双用户打开不互踢。
3. **C2 enforce**：per-session 文件/key、close/save/pull/push/undo 所有权强制；写租约键改为稳定 docId。
4. **C3 enforce**：Editor 命令按 session 分槽；OpLog author；undo/redo/discard 按作者过滤；直改走同一门禁。
5. **C5/C7**：外部 lease/fencing、session router、从 checkpoint 恢复；多实例验证双实例不双写。
6. **I1–I4**：异步多 briefcase 的冲突 UI、undo、缓存失效、锁 TTL/回收；真栈双用户验收后才开对外协作。
7. **M2 实时**：另立 ADR；不与上述阶段捆绑。

### 回滚

- 关闭多 briefcase/协作开关，回到单写者模式；briefcase 是本地缓存，可丢弃并从 checkpoint 重建；不得为回滚改写 changeset 历史。
- 回滚时对未推送编辑必须显式提示并允许用户 push 或丢弃；不得静默删除。
- 已产生的 OpLog/audit 保留；若 undo 过滤有缺陷，优先禁用多用户写入而不是回退到跨用户 undo。
- 多实例部署回滚到单实例；C5 未完成时禁止以“回滚”为名继续多实例写入。

### 失败判据

1. 在没有真实双用户同文档部署 canary 时宣称多用户/协作生产可用。
2. 在 C1–C3/C5/C6/C7 未同时具备时开启分享/邀请/presence/实时 UI。
3. 使用共享 briefcase、全局 Editor 单槽或跨连接广播作为多用户方案。
4. A 的 undo 回退 B 的编辑，或 undo 不按 user/briefcase 过滤。
5. C5 未实现却运行多个 MS 实例写入同一文档。
6. 直改绕过写租约/ACL/审计，或引入第二套 undo。
7. pull 后缓存不失效，导致旧几何/旧树继续可写。
8. 实时 op 流/OT/CRDT 在独立 ADR 前进入实现。

任一触发时：停止协作功能 intake，回到 Session Owner/安全 owner 复核，并关闭相关 UI/开关。

---

## 6. 证据状态

| 类别 | 已有 | 缺失/未证明 |
|---|---|---|
| C1 | 公开设计记录响应按连接路由已做；公开 fork 有 IPC 路由改动 | 分片重组/处理队列/push 广播三项残留是否关闭；真栈双连接负例（S0-1 未 PASS） |
| C2/C3 | 业主 2026-11-24 指令核对存在代码切片；设计给出 per-session briefcase、Editor 分槽、undo 过滤 | 真实部署双用户 canary；briefcase 所有权、undo 隔离、直改门禁的端到端证据 |
| C5/C7 | 计划与设计边界已记录 | 均未实现（G1 状态 §2）；无外部 lease/fencing、无会话恢复 |
| C6 | 有状态 HTTP RPC 默认拒绝、cacheDir 移除、写租约校验；隔离 canary PASS | 与 C2/C3 的组合未验证；多实例/HA 未验证 |
| 会话撤销 | B1.2b 双 WS 隔离 canary：A logout 只关闭 A，B 保持；Hub 瞬断 40s 保持 | 不是同文档编辑隔离；X-20 仍有约 30s 窗口 |
| 权限 | B3.1c/B3.1d/B3.1e 已实现但默认 off；隔离 canary 有 outsider deny | 默认 enforce 未部署；B4 groups/shares 未闭环；分享 UI 未受控 |
| 账本/版本 | D1/D2/D6a 等切片；ADR-G0-04 | 真实 checkpoint 生成/readback、版本打开（D4/D5）未全量；X-16/X-17 open |

**不得宣称**：实时协同已可用；多用户生产可用；共享 briefcase 已隔离；C2/C3 已完成验收；C5/C7 已实现；只读用户已安全；undo 已按用户隔离；任何“多人同时编辑”能力。

---

## 7. 关联 D0 / Spike / 例外

- **D0**：D0-3（本 ADR）、D0-4（账本/checkpoint，pull/恢复前置）、D0-9（per-document actor）、D0-10（undo 操作组）、D0-16（真实归因）。
- **Spike**：S0-1（双用户双连接；当前 Not started/待填）、S0-2（直改同门禁；当前 Not started/待填）。S0-1/S0-2 是本 ADR 的核心门禁，不得用单测替代。
- **工作包**：C1–C7、I1–I6、B2/B3/B4、D4/D5；G1 Gate 的“双用户/权限负例”项仍未勾选。
- **例外/风险**：X-06（单进程 30s 写租约）、X-19（有状态 HTTP RPC 回滚窗口）、X-20（会话撤销约 30s 窗口）、X-21（共享 key/服务身份）、X-22（tenantId 占位）、X-27（PEP 覆盖分类，不是 ACL 结论）。
- **后续 ADR**：ADR-G0-09（会话/进程/briefcase/Editor 隔离，G0 计划项）、ADR-G0-10（undo 粒度，G0 计划项）、实时协同独立 ADR（未立项）。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-24 指令。
- 当前状态：**Proposed — not ARB-signed**。在 ARB 签字前，本 ADR 只能作为协同实现与对外口径约束，不能作为“多用户协作已可用”的证据。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Product Owner | | | |
| Session Owner | | | |
| Frontend Owner | | | |
| Security Owner | | | |
| Data Owner（账本/恢复） | | | |
