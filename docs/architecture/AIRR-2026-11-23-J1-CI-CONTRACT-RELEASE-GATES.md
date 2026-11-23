# AIRR — G1 J1.2/J1.3a/J3.1g/J1.5：公开仓 CI、契约冻结与发布清单硬化

- 标题：公开仓 CI 契约门、web 生产 build / BFF 测试、release manifest 字节校验、e2e 基线生成
- 日期：2026-11-23
- Owner：平台/发布工程（public repo）
- 关联需求：`G1-EXECUTION-PLAN.md` J1.2/J1.3/J1.5/J3.1；`INTERFACE-FREEZE-MATRIX.md`；`docs/operations/RELEASE-MANIFEST.md`
- 预计影响仓：`tiangong-kaiwu`（public：scripts、`.github/workflows`、docs/operations、docs/architecture）。**不改** `luban-backend` / `imodelhub-services` / `imodel-native` / trueform / 绳墨。
- 是否需要 ADR：**否**。本切片只增加只读 CI/发布校验与文档，不新增运行时契约、schema、RPC、native 接口、数据迁移或渲染/求解器路径。契约冻结规则本身已由 `INTERFACE-FREEZE-MATRIX.md` P0 约定；本切片只是把它自动化。
- 状态：**实现已入 public 仓（本地脚本/测试）；公开 CI 尚未在本分支实际运行；无发布证据。不构成 G1 Gate 通过，也不代表可发布。**

---

## 1. 目标与验收

### 目标

1. **J1.2 契约门**：在 public CI 中冻结 `@luban-cad/shared` 的跨仓 Feature RPC 契约：
   - `LubanFeatureRpcInterface.interfaceVersion`；
   - 该接口源文件的确定性公开类型/源码表面 hash（同时冻结 `LubanRpcInterface`，见 §4）。
   版本或表面变化而未同 PR 更新冻结清单时 CI 失败。
2. **J1.3a CI 基线补强**：在 public CI 中增加 `@luban-cad/web` 生产 build（`tsc --noEmit && vite build`）与
   `services/bff` 的 typecheck + 单测。**不**新增需要 self-hosted runner 的 job，**不**跑真栈 e2e。
3. **J1.5 e2e 基线**：提供 `scripts/e2e-baseline.mjs`，把 Playwright JSON report 转成确定性基线摘要
   （passed/failed/skipped/flaky/test 列表），供发布候选记录。遵循 Playwright outcome：
   已满足的 `test.fail()` known-red 记为 passed 但在 `totals.expectedFailures` 单独计数并
   通过 `expectedStatus` 可见；unexpected pass 仍记 failed。不手工编辑数字。
4. **J3.1g manifest 硬化**：
   - 支持声明 release artifacts（`artifacts[]`）并从实际文件字节计算 SHA-256；
   - 新增 `verify-files`：对 `nativeProvenance` 与 `artifacts[]` 的实际文件字节做哈希核对；
   - `verify` / `verify-files` 支持 `--require-native-provenance`（发布策略门）；
   - 不伪造真实 manifest、digest、镜像 label 或发布证据。
5. **文档诚实**：`docs/RELEASE-CHECKLIST.md` 与 `docs/operations/RELEASE-MANIFEST.md` 明确区分
   “已自动化 / 仍需人工或外部环境”的步骤；不勾选需要真实发布/CI 运行的 G1 Gate 项。

### 可观察验收

- `node scripts/check-contract-freeze.mjs`：当前源码与 `docs/architecture/contract-freeze.json` 一致时退出
  `0`；合成版本 bump、类型变化、清单哈希篡改时退出 `1`；清单/源码缺失或不可读时退出 `2`。
- `node --test scripts/check-contract-freeze.test.mjs`：包含合成版本 bump、类型变化、仅注释/格式变化不误报、
  清单篡改、缺文件、坏 JSON 等用例。
- public CI `unit` job 在 `corepack pnpm@10 install` 后运行契约门；`@luban-cad/web build` 成功；
  新增 `bff` job 的 typecheck + 单测全绿（本次本地复跑 22/22；计数以实际运行为准）。
- `node scripts/release-manifest.mjs verify-files --file <manifest> --root <dir> --require-native-provenance`：
  文件字节与声明 digest 一致时 `0`；文件缺失、字节变化、digest 声明错误、缺 nativeProvenance 时 `1`；
  用法错误时 `2`。
