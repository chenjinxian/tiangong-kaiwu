# 鲁班CAD 文档目录（open-cloud-cad）

本文档目录包含天工开物平台 AI 生成式 CAD 产品（鲁班CAD / open-cloud-cad）的所有技术文档和参考资料。

---

## 文档索引

### 核心文档
| 文档 | 说明 |
|------|------|
| [CLAUDE.md](../CLAUDE.md) | 项目主文档，包含架构、配置和快速开始指南 |
| [README.md](../README.md) | 项目介绍和基本使用说明 |
| [CHANGELOG.md](../CHANGELOG.md) | 版本变更记录 |
| [QUICKSTART.md](../QUICKSTART.md) | 快速开始指南 |
| platform-docs/STATUS.md | 全平台能力现状矩阵（状态权威锚点） |

### 架构与设计
| 文档 | 说明 |
|------|------|
| [Architecture.md](./Architecture.md) | 系统架构详细设计 |
| [ROADMAP.md](./ROADMAP.md) | 演进路线图（AI+CAD 分期，对齐 platform-docs/ROADMAP） |
| [SKETCH-CONSTRAINT-WORKFLOW.md](./SKETCH-CONSTRAINT-WORKFLOW.md) | 草图约束工作流程（设计稿） |
| [CONSTRAINT-SOLVER-COMPARISON.md](./CONSTRAINT-SOLVER-COMPARISON.md) | 约束求解器对比分析（选型输入；决策见 platform-docs/KERNEL-STRATEGY.md） |
| [baseline-reliability-design.md](./baseline-reliability-design.md) | Baseline 可靠性设计 |
| [IMODEL_AUTO_RECOVERY_DESIGN.md](./IMODEL_AUTO_RECOVERY_DESIGN.md) | iModel 初始化失败自动修复设计 |

### 技术参考
| 文档 | 说明 |
|------|------|
| [iTwin.js-Tools-Complete-Reference.md](./iTwin.js-Tools-Complete-Reference.md) | iTwin.js 工具完整参考 |
| [ITWINJS_CORE_MODIFICATIONS.md](./ITWINJS_CORE_MODIFICATIONS.md) | iTwin.js Core 修改记录 |
| [DEEP_ANALYSIS.md](./DEEP_ANALYSIS.md) | 技术深度分析 |
| [E2E_TEST_REPORT.md](./E2E_TEST_REPORT.md) | E2E 测试报告（历史存档，2026-04） |

### 部署与运维
| 文档 | 说明 |
|------|------|
| [Deployment-Guide.md](./Deployment-Guide.md) | 部署指南 |
| [UPSTREAM_SYNC.md](./UPSTREAM_SYNC.md) | 上游同步指南 |
| [WEBHOOK_CONFIG.md](./WEBHOOK_CONFIG.md) | Webhook 密钥配置说明 |

### 子目录
| 目录 | 说明 |
|------|------|
| [superpowers/](./superpowers/) | AI 辅助开发文档 |
| [tool-integrations/](./tool-integrations/) | 工具集成状态 |

---

## 文档维护指南

- 所有新文档应添加到本文档目录
- 文档更新时请同步更新此索引
- 临时分析文档请在文件名中注明日期
- 已删除文档：
  - `ROADMAP_ONSHAPE.md` → 合并到 `ROADMAP.md`
  - `ROADMAP-ONSHAPE-CORE.md` → 合并到 `ROADMAP.md`
  - `AVAILABLE_TOOLS_ANALYSIS.md` → 内容已集成到项目
  - `MEASUREMENT_TOOLS_INTEGRATION.md` → 内容已集成到项目

---

现行能力状态以 platform-docs/STATUS.md 为准（状态标记：✅/🟠/⚪/❌）。

*最后更新: 2026-09-22*
