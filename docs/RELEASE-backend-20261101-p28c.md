# Release backend-20261101-p28c — B 数据模型 P2 / 命名迁移 / legacy schema 退役

日期：2026-11-01
Tag：`backend-20261101-p28c`
性质：**MS 产物 + GHCR 镜像发布**；web 生产镜像由本仓本地构建（无 GHCR 通道）。
关联：ADR-0001 §15（B 数据模型 P2 / P2.8）。

## 产物

| 对象 | 值 |
|---|---|
| MS 产物 | `modeling-server-win-x64-backend-20261101-p28c.tgz` |
| 大小 | 178,574,240 B |
| SHA256 | `d5f7690c6625099fd44b906a2a40015879028d546a5aca2b0de2c1f769cc45b8` |
| GitHub Release asset digest | `sha256:d5f7690c6625099fd44b906a2a40015879028d546a5aca2b0de2c1f769cc45b8`（与本地相同） |
| RPC 契约 | `@luban-cad/shared` **1.18.0** |
| MS 源码 | private `ff399dd` |
| Hub 源码 | private `c49fd5c` |
| Web 生产镜像 | revision `87ee0f408fb7`（B on、E2E hooks off） |
| Public 发布代码 | `362bc01ced`（main 已推送；后续为证据/文档提交） |

## GHCR

| 镜像 | Tag | Digest |
|---|---|---|
| `ghcr.io/chenjinxian/luban-webhook-agent` | `backend-20261101-p28c` / `latest` | `sha256:d2801d67c9fadcf6e837347426397d72b17106ffab88d8765f96591ea71a76d6` |
| `ghcr.io/chenjinxian/imodelhub` | `backend-20261101-p28c` / `latest` | `sha256:ca4b77f61a88565aefbcf180bcf438ac3aaf4b2ebf0cd28a1a674bf794441b2e`（revision `c49fd5c77101`） |

## 内容

1. **B 数据模型 P2**：iModel = 文档；Part Studio 注册表/页签/active-scope 视口；
   A 旧文档只读兼容；RPC 1.18 原子同发；删除 scope 持久 tombstone。
2. **命名收口**：线上契约/RPC/IPC 全部 `LubanCAD`/`luban-*`。
3. **legacy EC schema 退役**：owner 授权清理旧数据；删除 `CadFeatureSchema.ts` 与
   7 个无调用方的 legacy IPC 方法；本地 500 `.bim` 审计 legacy schema=0，无数据迁移。
4. **P2.8 修复波**：reload `Invalid iModelToken`（IpcSession 门 + `RpcManager.setIModel` +
   有界重试 + 动态 JWT）；写租约 pagehide 释放与 35s 预算；baseline 传播回读 + 单飞；
   tile 404→204 哨兵；MS 产物 flatbuffers hoist 修复。
5. **e2e 观测面**：`VITE_E2E_HOOKS` 门控的 `window.__lubanE2E`，替代 Vite 开发态
   `/@id/` 导入；生产镜像 hooks off。

## 验证

- backend `pnpm test`：**670 passed / 8 skipped（70 files）**；shared **144**；
  web **1154**（发布时）+ tsc/build/lint 0；viewer **96**（发布时）；editor **43**。
- 发布镜像全量 Playwright：**51/51（9.0m，0 crash）**，含 A 几何夹具、damaged 半图
  HITL、A6 两用户分享链；使用 test-observation web 镜像（E2E hooks on）+
  `LUBAN_RPC_RATE_LIMIT_MAX=2000 / window=900000` 测试专用覆盖。
- `verify-stack.ps1`：**17/17**；2026-11-01 发布后复跑仍 **17/17**；
  Step D 产物 provenance 通过；Step E web `87ee0f408fb7`；
  Step F hub `c49fd5c`。
- 限流：全量轮结束后 MS 已恢复生产默认 **100/15min**（启动日志 `production default`）。
- 发布后独立复核：本地 tgz SHA256 与 Release asset digest 相同；`/rpc/metadata`
  仅含 `Luban*` 接口；web 镜像 `b-model-enabled=true`。

## 部署

```powershell
powershell -File scripts/generate-env.ps1     # 首次
powershell -File scripts/fetch-backend.ps1    # 拉 backend-20261101-p28c Release + compose pull
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
powershell -File scripts/rebuild-web.ps1 -BModelEnabled true
docker compose up -d web
powershell -File scripts/verify-stack.ps1
```

`start-ms-host.ps1` 产物模式日志须有 `using dev build from …`。

## 已知边界

- **全量 e2e 仍使用测试专用限流覆盖**（2000/900000）并须披露；生产默认 100/15min。
  客户端 429 有界等待已作为发布后硬化项落地（见 ADR §15.6），但不改变“全量套件
  需干净窗口/测试覆盖”的测试口径。
- **web 无 GHCR 通道**：生产镜像由本仓 `rebuild-web.ps1` 本地构建；发布时须核对
  revision 与 `b-model-enabled=true`，不得把 test-observation 镜像当生产产物。
- **私有依赖产物 provenance**：详细版本/构建信息由对应私有仓维护，公开记录不展开。
- **A 旧文档只读**：P3 旧数据迁移已退役（owner 决策 2026-11-01）；P4 删除 A 兼容层暂缓。
- **限流默认窗口**：长套件仍需测试覆盖 + 跑后恢复默认；不得把覆盖值写进生产配置。
