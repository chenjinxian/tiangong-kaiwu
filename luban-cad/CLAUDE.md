# 鲁班CAD（LubanCAD）开发准则

**天工开物平台 AI 生成式 CAD 产品。** 详细准则见 `../itwinjs-core/open-cloud-cad/CLAUDE.md`（复用优先/工具生命周期/AI 工具注册规约），跨仓战略见 `~/Documents/GitHub/platform-docs/`。

## 铁律

1. **复用优先**：工具类功能继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`…）；编辑走 `basicManipulationIpc`；事务走 `BriefcaseTxns`/`saveChanges`（可撤销硬约束）
2. **状态诚实**：能力声明带标记 ✅/🟠/⚪/❌，以 platform-docs/STATUS.md 为锚
3. **AI 工具注册规约**：Agent 复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL（预览→确认→提交）
4. **品牌**：产品名 鲁班CAD（LubanCAD）；生成物 = 真形（BRep）；约束 = 绳墨

*创建: 2026-09-23*
