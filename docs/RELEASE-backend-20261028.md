# Release backend-20261028 — B6 多体 foundation + NEW-body

日期：2026-10-28
Tag：`backend-20261028`
性质：MS 产物 + 本仓 web 同批发布；hub / WA 无源码变更，不重发 GHCR 镜像。
**版本配对：MS 1.15 ≥ web 1.15；先发 MS / 同批重建，禁止单独先发 1.15 web。**

## 产物

| 对象 | 值 |
|---|---|
| MS 产物 | `modeling-server-win-x64-backend-20261028.tgz` |
| 大小 | 906,134,334 B |
| sha256 | `e965e4eef207528f0032e31d21e111c247c5dd6193aaa67cb6eb3ed752a1eee0` |
| 源码 | private `4f74ed8`（main）+ public web 源 `5e8dc9bbf3` |
| 契约 | `@luban-cad/shared` **v1.15.0**（ExtrudeParams.newBody / BodyRef·BodyInfo / getBodies / targetBodyId） |
| web 镜像 revision | `5e8dc9bbf3c2c4af1de20976949196e237b2c2a9` |

## 内容（B6 多体 foundation + NEW-body）

- **M-A1 多 body foundation**：逐 body 链（target/prev 链局部）、入缓存单源/单 BRep 守卫、
  逐 body `rebuildAll`/`ensureWarm`/`reparameterize`、per-dbKey `withEvalLock`（carrier 互斥）。
- **M-A3.1 NEW-body + 生命周期**：extrude `newBody` 在同 txn 创建 authored body（旧 body 边保留，
  feature→newBody，求值不 Unite 上游）；authored marker/旧库 heuristic；软删除 `state=consumed`；
  `getBodies` RPC（bodyKey=elementId、name/active/sourceFeatureId）。
- **M-A3.2 UI/tree**：extrude「新建实体」复选；N>1 body 目标选择器（`op.targetBodyId`）；
  零件树只显示 authored active body（orphan/consumed 排除）；consumed 几何视口隐藏（∪ 手动隐藏，
  undo 恢复）；fillet/chamfer/shell target 由拾边父体自动推导（混体/未知/孤儿/消费态拒收）；
  `deleteFeature.targetBodyId` 契约；opDsl targetBodyId。
- 仍保留 B1–B5（boolean/loft/sweep/mirror/pattern）与既有单 body 路径。

## 验证

- **真栈两体 + fillet**（新增 `e2e/newbody.spec.ts`）：草图 A→extrude body1；草图 B→extrude(newBody)
  body2；getBodies 两 active；页面树两行；删除 body2 feature→consumed、树一行、`EmphasizeElements`
  hidden 含 body2；undo→active/树两行/hidden 清除；再拾 body2 边做 fillet，target 自动落 body2
  （`getBodies.sourceFeatureId=fillet` 的 bodyKey=body2，body1 不变）。
- **全量 e2e 33/33**（7.3m，:5300 dev + 新 MS 产物；含视觉钉版重钉）。
- **verify-stack 17/17**（含 Step E web revision、Step F hub）。
- 单测：web 63 files/906、shared 7/134、private feature 43 files/360 passed + 8 skipped；
  CorpusReplay 6/6（≤0.0001%）；三仓 tsc/lint。

## 部署

```powershell
# 1) 拉产物（本地/Release）
powershell -File scripts/fetch-backend.ps1 -LocalArtifact D:\Github\luban-backend\dist-out\modeling-server-win-x64-backend-20261028.tgz
# 2) 栈 + 宿主（MS 先）
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
# 3) web 同批重建（MS ≥ web；不要单独先发 1.15 web）
powershell -File scripts/rebuild-web.ps1
docker compose up -d web
docker compose restart nginx   # web IP 变更，必须重启 nginx
# 4) 验收
powershell -File scripts/verify-stack.ps1
```

## 已知边界 / 延后

- **删除 HITL 仍未接线**：树右键删除回调已携带 targetBodyId 契约值，但宿主未接 applyOp；删除
  newBody feature 目前经 RPC/后续批次接线。
- **raw RPC/DSL fillet target**：UI 已按拾边 owner 自动收口；服务端尚未硬校验 edge→body 归属
  （AI/raw fillet 暴露前须 1.16 契约 + planInsert 校验）。
- **N=1 invalid-owner 错误**未渲染（提交静默禁用；UI 收口，记录为 Minor）。
- orphan 直改副本不显示在树/不作为 body，但仍可能渲染（未清理）。
- edit `updateParams` 仍禁用；未来启用须保留/合并 `newBody` 结构键。
- B6 后续：M-A4 body boolean / compositePart；importForeign 仍为独立 XL 项目。
