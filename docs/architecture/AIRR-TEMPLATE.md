# AIRR — Architecture Impact & Reuse Review 模板

> 复制本文件到 `docs/superpowers/specs/` 或对应仓的 `docs/`，填写后作为功能开工门禁。
> 未通过 AIRR 不得写实现代码（见 `docs/DEVELOPMENT-RULES.md` P0-04）。

- 标题：
- 日期：
- Owner：
- 关联 Issue/需求：
- 预计影响仓：
- 是否需要 ADR：是/否（原因）

---

## 1. 目标与验收

- 用户问题/业务目标：
- 可观察验收标准：
- Onshape/live/参考证据（截图/DOM/接口/测试）：
- 非目标（明确不做）：

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | | | | 复用/扩展/fork/不适用 |
| luban-cad/packages/editor | | | | |
| luban-cad/packages/viewer | | | | |
| luban-cad/packages/shared | | | | |
| luban-backend/modeling-server | | | | |
| luban-backend/webhook-agent | | | | |
| imodel-native | | | | |
| imodelhub-services | | | | |
| 官方 clients/BisSchemas | | | | |
| DanQing/参考项目 | | | | |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策（复用/扩展/fork/新建） | 不新建的理由/新建的理由 | 许可证 |
|---|---|---|---|---|---|
| | | | | | |

**规则**：优先复用；新建必须证明现有 API/工具/参考实现不满足。参考实现是规格，不是素材。

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | | | | | |
| shared | | | | | |
| viewer | | | | | |
| editor | | | | | |
| itwinjs-core | | | | | |
| imodel-native | | | | | |
| modeling-server | | | | | |
| webhook-agent | | | | | |
| hub/DanQing | | | | | |

- 版本兼容矩阵：
- 配对 PR：
- 发布顺序：

---

## 5. 数据/事务/安全

- 数据事实源：
- schema/params 变化与迁移：
- 旧数据 fixture：
- 事务边界（BriefcaseTxns/saveChanges）：
- Undo/redo：可撤销 / HITL 例外登记
- 写租约/权限/限流：
- 密钥/日志/审计：

---

## 6. 性能与渲染

- 性能预算（hover/pick、tile、重建、IPC、draw call）：
- 大模型/规模测试：
- 渲染路径（iTwin 默认/装饰件/自定义 shader？）：
- 视觉基线：

---

## 7. 测试证据

- 单元：
- StandaloneDb 集成：
- 真栈 e2e：
- 视觉/性能：
- 失败注入/负路径：
- known-red 登记：

---

## 8. 回滚与发布

- 回滚方式：
- 数据迁移回滚：
- 产物/镜像 provenance：
- 兼容窗口：
- 发布门：

---

## 9. 评审结论

- 复用矩阵完成：是/否
- 跨仓影响明确：是/否
- P0 例外已登记：是/否
- ADR：需要/不需要
- Owner 签字：
- 结论：批准 / 修改后批准 / 拒绝
