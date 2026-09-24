# 鲁班CAD（LubanCAD）

**天工开物平台的 AI 生成式 CAD 产品** —— *说出要什么，鲁班给你真形。*

> **Visibility: PUBLIC（开源）**

## 定位

借助图形建模平台（itwinjs-core 底层逻辑 + Zokei 渲染引擎）实现的**生成式 CAD**：文生 3D，且生成的是**可用于工业制造的真实 BRep**（真形），不是通用大模型的 Mesh 玩具。

## 现状

- 本目录即鲁班CAD 应用平台：`apps/web` 前端宿主（React + Vite），`packages/` 与 `modules/` 为共享包与引擎模块，pnpm workspace 管理
- 图形建模后台（modeling-server）与 webhook 代理（webhook-agent）为本仓根部的独立服务项目
- 底座 itwinjs-core 以 `link:` 源码方式消费；自定义改动台账见根 `docs/ITWINJS_CORE_MODIFICATIONS.md`

## 组件关系

- 生成几何 → **真形（TrueForm）内核**（私有仓，自主研发，终局替换 imodel-native/ACIS 实现层）
- 约束求解 → **绳墨（ShengMo）**（私有仓，自主研发，libslvs 起步、自研替换）
- 渲染 → **Zokei**（Filament + WASM）
- 数据/事务 → imodel-native（iModel IO/ECSQL/变更追踪）

开发准则见 `./CLAUDE.md`。

*创建: 2026-09-23*
