# Parity 状态定义（单一权威）

> 适用范围：Onshape 草图 / 约束 / 特征 / 工具的**能力状态**，以及 Onshape 示例
> Part Studio 的**测试状态**。
>
> 本文件是 `docs/parity/capability-ledger.json` 与私有
> `onshape-parity-data/manifest/tri-state-registry.json` 的判定依据。任何 PR
> 不得在别处发明第二套状态词或放宽判定口径；需要变更时先改本文件并给出证据。

## 1. 能力状态（capability status）

能力 = Onshape 一个用户可见工具、约束种类、特征族或参数分支。每行必须绑定：

- `uiRef`：入口/对话框/字段的代码或 live 证据；
- `contractRef`：shared DTO / FeatureOp / RPC 版本；
- `backendRef`：后端 evaluator / solver 实现；
- `kernelRef`：几何内核路径（无内核依赖时写 `none`）；
- `evidence`：私有证据指针（live 探针/截图/ctest/真栈报告）或公共测试路径。

| 状态 | 判定（必须全部满足） | 允许对外表述 |
|---|---|---|
| `full` | ① UI 与 live 逐项对齐（含字段顺序/默认值/禁用态/菜单/交互），无假控件；② 契约完整且版本化；③ 后端写/预览/更新/抑制/删除/多 body 完整，失败零变更；④ 求解器或内核结果可核验（逐 body volume/centroid/bbox）；⑤ 单事务 + undo/redo + push + 冷重开；⑥ 单元 + 契约 + StandaloneDb + 真栈 e2e；⑦ 至少一个受影响示例（strict 或明确 blocked 证据） | “已实现/已完成” |
| `partial` | 已有真实实现与测试，但上述 ①–⑦ 任一项缺失；必须列出 `missing[]` 与后继任务 | “部分实现（缺口：…）” |
| `gated` | 入口可见但未实现，UI 诚实禁用并给出原因；没有任何后端调用 | “未实现（入口禁用）” |
| `blocked-license` | 所需内核能力超出 ACIS Modeler+Polyhedra 授权范围，或无书面许可 | “受许可限制” |
| `blocked-kernel` | 内核 API 存在但行为不满足（精度/拓扑/失败模式），且有最小复现 | “受内核限制” |
| `blocked-design` | 契约/求解器语义未定，需 AIRR/ADR；尚未编码 | “待设计” |
| `excluded` | 用户裁决的明确范围外（如 FeatureScript 解释器、STEP/healing、钣金子系统），登记 `exclusionCode` | “明确排除（原因）”，**不得**称完成 |
| `planned` | 已排期但未开工；仅用于账本，不得出现在 UI 能力宣称中 | “计划中” |

### 1.1 判定纪律

1. **不伪造**：没有后端/内核证据的 UI 全绿一律降级为 `partial` 或 `gated`。
2. **不近似冒充**：近似几何、`record/test.fail`、放宽断言不得支撑 `full`。
3. **失败封闭**：写操作失败必须 `status=1` 且保留旧几何；静默 no-op 视为缺陷。
4. **单一事实源**：运行时 capability registry、ribbon gating、能力账本必须由同一
   输入生成或交叉校验；不一致即 P0 缺陷。
5. **变更即重评**：任何 shared 契约、后端 evaluator、求解器或内核路径变更后，
   受影响行必须重跑其证据并更新 `lastUpdated`。

## 2. 示例状态（example state）

示例 = 私有语料中的一个 Part Studio（`owner/docName/psName`）。每条 Part Studio
恰有一行，禁止静默跳过；API 有而本地无 PS 目录者也要显式登记。

