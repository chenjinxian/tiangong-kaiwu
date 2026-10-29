# 天工开物平台文档目录（docs/）

本文档目录位于 tiangong-kaiwu 仓根部，包含鲁班CAD 应用与平台工程的技术文档和参考资料。

---

## 文档索引

### 核心文档
| 文档 | 说明 |
|------|------|
| [CLAUDE.md](../CLAUDE.md) | 平台总仓主文档：仓库布局、构建/测试命令、上游同步规约 |
| [README.md](../README.md) | 平台介绍与架构分工 |
| [luban-cad/CLAUDE.md](../luban-cad/CLAUDE.md) | 鲁班CAD 开发准则（复用优先/工具生命周期/AI 工具注册规约） |
| platform-docs/STATUS.md | 全平台能力现状矩阵（仓外文档总仓，状态权威锚点） |

### 架构与设计
| 文档 | 说明 |
|------|------|
| [Architecture.md](./Architecture.md) | 系统架构详细设计 |
| [ROADMAP.md](./ROADMAP.md) | 路线图索引（指向全程序路线图与 platform-docs/ROADMAP.md） |
| [SKETCH-CONSTRAINT-WORKFLOW.md](./SKETCH-CONSTRAINT-WORKFLOW.md) | 草图约束工作流程（设计稿） |
| [CONSTRAINT-SOLVER-COMPARISON.md](./CONSTRAINT-SOLVER-COMPARISON.md) | 约束求解器对比分析（选型输入；决策见 platform-docs/KERNEL-STRATEGY.md） |
| [baseline-reliability-design.md](./baseline-reliability-design.md) | Baseline 可靠性设计 |
| [IMODEL_AUTO_RECOVERY_DESIGN.md](./IMODEL_AUTO_RECOVERY_DESIGN.md) | iModel 初始化失败自动修复设计 |

### 技术参考
| 文档 | 说明 |
|------|------|
| [iTwin.js-Tools-Complete-Reference.md](./iTwin.js-Tools-Complete-Reference.md) | iTwin.js 工具完整参考 |
| [ITWINJS_CORE_MODIFICATIONS.md](./ITWINJS_CORE_MODIFICATIONS.md) | iTwin.js Core 修改记录 |
| [web-realstack-probes.md](./web-realstack-probes.md) | 前端真实栈探针标准动作（发布前必跑） |
| [native-typings-drift-2026-10-11.md](./native-typings-drift-2026-10-11.md) | 原生库 typings 漂移记录（历史记录） |

### 部署与运维
| 文档 | 说明 |
|------|------|
| [Deployment-Guide.md](./Deployment-Guide.md) | 部署指南 |
| [PORTS.md](./PORTS.md) | 宿主端口登记（单一事实源） |
| [UPSTREAM_SYNC.md](./UPSTREAM_SYNC.md) | 上游同步指南 |
| [WEBHOOK_CONFIG.md](./WEBHOOK_CONFIG.md) | Webhook 密钥配置说明 |

### 发布与迁移
| 文档 | 说明 |
|------|------|
| [RELEASE-backend-20261028c.md](./RELEASE-backend-20261028c.md) | 最新后端发布说明 |
| [MIGRATION-2026-10-29.md](./MIGRATION-2026-10-29.md) | 2026-10-29 七仓整理迁移记录 |
| [HISTORY.md](./HISTORY.md) | 已删除文档历史索引 |

### 子目录
| 目录 | 说明 |
|------|------|
| [superpowers/specs/](./superpowers/specs/) | 保留的设计记录（架构裁决/全程序路线图/parity 设计/清理设计） |
| [superpowers/plans/](./superpowers/plans/) | 保留的执行计划（item4 组合/hub backlog/M-A5.2 计划/本轮清理计划） |
| [tool-integrations/](./tool-integrations/) | 工具集成方案与状态 |
| [api-specs/](./api-specs/) | 官方 iTwin Platform REST 规格（契约对照基准） |

---

## 文档维护指南

- 所有新文档应添加到本文档目录
- 文档更新时请同步更新此索引
- 临时分析文档请在文件名中注明日期
- 已删除文档：见 [HISTORY.md](./HISTORY.md)

---

现行能力状态以 platform-docs/STATUS.md 为准（状态标记：✅/🟠/⚪/❌）。

*最后更新: 2026-10-29（文档收敛；删除已完成历史计划与旧审计报告）*
