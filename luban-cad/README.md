# 鲁班CAD（LubanCAD）

**天工开物平台的 AI 生成式 CAD 产品** —— *说出要什么，鲁班给你真形。*

> **Visibility: PUBLIC（开源）**

## 定位

借助图形建模平台（itwinjs-core 底层逻辑 + Zokei 渲染引擎）实现的**生成式 CAD**：文生 3D，且生成的是**可用于工业制造的真实 BRep**（真形），不是通用大模型的 Mesh 玩具。

## 现状与迁移

- **现核心架构**：`../itwinjs-core/open-cloud-cad/`（工具链/宿主应用，基于 iTwin.js）
- **本目录**：鲁班CAD 应用平台工程落位——前后端包（`apps/`、`packages/`）迁移目标
- 迁移节奏随 platform-docs/ROADMAP Phase 0 品牌落地项执行

## 组件关系

- 生成几何 → **真形（TrueForm）内核**（私有，终局替换 imodel-native/ACIS 实现层）
- 约束求解 → **绳墨（ShengMo）**（私有，libslvs 起步、自研替换）
- 渲染 → **Zokei**（Filament + WASM）
- 数据/事务 → imodel-native（iModel IO/ECSQL/变更追踪）

开发准则见 `./CLAUDE.md` 与 `../itwinjs-core/open-cloud-cad/CLAUDE.md`。

*创建: 2026-09-23*
