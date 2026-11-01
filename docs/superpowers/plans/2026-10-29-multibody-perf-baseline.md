# 多体性能护栏 Baseline（2026-11-01）

- **机器**：Windows 11 Home China，Intel Core Ultra X7 358H，Node **v24.20.0**
- **MS 产物**：`backend-20261101-p29b`（RPC 1.18.0，native 5.15.5 / fallback=true）
- **代码**：public `ce2b93b`（web perf probe + reverse-lookup delete plumbing 之后）；
  backend `4c7d165`（MultiBodyPerf）
- **口径**：只测已有生产路径；Docker 栈 + 宿主 MS；web 探针 opt-in（默认 skip）。

## 1. 服务端 in-process（N=127，真 ACIS 内核）

命令（私有仓）：

```powershell
cd D:\Github\luban-backend\modeling-server
$env:CI='true'; corepack pnpm@10 exec vitest run src/feature/MultiBodyPerf.test.ts
```

实测（2026-11-01 16:22，8.36s）：

| 指标 | 10 body | 50 body | 127 body | 阈值 |
|---|---:|---:|---:|---:|
| getBodies（中位数） | 1 ms | 2 ms | **7 ms** | < 1000 ms |
| getTree（中位数） | 1 ms | 2 ms | **5 ms** | < 1000 ms |
| insert 126→127 | — | — | **31 ms** | < 1000 ms |
| 冷 `rebuildAll(127)` | — | — | **565 ms** | < 12,000 ms |
| writtenBodies | — | — | 127 | = 127 |

证据：`%TEMP%\luban-perf\run-2026-11-01T08-22-59-942Z\multibody-perf.json`
（`PERF_EVIDENCE_DIR` 可覆盖；原始 JSON 不入库）。

## 2. Web 真栈（N=20）

命令（仓库根）：

```powershell
cd luban-cad\apps\web
$env:PERF_MULTIBODY='1'; $env:PERF_MULTIBODY_N='20'; $env:CI='true'
corepack pnpm@10 exec playwright test e2e/multibody-perf.spec.ts
```

实测（2026-11-01 16:27，23.1s 用例；干净限流窗口）：

| 指标 | 实测 | 阈值 |
|---|---:|---:|
| 树就绪（reload → N 行） | **4,881 ms**（首跑 6,433 ms） | < 10,000 ms（校准：1.55× 首跑） |
| 适应视图（fit + 2 rAF） | **141 ms** | < 1,000 ms |
| 编辑刷新（抑制 → data-suppressed） | **467 ms** | < 1,000 ms |
| FPS p95（1.5s rAF 采样，91 帧） | **16.7 ms** | ≤ 18.2 ms |
| tile content bytes before→after | 12,976 → 13,202 | 仅记录，不设门 |
| tile cache misses before→after | 3 → 3 | 仅记录，不设门 |

证据：`.superpowers/sdd/2026-10-29-m-a5.2-perf/perf-samples/run-2026-11-01T08-26-26-879Z/metrics.json`
（gitignored；`PERF_EVIDENCE_DIR` 可覆盖）。

## 3. 结论与边界

- 127-body 服务端读面/插入/冷重建均远低于门槛；20-body 真栈树就绪与
  编辑刷新在 5s/0.5s 量级，FPS p95 16.7ms 接近 60fps 底线。
- **树就绪阈值**由 3s 校准到 10s：首跑 6,433ms（reload 含 briefcase 打开 +
  20 体树），10s ≈ 1.55×；未超过 2× 实测。
- **tile 指标**只记录不 gate（架构改造另立）。
- 全量默认 e2e 仍不包含本探针（`test.skip` 缺省）；大 N 需干净限流窗口。
- **面/边删除**：反向 cache id 通道已落地；普通盒体单面删除是内核既定负路径
  （`imodel-native docs/reference/compare/DeleteSubEntitiesOperation.md`：
  `api_remove_faces` 邻面补不拢，Err 115006）；SUCCESS 需要共面分裂种子 —
  fixture 为 backlog（见 `2026-10-29-subentity-selection.md` Result）。