- `node scripts/e2e-baseline.mjs --input <playwright-json>`：相同输入逐字节相同输出；不含时间、错误正文、
  截图/附件或 token；`--fail-on-unexpected` 在有 failed/flaky 时退出 `1`。
- 所有新增检查无 npm registry/网络依赖（TypeScript 解析器来自 workspace 已安装依赖）。

### 非目标（明确不做）

- **J1.1 backend interface-freeze**：`SolverTypes.ts`/`LubanCadSchema.ts` 在私有仓，不在本切片。
- **J1.3 全量**：backend feature 全量测试、`editor-backend` 全量、native ctest 需 self-hosted Windows
  runner（X-09），不在本切片；不新增自托管 job。
- **J1.4 / X-09**：native ctest/CMake/ACIS 工具链。
- **J1.5 执行**：不跑全量 Playwright（栈按任务要求保持关闭）；只提供 report→baseline 工具。
- **J3.2 镜像 label 腿**：OCI label 与 registry digest 对账需要 docker/registry 与仓外文件，不伪造。
- **真实发布**：不生成真实 release manifest、不填假 digest、不推镜像、不创建 tag/Release、不跑 `verify-stack`。
- **staging/TLS/可复现构建**：G1 J2/J4 范围。
- **SBOM 生成/签名、provenance attestation、manifest 自身签名**：仍需外部工具链。
- **产品面**：零 Part Studio/草图/UI/特征求值/真形/绳墨/DanQing 改动。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有实现 | 结论 |
|---|---|---|---|
| tiangong-kaiwu/.github/workflows | public CI（Rush → workspace 构建 → 单测 → tsc/lint） | `ci.yml` | **扩展**：契约门、web build、BFF job、ops 脚本测试 |
| tiangong-kaiwu/scripts | Node ESM 运维脚本 + `node:test` | `release-manifest.mjs`、`.test.mjs`、fixtures | **复用风格并扩展** |
| tiangong-kaiwu/scripts | 发布门 | `release-gate.ps1` | **扩展**：可选 manifest/文件字节校验；不改变默认行为 |
| luban-cad/packages/shared | Feature RPC 契约 | `LubanFeatureRpcInterface.ts`（1.85.0）、`LubanRpcInterface.ts`（1.1.0） | **只读冻结** |
| luban-cad/apps/web | 生产 build | `tsc --noEmit && vite build` | **接入 CI**（复用现有命令） |
| services/bff | BFF typecheck/单测 | `pnpm typecheck`、`pnpm test`（独立 lockfile；本地复跑全绿，计数以实际为准） | **接入 CI**（复用） |
| Playwright | JSON report | 官方 `json` reporter / `PLAYWRIGHT_JSON_OUTPUT_NAME` | **消费报告**，不新增依赖 |
| Node | crypto/fs/util/node:test | 内置 | **复用** |
| TypeScript | 源码 AST/token 解析 | shared devDependency（`~5.6.2`） | **复用**；不新增依赖 |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 | 许可 |
|---|---|---|---|---|---|
| 契约表面 hash | TypeScript parser + scanner | 高 | 复用 workspace 内 TypeScript | 避免自造 TS 解析器；token 流抗注释/空白漂移 | Apache-2.0（既有依赖） |
| 文件哈希 | Node `crypto`/`fs` | 高 | 复用 | 无依赖、跨平台 | Node |
| CLI/测试 | `node:util.parseArgs`、`node:test` | 高 | 复用 `release-manifest` 风格 | 保持工具一致 | Node |
| e2e 报告 | Playwright JSON reporter | 高 | 消费官方格式 | 不解析 list 文本 | Apache-2.0（既有） |
| CI 缓存/安装 | 现有 corepack pnpm@10 / Rush 流程 | 高 | 复用 | 不引入新包管理器/action | 既有 |
| 镜像 digest 验证 | docker/registry/SBOM 工具 | 低（本仓无凭据/无真实镜像） | **不做** | 需外部环境，不能伪造 | — |

**规则遵守**：没有新增第三方依赖；没有第二套构建/测试框架；没有把参考实现当素材。

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| public scripts | 新增只读校验工具 | 无 | 无 | `node:test` 新用例 | 不发布产物 |
| public CI | 新 gate/job | 无 | 无 | 契约门 + web build + BFF | 不推镜像 |
| `@luban-cad/shared` | 冻结清单（只读消费） | 无 | 无 | 现有 shared 单测不变 | **契约变更须 shared/backend/web 同批并更新清单** |
| luban-backend | RPC 版本/FeatureOp 契约消费方 | 无 | 无 | 本切片不改 | 配对 PR 必须 bump/确认清单 |
| web | 消费 shared | 无 | 无 | 生产 build 进 CI | 不发布 |
| BFF | 无 shared 契约依赖 | 无 | 无 | 单测/typecheck 进 CI | 不发布 |