| 状态 | 判定 |
|---|---|
| `strict` | 四维全绿：**geometry** 逐 body volume/centroid/bbox 在容差内且 body 数一致；**constraints** 草图实体/约束/solveStatus/DOF 与 oracle 一致且无 dropped；**ui** 特征树类型/顺序/名称/status=0 与 live 一致；**persist** push + 冷重开一致、undo/redo 可用。且无 `approximateSteps`、无 `record`、无 `test.fail`；依赖能力全部 `full`。 |
| `approx` | 几何或约束存在**有证据**的近似（容差超限但 <10%、缺少约束 oracle、选择器近似等），必须带非空 `approxReasons[]` 与证据。仅私有可用，不得进入公共 `/examples`。 |
| `blocked` | 无法达到 strict 且不能标 approx，必须带 `reasonCode`（见 §2.2）与证据指针。blocked 是显式清单，批跑必须计入“预期失败”，不得当作通过或静默过滤。 |
| `excluded` | 明确范围外（assembly/drawing-only、非几何对象等），不计入 Part 完成率。 |

### 2.1 几何容差（strict）

- 单 body 体积：相对误差 ≤ 0.5%；难例 ≤ 1% 且必须在 `approxReasons` 说明，
  但此时**不能**标 strict。
- 质心：各轴误差 ≤ 0.05 mm，或 bbox 对角线的 0.01%（取较大者）。
- 多 body：按 volume + centroid 一一配对，禁止用总体积替代。
- 草图/约束：oracle 必须来自 DXF 或 corpus 已求解实体；缺失则 `approx` 或
  `blocked-evidence`，**不得猜测**。

### 2.2 blocker 编码（固定枚举）

- `blocked-evidence:no-ps-dir` — API 有 PS 但本地无目录。
- `blocked-evidence:no-geometry` — 无逐 body 质量属性可作 oracle。
- `blocked-evidence:no-sketch-oracle` — 草图/约束无可靠 oracle。
- `blocked-evidence:session` — 采集会话/授权失效。
- `blocked-evidence:rate-limit` — 限流窗口未开（记录 retry-after，不算回归）。
- `blocked-converter:<family>` — converter 未映射的 feature/约束族。
- `blocked-capability:<capabilityId>` — 依赖能力未 `full`。
- `blocked-kernel:<probeId>` — 内核限制，附探针复现。
- `blocked-license:<capabilityId>` — 许可限制。
- `excluded-import` / `excluded-custom-feature` / `excluded-sheet-metal` /
  `excluded-assembly-only` / `excluded-non-geometry` — 显式排除轨道。

## 3. 升降级规则

### 3.1 示例

- `strict → approx/blocked`：新证据显示断言放宽、oracle 缺失、能力回退或内核
  变化；必须自动降级并留档，禁止“保留旧绿”。
- `approx/blocked → strict`：重跑完整四维证据并通过；在 registry 记
  `lastVerified` 与命令/报告指针。
- 公共目录只由 `strict && publicEligible` 生成；降级必须同步重生成
  `catalog.ts`/`registry.json`。
- 4 条仅工作树可复现的旧 strict 不得直接晋升公共目录，须重新登记证据来源。

### 3.2 能力

- `gated → full`：必须一次性满足 §1 的 ①–⑦，不允许分两次“先标 full 再补证据”。
- `full → partial`：任何依赖项回退、真栈红或契约不兼容。
- `blocked-* → full`：先关闭 blocker（许可/内核/设计），再走完整证据门。

## 4. 账本不变量（fail closed）

1. 每个 Onshape family / 每个 gated UI key / 每个 feature type / 每个 constraint
   kind / 每个 sketch entity kind 恰有一行能力状态。
2. strict 示例依赖的能力必须全部 `full`；否则 registry 校验失败。
3. 三态 registry 行数必须等于 API Part Studio 总数（当前 1,685）；0 个
   `unknown`、0 个空 `reasonCode`。
4. 公共目录条目数必须等于 `strict && publicEligible` 计数；公共文档不得出现
   `approx`、私有路径、账号或原始内核错误码。
5. 能力账本与运行时 gating 不一致、示例计数对不上、或存在未登记 blocker 时，
   `verify-*` 必须返回非零。

## 5. 术语

- **live**：Onshape 真实浏览器（私有 CDP 通道）采集的证据。
- **oracle**：用来判定 strict 的权威期望值（Onshape mass properties / DXF /
  corpus solved entities）。
- **真栈 e2e**：真实 frontend + modeling-server + iModel + native 的 Playwright
  测试，不是 jsdom。
- **四维**：geometry / constraints / ui / persist。
