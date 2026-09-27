# CAD 特征系统 · 决策记录（D1-D8）

- 日期：2026-09-27（首版框架）/ 2026-09-27（D2/D3/D8 定案，同日第二场会话）
- 状态：活文档——架构决策的唯一权威登记处。新裁决追加，不删改历史（翻案需显式记录理由）。
- 关联：设计细节见 `2026-09-27-feature-system-imodel-architecture-design.md`；证据见 `2026-09-27-cad-feature-system-evidence-base.md`；框架原始陈述见 `2026-09-27-cad-foundation-kickoff-prompt.md`（已完成使命）。

## 决策总表

| 编号 | 主题 | 状态 | 裁决摘要 |
|---|---|---|---|
| D1 | 特征引擎位置 | 工作假设（已定方向） | modeling-server（TS 层）；native 收敛为「原语提供者」（TopologyID 暴露/validity check/rollback mark）；MS 与 native 同进程无 IPC 开销 |
| D2 | 特征树形态 | **已定案 2026-09-27** | **对象图为权威**：特征=ECSchema 元素+EDE 图持久于 iModel；脚本投影后置为只读产物 |
| D3 | 再生语义 | **已定案 2026-09-27** | 第一设计律（可全量重建，正确性永不依赖增量）+ 增量三层（EDE 子图/内核 rollback mark/输出缓存）+ FreeCAD 式失败级联 |
| D4 | 拓扑引用消费 | 已定方向 | TopologyID 路线（nodeId≈特征身份）；重算重打 nodeId=k 使引用自愈；歧义策略（FacesFromId 返回集合）是特征类型属性 |
| D5 | 草图/约束求解 | 已收敛 | SolveSpace/libslvs 过渡（纯云 SaaS 使 GPLv3 不触发；on-prem 即污染红线）；接口 solver-neutral；FE WASM 交互/MS 权威求解；绳墨为 backend #2 平替 |
| D6 | 零件范围 | 已定 | v1 单零件（单 PartStudio/iModel）；多实体/装配后置 |
| D7 | 破坏式编辑 | 已定 | 标记降级：直改几何 → BodySolid 打标 overridden、暂停自动再生；显式「重新参数化」=丢弃手工修改+全量重建 |
| D8 | 协作范围 | **已定案 2026-09-27** | v1 单写者会话租约；多人共编架构论证可行（op 串行化即足够，无需行级合并）但不实现 |

## 补充裁决（随总架构定案而落定）

| 主题 | 状态 | 裁决 |
|---|---|---|
| TopologyID 协议暴露形态 | **已定案 2026-09-27** | **内嵌式**：创建类 op 沿用门面既有 nodeId 参数；修改类 op 走 Emboss 保标模式（FindNodeIdRange→改→AddNodeIdAttributes）；新增查询 op `FacesFromId(nodeId, entityId)→面集合`。不做独立打标 op |
| Undo 语义 | **已定案 2026-09-27** | op 即 push（changeset 粒度=op 粒度）；undo/redo 统一走 op 日志逆向/正放，不依赖 txn 栈（push 后栈清空） |
| 可行性总裁决 | **已定案 2026-09-27** | **iModel 存储可支撑 Onshape 式参数化特征建模**；需补 X1-X4（见设计文档 §0） |

## 不可轻易翻案的裁决（用户明示）

- STEP 交换基于真形自研，OCCT 侧车路线被否（「不靠谱」）。
- 平台交付形态 = 纯云 SaaS（SolveSpace/GPLv3 红线的前提）。
- AI 建模层后置；agent 环路参考 Claude Code 模式但全部后置。

## 各裁决理由速查

- **D2 为何否「程序为权威」**：文本 blob 的 changeset diff 无参数级语义；EDE 看不见脚本内部，依赖图须另建——同时弃掉 iModel 两张最强的牌。Onshape 的 definition 本是结构化数据；kittyCAD 选文本因其产品定位。
- **D8 为何多人不需要合并语义**：MS 是唯一写者，多用户 op 在 MS 串行化后才落库，永远不存在两个写者；changeset 行级冲突无从发生。
- **D3 增量为何只是性能层**：任何一层失效都降级到全量重建；正确性证明只依赖全量路径，使增量层可以激进优化而不危及正确性。