### 4.1 冻结清单格式与哈希定义（必须按此实现）

`docs/architecture/contract-freeze.json`（committed，机器可读）冻结：

- `contracts[].interfaceVersion`：从 TS 类 `interfaceName` 的 `static interfaceVersion` 字符串字面量提取；
- `contracts[].sourceHash`：对 `contracts[].source` 文件中**所有顶层 `export` 声明**做 token 流哈希。

哈希输入的精确定义（写入脚本帮助与 manifest，避免歧义）：

1. 用 TypeScript parser 解析单个 `.ts` 源文件（不做类型检查，不解析依赖）。
2. 只取顶层声明：带 `export` 修饰符的声明，以及 `export ... from` 声明；按源文件顺序。
3. 对每个声明取 `[getStart(sourceFile), getEnd())` 文本，用 TypeScript scanner（`skipTrivia=true`）切成
   token；注释与空白不进入输入，字符串/模板/正则 token 文本按 scanner 原样保留。
4. 所有 token 以 ASCII Unit Separator `U+001F` 连接为一个 UTF-8 字符串；
   `sourceHash = "sha256:" + SHA-256(该字符串的 UTF-8 字节).hex`。
5. **不**包含：文件路径、行号、注释、JSDoc 文档、构建产物、依赖包版本。

因此：只改注释/缩进/换行 → hash 不变；改字段、类型、方法签名/常量、导出集合 → hash 变化。
manifest 更新是显式评审点：必须与 shared 版本 bump、backend/web 配对 PR 同一提交列车。

### 4.2 版本兼容矩阵

- `LubanFeatureRpcInterface`：当前 1.85.0；任何变更必须按 `INTERFACE-FREEZE-MATRIX.md` bump + 配对发布。
- `LubanRpcInterface`：当前 1.1.0；同上。
- 冻结清单不替代 backend 私有仓的 interface-freeze；两者互补。

---

## 5. 数据/事务/安全

- 数据事实源：无变化。新增文件只有 CI 脚本、冻结清单、fixture、文档。
- schema/迁移：无。
- 事务/写租约/undo：无。
- 密钥/日志/审计：工具不读取密钥、不发网络请求（`release-manifest verify-runtime` 既有行为除外，本切片未改）；
  `verify-files` 只读调用方提供的本地文件；`e2e-baseline` 只输出测试标识与状态，**不输出**错误正文、
  stdout/stderr、附件、截图路径或 trace 内容（避免 token/私有环境信息进入发布资产）。
- `e2e-baseline` 不把 known-red 静默当绿：满足的 `test.fail()` 只在
  `totals.expectedFailures` 单独计数，且 `expectedStatus="failed"` 保留在每条测试记录中；
  发布记录必须复核该计数。
- 失败必须 fail closed：清单缺失/源码缺失/解析器缺失/文件不可读/哈希不一致均为非零退出。

---

## 6. 性能与渲染

- 不涉及。CI 增量：契约门只读取 2 个 TS 文件；web build 为既有生产 build；BFF 单测为轻量本地 HTTP mock，无外部服务。
- e2e 基线工具只解析报告 JSON，不启动浏览器。

---

## 7. 测试证据

> 状态：本地已执行；公开 CI 尚未运行。发布前必须在 PR/发布记录中附 CI 运行链接与实际计数。

| 检查 | 命令 | 本轮结果 |
|---|---|---|
| 契约门单测 | `node --test scripts/check-contract-freeze.test.mjs` | **8/8 通过**（本地） |
| 契约门（真实仓） | `node scripts/check-contract-freeze.mjs` | **通过**：Feature 1.85.0、LubanRpc 1.1.0 |
| manifest 单测 | `node --test scripts/release-manifest.test.mjs` | **24/24 通过**（本轮本地；计数以实际运行为准） |
| e2e 基线单测 | `node --test scripts/e2e-baseline.test.mjs` | **5/5 通过**（本地） |
| BFF typecheck/单测 | `corepack pnpm@10 --dir services/bff run typecheck && corepack pnpm@10 --dir services/bff test` | **typecheck 通过；22/22 通过**（BFF 源码另有并行改动，以最终 CI 为准） |
| web 生产 build | `corepack pnpm@10 --dir luban-cad --filter @luban-cad/web build` | **通过**（`tsc --noEmit` + `vite build`；仅 chunk 体积警告） |
| 公开 CI | GitHub Actions `CI (public)` | **未运行**（本分支未 push/未开 PR）；不得宣称 CI 绿 |
| 真栈 e2e | 不执行（栈按任务要求关闭） | **未跑，不得宣称绿** |
| `verify-stack` | 不执行 | **未跑；审计基线 15/17，且存在陈旧镜像/宿主 MS 来源** |

