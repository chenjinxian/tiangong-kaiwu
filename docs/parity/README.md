# Parity 能力与示例对齐程序（公共索引）

> 主线计划：[`docs/superpowers/plans/2026-11-19-onshape-full-parity.md`](../superpowers/plans/2026-11-19-onshape-full-parity.md)
>
> 本目录只放**脱敏、可公开**的对齐状态与判定规则。原始 live 证据、逐示例
> oracle、原始内核错误码与私有仓路径一律留在私有仓（`onshape-parity-data`、
> `imodel-native`、`luban-backend`）。

## 1. 三份单一事实源

| 事实源 | 位置 | 作用 |
|---|---|---|
| 能力账本 | `docs/parity/capability-ledger.json`（生成） / `CAPABILITY-LEDGER.md`（可读视图） | 每个工具/约束/特征族/参数分支的唯一状态 |
| ACIS 暴露面 | 公共：`docs/parity/KERNEL-BOUNDARIES.md`；私有：imodel-native 探针矩阵 | 内核能力/许可/边界结论，驱动 blocked 判定 |
| 示例三态 registry | 私有 `onshape-parity-data/manifest/tri-state-registry.json`；公共只由 strict 生成 catalog | 1,685 个 API Part Studio 的严格/近似/阻塞状态 |

状态词与容差以 [`STATUS-DEFINITIONS.md`](./STATUS-DEFINITIONS.md) 为准。

## 2. 目录内容

| 文件 | 说明 |
|---|---|
| [`STATUS-DEFINITIONS.md`](./STATUS-DEFINITIONS.md) | `full/partial/gated/blocked-*/excluded` 与 `strict/approx/blocked` 的判定、容差、升降级与 fail-closed 不变量 |
| [`capability-ledger.json`](./capability-ledger.json) | 能力账本（机器可读，生成产物） |
| [`CAPABILITY-LEDGER.md`](./CAPABILITY-LEDGER.md) | 能力账本（可读视图，生成产物） |
| [`KERNEL-BOUNDARIES.md`](./KERNEL-BOUNDARIES.md) | 内核边界与许可结论（脱敏） |
| [`public-catalog-downgrade-20261119.md`](./public-catalog-downgrade-20261119.md) | 旧 22 条公共 strict 的重审/降级清单（2026-11-19） |
| `feature-depth-matrix.md` | 20 个既有 FeatureType 的逐参数分支状态（W0/W3 产出） |

## 3. 生成与校验

> 生成脚本位于 `scripts/parity/`。生成器只读源文件，不写业务代码；所有产物
> 必须可通过 `verify-*` 复现。

```bash
# 能力账本：从 shared / web gating / 私有后端 registry 导出（导出文件脱敏）
node scripts/parity/build-capability-ledger.mjs
node scripts/parity/verify-capability-ledger.mjs

# 公共示例目录：输入 = docs/parity/public-catalog.input.json（脱敏投影）
# legacy=true 时页面必须显示“旧演示 approx（重审中）”，不得宣称 strict；
# strict 重审晋级后把 legacy 置 false 并重新生成。
node scripts/parity/build-public-catalog.mjs
node scripts/parity/verify-public-catalog.mjs

# Corpus 批处理（真栈）：ONSHAPE_BATCH_FILE -> e2e/examples/corpus/batch.spec.ts
node scripts/parity/run-batch.mjs --batch <batch.json> [--out <report.jsonl>] [--grep <regex>]
```

批处理文件逐条跑独立 iModel，复用 scenario-file 管线（建链 → tree/status/逐 body
体积 → push + 冷重开）；条目携带 `expectedBodies`（含 centroid）时额外按质心一对一
配对复核，禁止用总体积替代。

私有仓命令见 `onshape-parity-data` 的 README；公共仓不复制其数据。

## 4. 当前状态（2026-11-19 基线）

- 公共前端：20 个草图工具、17 种约束、20 个 FeatureType、55 个 gated key；
  大量入口为可见但未实现/半实现。
- 私有后端：libslvs 17 种约束；缺 ellipse/conic/text、N 点样条、
  PROJECTED/PIERCE/INTERSECTED/SILHOUETTED 外部引用、symmetric/normal 等。
- 内核：ACIS `SolidKernel.h` 111 个 static API、PSBRep opcode 0–36；后端仅用
  其中一部分；删除面/替换面/抽壳/曲面/螺纹等受 API/许可/行为边界约束。
- 示例：526 文档 / 1,505 PS 目录 / 1,685 API PS。三态 registry v0 已建立
  （1,685 行；local 1,505 + API-only 180；approx 50 / blocked 1,508 / excluded 127）。
  旧 22 条 strict 已按新四维门重审：**22/22 降级 approx、publicEligible=0**
  （缺逐 body centroid、约束 oracle、树名称/顺序、undo/redo；3 个 WARNING LABEL
  场景还缺 decal/mateConnector）。公共 catalog 由 `public-catalog.input.json`
  生成，当前 `legacy=true`：`/examples` 只作旧演示导航、显示 approx 横幅且明确
  0 个 strict；strict 目录待 W6 按四维门重审晋级后置 `legacy=false` 重新生成。
- 公共仓已具备：能力账本生成/校验、catalog 生成/校验（含严格输入校验与私有
  标记扫描）、corpus batch spec（逐 body 质心配对 + JSONL 报告）。私有数据仍
  只留在私有仓。
- 结论：在能力账本、内核探针矩阵、三态 registry 建立前，任何“全绿”结论
  均不可信；三份事实源建立后，所有进度以账本/registry 为准。

## 5. 公私边界

- 公共可写：状态定义、能力账本（脱敏）、内核结论（不含 raw 错误码）、
  只含 strict 的示例目录、公开测试路径。
- 私有保留：live 截图/DOM、DXF、逐 body oracle、场景原文、内核复现、限流
  记录、私有仓路径、账号信息。
- 任何 PR 若把私有内容带入公共仓，按 P0 缺陷打回。
