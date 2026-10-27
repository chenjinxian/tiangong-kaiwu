# Release backend-20261027b — B1–B5 特征契约

日期：2026-10-27
Tag：`backend-20261027b`
性质：**仅 MS 产物 + web 本仓重建**；hub / WA 无源码变更，不重发 GHCR 镜像。

## 产物

| 对象 | 值 |
|---|---|
| MS 产物 | `modeling-server-win-x64-backend-20261027b.tgz` |
| 大小 | 906,088,890 B |
| sha256 | `d44dbd2e3e4da6eacc0c6d8408f322c42884b8bf94dca7a9cd00ba88cc2f5a3e` |
| 源码 | private `071254e`（main）+ public web 源 `db18839` |
| 契约 | `@luban-cad/shared` **v1.14.0**（web 与 MS 必须同发布） |
| web 镜像 revision | `db188397f675b299d63563818a47bfbea6097269` |

## 内容（B1–B5）

- **B1 boolean 草图驱动**：`BooleanParams` 草图/面域/距离/operation 通道；无上游事务前拒收；
  内联 profile 旧路径保留。
- **B2 loft**：两个平行截面草图 → `BRepGeometryOperation.Loft`；非平行/单草图/重复/非 SOLID
  zod 或事务前拒收。
- **B3 sweep**：单闭合轮廓沿单直线路径 → `Sweep`；路径非直线/零长/面内退化/含孔轮廓拒收。
- **B4 mirror**：世界 XY/YZ/XZ 平面反射 `entityTransform` + 原体在前 Unite；直改
  `basicManipulation/mirrorElement` 空操作修复为就地 Unite。
- **B5 pattern（PART 级）**：线性 X/Y/Z 与世界 Z 圆周；count 含原件、2..1000；整周
  `angle/count`、部分角 `angle/(count-1)`；全部实例 Unite 单 body；上游不可用（status≠0/
  缓存缺失）事务前拒收，堵住 `ok:true + status=1` 死特征。
- 前端：FeatureDialog 五个通道 + ribbon 真入口（扫掠/镜像/阵列改道参数化对话框）；
  `curvePattern` 能力引导；`booleanBodies` 仍为未接线死命令（B6 范围外，后续修）。

## 验证

- **真栈合成**（新增 `e2e/feature-contracts.spec.ts`，独立项目/iModel，HTTP RPC 直发）：
  草图→Extrude→Mirror→Pattern(linear)→BooleanSubtract→Loft→Sweep→Pattern(circular)，
  树 13 行、六个特征类型全 `status=0`、`BodySolid=1`、原生 undo/redo 最后一笔通过。
- **全量 e2e**：`32/32`（5.6m，:5300 dev + 新 MS 产物），含视觉钉版/Tutorial2/keyboard。
- **verify-stack**：`17/17`（health、数据链、WS cookie、dev-build 横幅、web revision、
  hub 挂载/revision）。
- 单测（发布前）：MS feature 302+8 skip、shared 124、web 874、editor PatternTools 9。

## 部署

```powershell
# 1) 拉新产物（Release tag 或本地产物）
powershell -File scripts/fetch-backend.ps1            # 需先确保 Release 为 backend-20261027b
# 2) 栈与宿主
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
# 3) web 必须按本仓源码重建（compose pull 不更新 web）
powershell -File scripts/rebuild-web.ps1
docker compose up -d web
docker compose restart nginx   # web IP 变更后必须重启 nginx，否则 502
# 4) 验收
powershell -File scripts/verify-stack.ps1
```

`start-ms-host.ps1` 产物模式直接跑 `dist-backend\modeling-server\dist\main.js`；启动日志须有
`using dev build from …`（否则原生库回退官方二进制）。

## 已知边界 / 延后

- 真栈合成验证的是集成链（RPC→FeatureService/EDE/内核→body→树刷新）；体积/bbox 精确值由私有仓
  in-process 真实内核用例覆盖。
- 真实 Onshape 语料对 B1–B5：boolean 内联 REMOVE 可回放；loft/sweep/mirror/pattern 真实样本
  0 可回放（生态/导入体/面级 FS），原因已登记 REPLAY-DESIGN v7。
- B6 多体（compositePart/body boolean）spike 已收口：暂缓，推荐先做最小 A spike + NEW-body；
  计划见 `docs/superpowers/plans/2026-10-27-feature-contracts-mirror-pattern-boolean.md`。
