# Release backend-20261028c — MS #45 redo 栈修复

日期：2026-10-28
Tag：`backend-20261028c`
性质：**仅 MS 宿主产物修复**；shared/契约仍为 1.16，hub/WA 无源码变更。
关联：B6 M-A5.1（选择/树变异/可见性）+ #45 follow-up。

## 产物

| 对象 | 值 |
|---|---|
| MS 产物 | `modeling-server-win-x64-backend-20261028c.tgz` |
| 大小 | 906,158,786 B |
| sha256 | `4b0891f84efddad3fa1c25633938e23b59ba1008471ade28aa30d9678273d176` |
| MS 运行代码 | private `ca30041`（`0002e61` 仅注释/测试增量，dist 等价） |
| 契约 | `@luban-cad/shared` 1.16（无改动） |
| web 源 | public `90316d4`（e2e/文档；镜像 revision 同值） |

## 修复（#45）

首个特征 `deleteFeature` → undo 后原生 redo 不可用：

1. `applyDelete` 清目标特征求值缓存；原生 undo 恢复 feature/body/边/marker/几何，但缓存仍缺。
2. 读 RPC（getFeatureTree/getBodies/getSketch/listSketches）的 `ensureInitialized`
   走 `ensureWarm → rebuildAll`，冷重建 `EditTxn` 提交新事务，清空原生 redo 栈。
3. 修复：读初始化在 `txns.isRedoPossible` 时跳过重建；写 op（applyOp/reparameterizeBody）
   `ensureWarm(true)` 强制补缓存；`warmAttemptedKeys` 仅守读路径。
4. 就绪判定改为**特征级**：status≠0 与 suppressed NEW-body/boolean 不要求缓存；
   健康行缺缓存即重建——覆盖 N≤1 与「body 源全 exempt」冷启动，同时不引入每次写全链重建。

新增真内核回归 `T6d`（读刷新保 redo）、`T6e`（下游写补缓存）、`T6f`（N≤1）、
`T6g`（全源 exempt 冷启动回填健康上游）；web `newbody.spec` 直接断言首删
`undo → redo → undo`。

## 验证

- private feature **400 passed + 8 skipped**；CorpusReplay **6/6**；
  changed-files tsc/eslint 干净。
- newbody 真栈 **2/2**；全量 e2e **34/34**（8.3m，final artifact，干净限流窗）。
- verify-stack **17/17**；web 镜像 revision `90316d4a29a4`。
- 注：全量首跑曾出现一次 boolean 用例首开 `waitEditorReady` 瞬态超时
  （briefcase 30s 后打开）；单跑 2/2 复现为瞬态，随后全量 34/34。

## 部署

```powershell
powershell -File scripts/generate-env.ps1     # 首次
powershell -File scripts/fetch-backend.ps1    # 拉 backend-20261028c Release + compose pull
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
powershell -File scripts/rebuild-web.ps1
docker compose up -d web
powershell -File scripts/verify-stack.ps1
```

`start-ms-host.ps1` 产物模式日志须有 `using dev build from …`。

## 已知边界

- `previewOp` 仍走非 force 预热（web 未接线 preview）；若后续接线，undo→preview 仍可能
  清 redo / 用冷缓存预览。
- 缓存就绪是 presence-based，**present-but-stale**（普通特征 undo 后缓存仍在）不在 #45
  范围；需另立缓存失效/版本方案。
- MS 全局 RPC 限流 100 req/15min；全量 e2e 前需重启 MS 清窗口。
- web 镜像为 Windows/Chromium 本机构建与视觉钉版口径。
