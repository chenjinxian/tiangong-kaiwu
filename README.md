# 天工开物（TiangongKaiwu）

**基于云服务的 AI+CAD 应用平台总目录** —— *天工开物，鲁班造物——真形为体，绳墨为度。*

> **Visibility: PUBLIC（开源）**
> 命名家族（2026-09-23 终版）：平台 **天工开物** / 产品 **鲁班CAD（LubanCAD）** / 几何内核 **真形（TrueForm）** / 约束求解器 **绳墨（ShengMo）**。
> 产品口吻：*说出要什么，鲁班给你真形。*

## 平台架构（现状分工）

| 组件 | 角色 |
|---|---|
| **itwinjs-core** | 核心基础框架（iTwin.js fork；自主化/差异化开发的底座） |
| **鲁班CAD** | AI 生成式 CAD 产品前端宿主 |
| **modeling-server** | 图形建模后台服务：打开模型文件、编辑建模、供渲染数据（Express + RPC/IPC + Briefcase 管理，:4001） |
| **webhook-agent** | Webhook 接收 + baseline 生成 + CloudSqlite 上传（:4002） |
| **Zokei 渲染引擎**（仓外） | 图形渲染引擎：itwinjs-core 底层逻辑 + **Filament** 渲染效果 + 编译 **WebAssembly** |
| **imodel-native**（仓外） | iModel 原生引擎：已完成 **CMake** 全编译改造，实现基于 **ACIS 的 BRepCore**，向完全自主化演进（真形的孵化床） |

**私有侧**（独立仓，自主研发，不在本仓）：

| 组件 | 角色 |
|---|---|
| **真形（TrueForm）** | **PRIVATE** 自主研发 BRep 几何内核——终局替换 ACIS 实现层 |
| **绳墨（ShengMo）** | **PRIVATE** 自主研发约束求解引擎——SolveSpace/libslvs 起步，自研求解核与真形共同开发替换 |

## 文档

- 愿景/架构/内核战略/约束选型/路线图/能力矩阵：platform-docs（天工开物文档总仓，仓外）
- 战略要点：产品 = 生成**工业制造级 BRep 真形**（非通用文生3D 的 Mesh）——借助图形建模平台实现生成式 CAD

## 商标备注

已知风险（用户知情接受）：鲁班软件 AEC（第 9 类）、昆仑万维"天工"AI；备胎 **公输CAD**。核验与注册见 platform-docs/ROADMAP 品牌落地项。

*创建: 2026-09-23*