失败注入覆盖：坏 JSON、缺清单、缺源码、版本 bump、类型变化、列表哈希篡改、文件缺失/字节变化、
nativeProvenance 策略缺失、Playwright 报告结构非法、已知 known-red 满足计数的
`expectedFailures` 语义、known-red unexpected pass 仍计 failed。

---

## 8. 回滚与发布

- **回滚方式**：
  - CI：删除/回退新增 job/step 与路径触发即可；不改变现有构建/测试语义。
  - 契约门：回退 `scripts/check-contract-freeze.mjs`、测试与 `docs/architecture/contract-freeze.json` 同一提交。
    注意冻结清单与 shared 源码必须成对回退；单独删除清单会使门禁以 `2` fail closed，这是预期。
  - manifest 硬化：新增字段/命令是 additive；回退脚本与 schema 不改变既有 manifest 的验证语义。
  - e2e 基线：删除脚本/文档条目；不接触历史发布证据。
- **数据迁移回滚**：无。
- **产物/镜像 provenance**：本切片不生成/不改变镜像或产物；真实发布仍需 `release-gate.ps1` +
  `verify-stack.ps1` + 外部 registry/SBOM/label 对账。
- **兼容窗口**：新 manifest 字段 `artifacts[]` 可选，旧 manifest 仍可 `verify`；`verify-files` 是新命令，
  不影响旧调用。CI 契约门只读源码。
- **发布门**：本切片不是发布门替代品；`docs/RELEASE-CHECKLIST.md` 仍为操作真源。

---

## 9. 评审结论

- 复用矩阵完成：是。
- 跨仓影响明确：是。
- P0 例外已登记：否（无新增例外；本切片不触碰 P0 运行时路径）。
- ADR：不需要（见页首）。
- 状态：**已实现，待 CI 实跑与发布 owner 复核**。
- 结论：**修改后批准（Conditional）**——代码/脚本/文档可合并评审；在公开 CI 实际运行并附证据前，
  不得把 J1.2/J1.3/J3.1/J1.5 标记为完成，不得宣称 G1 Gate 通过或发布就绪。

### 9.1 实测记录（本地，2026-11-23）

> 仅记录本轮实际结果；不代替 CI。

- `node --test scripts/check-contract-freeze.test.mjs`：**8 passed / 0 failed**。
- `node scripts/check-contract-freeze.mjs`：**exit 0**；
  `LubanFeatureRpcInterface 1.85.0`、`LubanRpcInterface 1.1.0`。
- `node --test scripts/release-manifest.test.mjs`：**24 passed / 0 failed**。
- `node --test scripts/e2e-baseline.test.mjs`：**5 passed / 0 failed**。
- BFF：`corepack pnpm@10 --dir services/bff run typecheck` **exit 0**；
  `corepack pnpm@10 --dir services/bff test` → `vitest run` **22/22 passed**
  （BFF 源码在此期间由并行工作修改，最终 CI 计数以实际运行为准）。
- `corepack pnpm@10 --dir luban-cad --filter @luban-cad/web build`：**exit 0**
  （`tsc --noEmit` + `vite build`；仅大 chunk 警告，不阻断；CI Node 20 尚未实跑）。
- `node scripts/release-manifest.mjs verify-files --file
  scripts/fixtures/release-manifest.example.json --root .`：**exit 1**（预期）——
  fixture 的占位 digest 与本机实际 native 文件字节不符，证明校验的是实际字节而
  不是声明字符串。该 fixture 仅用于结构测试，不是真实发布清单。
- 公开 CI：**未运行**（无 push/PR）。
- `verify-stack`：**未执行**；不得引用历史 17/17 或任何未复跑数字。
- 未创建真实 release manifest、未填真实镜像 digest、未推镜像/未建 tag。
