# 鲁班CAD(LubanCAD)

**天工开物平台的 AI 生成式 CAD 产品** —— *说出要什么,鲁班给你真形。*

> **Visibility: PUBLIC(开源)**

## 定位

借助图形建模平台(itwinjs-core 底层逻辑 + 丹青渲染引擎)实现的**生成式 CAD**:文生 3D,且生成的是**可用于工业制造的真实 BRep**(真形),不是通用大模型的 Mesh 玩具。

本仓(`luban-cad/`)是产品应用侧:前端宿主 + 共享包 + 引擎模块。建模后台与 webhook 代理的源码在私有仓,本应用经其发布产物运行(见根 README 的起栈流程)。

## 组件关系

- 生成几何 → **真形(TrueForm)内核**(私有仓,自主研发,终局替换现有 BRep 实现层)
- 约束求解 → **绳墨(ShengMo)**(私有仓,自主研发)
- 渲染 → **丹青(DanQing)**(纯客户端图形引擎:大体量渲染 × 实时高质量渲染/全平台)
- 数据/事务 → iModel(iModel IO/ECSQL/变更追踪,经 itwinjs-core fork)

## 目录结构

```
luban-cad/
├── apps/web/            # 前端宿主(React 18 + Vite)
│   ├── app/             #   引导/Provider/路由表(入口 main.tsx → App.tsx)
│   ├── src/pages/       #   页面实体(Documents/ITwinDetail/Editor/Login/Settings…)
│   ├── features/        #   功能模块(editor/sketch/modeling/measurement/version-control…)
│   ├── shared/          #   服务客户端与公共件
│   └── e2e/             #   Playwright(53 用例,种子库自管每轮重置)
├── packages/
│   ├── shared/          #   @luban-cad/shared:前后端共享 RPC 接口与 DTO
│   ├── viewer-core/     #   briefcase 连接/视口/hub 访问等编辑器基建
│   ├── web-viewer/      #   WebInitializer(IModelApp 启动/RPC 注册/AccuSnap)
│   └── config/          #   共享工程配置
└── modules/             #   core/ui 模块
```

底座 itwinjs-core 以 `link:` 源码方式消费;自定义改动台账见根 `docs/ITWINJS_CORE_MODIFICATIONS.md`。

## 功能状态(节选)

| 模块 | 状态 |
|---|---|
| Auth / iTwin / iModel | ✅ JWT 认证、项目与模型管理(缩略图/复制/下载) |
| Editor | ✅ 3D 编辑器;参数化特征(树/面板/圆角/抑制/排序/试算预览);草图模式 |
| Sketch | ✅ 线/矩形/圆 + 约束/尺寸 + DOF/矛盾面板 + 先试算后提交 |
| Modeling | 🟠 布尔/圆角/倒角/抽壳工具链;阵列在修 |
| Measurement / View Clip / AccuDraw | ✅ |
| Version Control | 🟠 Changeset/命名版本可用;冲突解决 ⚪ 规划中 |
| Markup | ❌ 依赖未配置,降级占位 |

完整能力与铁律(复用优先/编辑管道/AI 注册规约)见 `./CLAUDE.md`。

## 开发

```powershell
# 前置:全栈按根 README 起好(generate-env → fetch-backend → compose up → start-ms-host)
cd luban-cad
corepack pnpm@10 install        # 勿用 pnpm 12(锁文件格式不兼容)
cd apps/web
corepack pnpm@10 dev            # 前端 :3000(代理 /auth /itwins /imodels…→:4000;MS 直连 :4001)
```

| 命令(apps/web 内) | 用途 |
|---|---|
| `pnpm test` | vitest 单测全量(约 600 用例) |
| `pnpm test:e2e` | Playwright 53 用例(需栈+vite dev;workers=1) |
| `pnpm build` / `pnpm lint` | 生产构建 / eslint |
| `node demo-flow.mjs` | 15 幕全流程演示(可见浏览器;圆角选边含 DIAG 仪器) |

改动 `itwinjs-core/` 源码后需 Rush 重建(`node common/scripts/install-run-rush.js build --to <包>`),否则应用端看不到效果;改动 `packages/shared` 后需 `pnpm build` 该包(后端 link: 消费其 dist)。

## 文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 本文 |
| [CLAUDE.md](./CLAUDE.md) | 开发准则(铁律/检查清单/AI 规约) |
| [docs/Architecture.md](../docs/Architecture.md) | 系统架构(含 tile 云缓存) |
| [docs/ITWINJS_CORE_MODIFICATIONS.md](../docs/ITWINJS_CORE_MODIFICATIONS.md) | fork 改动台账 |
| 根 [README.md](../README.md) | 平台总览与起栈 |
