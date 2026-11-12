# AIRR — 零件「使之透明…」会话透明度滑块（简化切片）

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续实现全部缺口）

## 1. 证据

- 零件行右键菜单含「使之透明…」（`ui-evidence/tree-interactions-20261112/menu-sketch-part.json`）。
- 直接 UI 操作：点击后打开工具面板，标题「使之透明」，含
  「透明度控制 / 选择透明几何图元 / 零部件控制 / 展开: 连接 / 展开: 距离」
  （`ui-evidence/ui-direct-mouse-20261112/88-onshape-transparency-dialog.png`；
  隔离开关同面板 `87-onshape-isolate-dialog.png`）。

## 2. 范围（本切片，显式简化）

1. 零件行「使之透明…」启用：打开本产品的小型对话框（标题/透明度滑块 0–100/
   恢复不透明/取消/应用）。
2. 应用后按 body 设置**会话级** FeatureAppearance 透明度（`useBodyAppearanceOverrides`
   的独立 FeatureOverrideProvider，与既有逐 body 颜色并存；不改 iModel、
   不持久化、不影响选择高亮）。
3. 「恢复不透明」清除该 body 透明度（0）；Esc/取消不改。
4. 颜色+透明度同时存在时合并为同一 appearance（rgb + transparency +
   ignoresMaterial），仅透明度时不写 rgb。

**非目标 / 简化登记**
- Onshape 的完整工具面板（透明度控制的目标选择、零部件控制、按连接/距离展开、
  隔离开关、跨 body 批量）未实现——本产品只提供单 body 滑块的简化入口；
- 不持久化（Onshape 侧同样属视图/会话状态）；
- 「隔离…」仍禁用（需目标选择/展开等完整工具面板，另行切片）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `FeatureOverrideProvider` | 既有颜色覆盖 provider | 扩展为颜色+透明度合并；与选择 EmphasizeElements 并存 |
| 零件右键菜单 | 既有槽位 | 启用「使之透明…」+ 对话框 |
| 零件行数据 | `PartNode`（id=bodyKey） | 会话 map 键即 bodyKey |
| store/宿主 | PartStudioPage 会话 state | 不新增 iModel 写入/契约 |

## 4. 测试

- 纯函数 `buildBodyAppearances`：颜色+透明度合并、仅透明度、越界夹取、
  0/负值不产生 override；provider 在同色仅改透明度时刷新。
- FeatureTree：菜单项启用 → 对话框 → 滑块 60% 应用回调 `(bodyKey, 0.6)`；
  「恢复不透明」回调 0。
- 显示层为会话 FeatureAppearance（未做像素基线）；不涉 iModel/RPC/schema。

## 5. 跨仓影响 / 回滚

无 shared/后端/RPC/schema 改动。回滚：移除菜单启用/对话框/透明度 map 与
provider 合并（颜色路径保持原行为）。

## 6. P0 对照

- P0-01/P0-03：复用 iTwin FeatureOverrideProvider 标准显示机制，无第二渲染平台。
- P0-06：只改显示覆盖，不动 params/几何事实源。
- P0-10：会话级、可随时恢复不透明；非破坏性、不写库。
