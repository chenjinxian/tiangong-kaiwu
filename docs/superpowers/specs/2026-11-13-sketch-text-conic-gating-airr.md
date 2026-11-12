# AIRR — 草图「文本 / 圆锥曲线」从静默占位改为 gated 能力引导

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续完成全部缺口；P1-09 不允许“点了无反应”）

## 1. 证据

### 1.1 草图文本（live UI，自有副本 `LubanLivePostman` / Part Studio 2）
- 草图工具栏 20 钮中有「文本」（`command-id` 对应 `sketch-text-rectangle-button`；
  工具栏 DOM 清单已采集）。
- 激活「文本」后工具 `is-active`；第一次画布单击放置文本锚点（出现蓝色小点），
  再次单击后弹出浮动「文本」对话框（`ns-dialog-header`，面板 CSS
  `[246,79,404,248]`）。私有截图
  `ui-evidence/ui-direct-mouse-20261112/114-onshape-sketch-text-anchor2.png`、
  `115-onshape-sketch-text-dialog-full.png`。
- 对话框字段（DOM 实采）：
  - 字体下拉 `select.sketch-text-font-value`，默认 **Open Sans**（列出 Allerta /
    Arimo / Balthazar / Bebas Neue / Comic Neue 等字体）；
  - **B** 粗体、**I** 斜体、水平镜像、垂直镜像按钮；
  - 预览 textarea（`sketch-textarea-preview-value`，值 `Default text`）与编辑
    textarea（`sketch-textarea-value os-canvas-text-edit`，中文字库默认
    `默认文本`）；
  - 字符计数 **12/250 个字符**（上限 250）；
  - 「配置文本」展开按钮（尺寸/角度等附加配置入口）；
  - 标题栏 ✓ / ×（提交/取消）与帮助链接。
- 语义：Onshape 文本生成**字体轮廓曲线**（可拉伸成实体），不是标注/注释。

### 1.2 圆锥曲线（工具栏注册表 + 官方帮助）
- 草图工具栏无独立 Conic 钮；「样条 ▾」飞菜单含「圆锥曲线」
  （`Sketch.Conic`）。
- Onshape 圆锥曲线是介于两点/切线之间的 conic 曲线实体（rho 参数），需要独立
  的实体类型与求解器表达。

## 2. 决策（本切片）

两者此前在 `SKETCH_PLACEHOLDER_IDS` 中：按钮保留、点击**静默 no-op**。本切片
改为 **gated 能力引导**（点击弹说明真实原因，不写数据、不投假工具）：

1. `sketchText` / `sketchConic` 能力登记为 `gated`，新增中英引导文案：
   - 文本：需要字体轮廓引擎 + 新草图实体类型（shared/求解器/后端契约），
     当前版本未实现；
   - 圆锥曲线：需要 conic 实体类型与求解器/后端支持，当前草图契约只有
     线/圆/弧/样条。
2. `SKETCH_PLACEHOLDER_IDS` 清空；Ribbon 激活路由新增 `findCommand`
   （特征 ribbon + 草图 ribbon + 飞菜单子项），使草图条目的 capability
   按登记键解析（`Sketch.Conic` → `sketchConic`），不再用原始命令 id 兜底。
3. 只读总门下 gated 信息面仍可点（既有 P2.4 行为不变）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `TOOL_CAPABILITIES`/`CAPABILITY_GUIDANCE` | 既有 gated 机制 + 引导对话框 | 不新增对话框/路由 |
| Ribbon `useToolActivation` | 单一激活路由 | 仅补命令解析兜底 |
| i18n capabilities 词表 | 既有结构 | 新增两条 title/message |

## 4. 跨仓影响

无 shared/后端/schema/RPC 改动；仅 web 能力表/词表 + 单测。

## 5. 测试

- `capabilities.test.ts`：gated 集合 32→34（新增 sketchText / sketchConic），
  引导键与集合严格同步。
- `Ribbon.test.tsx` 新增：草图模式点「文本」→「草图文本（未支持）」引导；
  关闭后「样条 ▾ → 圆锥曲线」→「圆锥曲线（未支持）」引导；二者都不投
  `IModelApp.tools.run`。
- `SketchDialog.test.tsx`：capability 入册断言纳入新键。
- 全量 web 单测 **1753/1753**、tsc/lint 绿。

## 6. 风险与回滚

- 行为变化仅“静默 no-op → 引导对话框”；无数据/契约变化。
- 回滚：删除两条能力/文案并把 id 放回 `SKETCH_PLACEHOLDER_IDS` 即可。

## 7. P0 对照

- P0-03：先采 live UI/官方语义，再决定 gating；不凭记忆实现。
- P0-04：本切片不新增工具/契约，只改能力档位与引导。
- P0-10：不写任何数据；引导为纯信息面。
- P1-09：能力状态与真实原因一致，不再有点击无反馈的死按钮。
