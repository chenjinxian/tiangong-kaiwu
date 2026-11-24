# Hub 完整性扫描（G1 E8 Skeleton v1）

> 状态：**Skeleton v1 — 只读、未修复；已对隔离 drill Hub 实测，未对生产/live Hub 验证**（2026-11-24）
> 工具：`scripts/integrity/Invoke-IntegrityScan.mjs`（Node ESM，无第三方依赖）
> 核心：`scripts/integrity/scan-core.mjs`；测试：`scripts/integrity/integrity-scan.test.mjs`
> 关联：`docs/architecture/G1-EXECUTION-PLAN.md` E8、`docs/operations/BACKUP-RESTORE.md`、
> `docs/operations/DR-DRILL.md`、`docs/architecture/ADR-G0-04-ledger-version-checkpoint.md`。

## 0. 一句话结论

本工具对**配置好的隔离 Hub 元数据（Postgres，只读事务）**与**对象存储清单（Azurite/Azure Blob
LIST+GET，或目录/JSON 清单）**做一致性对账，输出 JSON + Markdown 报告：
changeset head/chain root、缺失 changeset/blob、大小与 SHA-256 不符、缺失 baseline/checkpoint、
孤儿 blob、悬挂行。

**它不修复、不删除、不迁移、不备份、不恢复。** 它不能单独证明可恢复性、RPO/RTO、模型语义
正确性或防篡改。发现异常时只能从同一备份集恢复，不能用手工补行/补 blob 的方式“修绿”。

---

## 1. 范围

### 1.1 检查项

| 类别 | 检查 | 输出/发现码 |
|---|---|---|
| 账本头/链根 | 每个 iModel 的最高 committed index、head changeset id、按 `index|changesetId|chainHash` 计算的 chain root；legacy chain（有 null chainHash）单独标记 | `chains[]`、`legacy-chain` |
| 缺失 changeset 行 | committed index 不连续；parentId 无法解析；parent index 错误；prevHash 与父 chainHash 不符；重复 index | `missing-changeset`、`dangling-parent`、`parent-index-mismatch`、`prev-hash-mismatch`、`duplicate-changeset-index` |
| 缺失 changeset/blob | committed 行引用的 blob 不在清单；行没有映射 blobPath（扫描不完整） | `missing-changeset-blob`、`changeset-without-blob-reference` + unverified |
| blob 大小/SHA | 声明 fileSize 与对象大小不符；声明 64-hex SHA-256 与对象字节不符；40-hex SHA-1 同样校验 | `blob-size-mismatch`、`blob-sha256-mismatch`、`blob-sha1-mismatch` |
| baseline | iModel 有 changeset 但没有 baseline 映射/成功 baseline checkpoint；baseline blob 缺失或大小/哈希不符 | `missing-baseline`、`missing-baseline-blob`、`blob-*` |
| checkpoint | successful 行目标 changeset 缺失/未封账、fileSize 非正、同一 index 多个 successful、目标 blob 缺失/不符 | `checkpoint-target-missing`、`checkpoint-target-not-uploaded`、`invalid-checkpoint`、`duplicate-successful-checkpoint`、`missing-checkpoint-blob` |
| Named Version | 指向的 changeset 缺失；没有 successful checkpoint；checkpoint 未 ready | `dangling-named-version`、`named-version-checkpoint-missing`、`named-version-checkpoint-not-ready` |
| 孤儿 blob | 在配置的 managed prefix 下、没有被任何扫描到的行引用 | `orphan-blob` |
| 悬挂行 | 行引用不存在的 iModel；等待封账行占用已提交 index；未知 state | `dangling-imodel-row`、`pending-changeset-in-chain`、`unknown-changeset-state` |
| 扫描完整性 | 表/列/映射缺失、清单不完整、未收集哈希 | `unverified[]` + exit 3 |

### 1.2 明确不检查

- BIS/iModel 内容、几何、元素、tile、briefcase、Local/session cache、Redis/队列。
- checkpoint CloudSqlite 容器的块完整性/readback（只有适配器能给出具体 blob path 时才检查该对象）。
- `pg_dump`/tar 备份产物本身的可恢复性（manifest SHA-256 是备份工具的职责；本工具不读 dump/tar）。
- 对象不可变性、版本化、对象锁、跨区复制、KMS/加密、访问审计。
- 模型语义/参数/DAG/特征树是否正确。

---

## 2. 只读与安全边界

1. **Postgres 只读**：每个查询都执行
   `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout=...; SELECT ...; COMMIT;`。
   代码在发送前用 `assertSelectStatement` 拒绝非 `SELECT` 及多语句 SQL；不执行 migration、
   `UPDATE`/`DELETE`/`TRUNCATE`、`COPY`、DDL 或函数副作用入口。查询由工具构造，不拼接外部 SQL。
2. **对象存储只读**：Azure/Azurite 适配器只发 `LIST`（`GET ?restype=container&comp=list`）与
   `GET blob`；没有 PUT/DELETE/COPY。目录适配器只读文件；JSON 清单只读文件。
3. **不发现/不启动/不停止任何栈**：工具不会调用 `docker compose`（Postgres 只通过调用方指定的
   `docker exec` 执行 psql），不会重启容器、不会挂载/改名卷、不会执行 `down -v`。
4. **密钥只从环境变量读取**：
   - Postgres：`PGPASSWORD`（docker 模式通过 `docker exec -e PGPASSWORD` 透传，不进 argv/manifest）。
   - Azure/Azurite：`--blob-key-env` 指定的环境变量，缺省 `AZURITE_ACCOUNT_KEY`。
   - 工具**不接受**命令行密码/密钥参数，也不会把密钥写入报告。
5. **显式目标**：没有默认的 live DB/endpoint；必须显式传 `--db-snapshot` 或 `--db-mode`，
   以及 `--blob-inventory`/`--blob-dir`/`--blob-mode azure`。
6. **输出可能含模型标识**：报告包含 iModel id、changeset id、blob key（可能含客户数据索引）。
   只能存私有证据库，**不得提交公开仓**。
7. **退出码不是修复许可**：exit 0 只表示在本次映射范围内没有发现error/unverified；
   不代表可以跳过备份、修复、恢复演练或安全审计。

---

## 3. 前置条件与适配范围

- Node.js >= 20（使用 `node:test`、`node:util.parseArgs`、`node:http`/`node:https`、`node:crypto` 等标准库）。
- 无第三方 npm 依赖；不需要构建。
- Postgres 适配器是 **best-effort schema mapping**。v1 期望（大小写不敏感）：
  - `changesets`（必需）：`id`、`iModelId`、`index`、`parentId`、`prevHash`、`chainHash`、
    `checksum`/`contentSha256`、`fileSize`、`filePath`/`blobPath`/`objectKey`、`state`、`deletedAt`。
  - `checkpoints`：`id`、`iModelId`、`changesetId`、`changesetIndex`、`state`、`fileSize`、
    `contentSha256`、`dbName`、`manifestPath`、`deletedAt`。
  - `named_versions` / `namedversions`：`id`、`name`、`iModelId`、`changesetId`、`changesetIndex`、
    `state`、`deletedAt`。
  - `imodels`：`id`、`name`、`state`、`changesetCount`，以及名字含 `baseline` 的 path/name/size/hash 列。
  - 若表不存在或关键列缺失，工具不会猜：相关集合标记为 unavailable，扫描以 **exit 3** 结束。
  - baseline 存储引用映射不到时可用
    `--baseline-path-template 'imodels/{iModelId}/baseline/{baselineFileName}'`；模板错误会产生
    false missing，因此必须先在小范围（`--imodel-id`）核对。
- **live 适配器已对隔离 drill Hub（Azurite + 演练 Postgres）实测**，发现并修复了两个缺陷
  （见 §10）：Azurite path-style SharedKey 规范化、只读 SQL 的 SELECT 终止符。**未对生产/
  共享 Hub 验证**；首次用于生产仍必须在隔离环境、先小范围、先与已知数据核对。

### 3.1 对象存储路径约定

- changeset/blob 的“名字”必须与 DB 中的 `filePath`（或显式 snapshot 的 `blobPath`）**逐字一致**。
- baseline/checkpoint 的 `dbName`/`manifestPath` 只有在包含 `/` 时才被当作 blob key；
  CloudSqlite 的块 blob 不在此映射。
- Azure/Azurite 列出的是容器内 blob 名；`--blob-prefix` 只影响列举范围，不改变 DB 引用。
- 目录模式把目录内相对路径（POSIX `/`）当作 blob 名；适合导出/复制出来的对象存储快照，
  不适合直接指向 Azurite 的 `__blobstorage__` 原始卷（原始卷需要 REST 模式或先导出）。

---

## 4. 使用

### 4.1 先跑离线 snapshot（推荐第一步）

完全离线、无网络、无 Docker、无 DB。准备两个 JSON 文件：

**DB snapshot**（示例字段；所有数组都应显式给出，才能得到完整结论）：

```json
{
  "schemaVersion": 1,
  "source": { "kind": "fixture" },
  "changesets": [
    {
      "iModelId": "00000000-0000-4000-8000-000000000000",
      "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "index": 1,
      "parentId": null,
      "prevHash": null,
      "chainHash": "1111111111111111111111111111111111111111111111111111111111111111",
      "checksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "fileSize": 1234,
      "blobPath": "imodels/<iModelId>/changesets/1.changeset",
      "state": "fileUploaded",
      "deletedAt": null
    }
  ],
  "baselines": [
    {
      "iModelId": "00000000-0000-4000-8000-000000000000",
      "blobPath": "imodels/<iModelId>/baseline.bim",
      "fileSize": 4096,
      "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  ],
  "baselinesKnown": true,
  "checkpoints": [],
  "namedVersions": [],
  "imodels": [
    {
      "id": "00000000-0000-4000-8000-000000000000",
      "name": "sample",
      "state": "initialized",
      "changesetCount": 1
    }
  ]
}
```

**Blob inventory**：

```json
{
  "schemaVersion": 1,
  "source": { "kind": "fixture" },
  "complete": true,
  "hashMode": "referenced",
  "managedPrefixes": ["imodels/"],
  "blobs": [
    {
      "name": "imodels/<iModelId>/baseline.bim",
      "size": 4096,
      "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    {
      "name": "imodels/<iModelId>/changesets/1.changeset",
      "size": 1234,
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```

```powershell
node scripts/integrity/Invoke-IntegrityScan.mjs `
  --db-snapshot D:\evidence\hub-snapshot.json `
  --blob-inventory D:\evidence\blob-inventory.json `
  --orphan-prefix imodels/ `
  --json-out D:\evidence\integrity-20261124T120000Z.json `
  --md-out D:\evidence\integrity-20261124T120000Z.md
```

离线模式适合：评审扫描逻辑、对备份导出做取证、复现问题、CI 夹具。**snapshot 由谁生成、
生成时是否 quiesced，决定了结论的强度。**

### 4.2 隔离 Postgres（docker 只读 exec）

```powershell
# 密码只放环境变量；不要写进命令行或报告。
$env:PGPASSWORD = '<from secret store>'

node scripts/integrity/Invoke-IntegrityScan.mjs `
  --db-mode docker `
  --docker-container "<isolated-postgres-container>" `
  --db-user "<hub-db-role>" `
  --db-name "<hub-db-name>" `
  --db-schema public `
  --imodel-id "<optional-iModel-uuid>" `
  --statement-timeout-ms 30000 `
  --blob-inventory D:\evidence\blob-inventory.json `
  --orphan-prefix imodels/ `
  --format json
```

- 容器名必须是**隔离/演练栈**的容器；工具不会自动发现或选择 live 容器。
- psql 以 `-w`（不提示密码）+ stdin SQL 执行；密码由 `PGPASSWORD` 环境变量透传。
- 若目标库不在容器内，用 `--db-mode psql` 并显式配置 host/port/db；`PGPASSWORD` 仍只从环境读取。

### 4.3 直接 psql

```powershell
$env:PGHOST = '<isolated-host>'
$env:PGPORT = '5432'
$env:PGUSER = '<role>'
$env:PGDATABASE = '<db>'
$env:PGPASSWORD = '<from secret store>'

node scripts/integrity/Invoke-IntegrityScan.mjs `
  --db-mode psql --db-name $env:PGDATABASE `
  --blob-mode azure `
  --blob-endpoint http://127.0.0.1:10500/devstoreaccount1 `
  --blob-container imodelhub `
  --blob-prefix imodels/ `
  --orphan-prefix imodels/ `
  --json-out D:\evidence\integrity-live.json `
  --md-out D:\evidence\integrity-live.md
```

### 4.4 对象存储来源

#### Azure Blob / Azurite REST（只读 LIST+GET）

```powershell
# 从密钥系统注入；不要 echo，不要写进命令行。
$env:AZURITE_ACCOUNT_KEY = '<from secret store>'

node scripts/integrity/Invoke-IntegrityScan.mjs `
  --db-mode docker --docker-container "<isolated-postgres>" --db-user "<role>" --db-name "<db>" `
  --blob-mode azure `
  --blob-endpoint http://127.0.0.1:10500/devstoreaccount1 `
  --blob-container imodelhub `
  --blob-prefix imodels/ `
  --blob-hash referenced `
  --orphan-prefix imodels/ `
  --json-out D:\evidence\integrity.json `
  --md-out D:\evidence\integrity.md
```

- 账户名可显式 `--blob-account`；否则从 `AZURITE_ACCOUNT_NAME` 或 endpoint path/host 推断。
- `--blob-hash referenced`（缺省）只对 DB 引用到的 blob 做 SHA-256/SHA-1；`all` 对全部列举对象
  做哈希；`none` 只比大小。大对象可用 `--max-hash-bytes` 限制，被跳过的对象会进入
  `unverified`，不会被当成 clean。
- 只支持 SharedKey（`--blob-key-env`）；不支持 SAS、AAD、代理隧道。
- 生产对象存储可能阻止 LIST 或使用私有 endpoint；此时改用导出 inventory 或专门的只读导出通道。

#### 目录清单

```powershell
node scripts/integrity/Invoke-IntegrityScan.mjs `
  --db-snapshot D:\evidence\hub-snapshot.json `
  --blob-mode dir --blob-dir D:\evidence\object-store-export `
  --blob-hash referenced `
  --orphan-prefix imodels/ `
  --format md
```

目录内相对路径即 blob 名；符号链接被跳过。文件在扫描过程中变化会产生不可重复的
size/hash 结果，必须在 quiesced 副本上运行。

#### JSON inventory

`--blob-inventory` 接受上面的 Blob inventory schema；适合从对象存储导出、或在 CI 中使用夹具。
`complete: false` 会强制 exit 3。

### 4.5 孤儿扫描与 `--imodel-id`

- 必须显式给 `--orphan-prefix`（可重复）或 inventory 的 `managedPrefixes`；否则输出
  `orphan-scan-skipped` 到 unverified 并以 **exit 3** 结束，而不是误报 clean。
  需要扫描全部对象时传 `--orphan-prefix '*'`（前提是容器只承载账本对象）。
- `imodels/` 下可能混有 checkpoint CloudSqlite 块、tile 或其他生命周期对象。若容器不是
  **只承载账本对象**，应把 prefix 缩到 changeset/baseline 的专属前缀；否则 `orphan-blob`
  可能是假阳性。
- 使用 `--imodel-id` 缩小范围时，孤儿扫描仍按完整 prefix 进行；其他 iModel 的 blob 会被当作
  orphan。需要同时把 prefix 缩到该 iModel 的前缀，或接受该已知偏差并在证据中记录。
- 显式 `--imodel-id` 在扫描到的元数据中不存在时，工具以 exit 3 失败关闭，不会把“筛出空集”
  误报为 clean。

---

## 5. 输出与证据格式

### 5.1 JSON 报告（schemaVersion 1）

```json
{
  "schemaVersion": 1,
  "kind": "tiangong-kaiwu-integrity-scan",
  "tool": "scripts/integrity/Invoke-IntegrityScan.mjs",
  "generatedAtUtc": "2026-11-24T12:00:00.000Z",
  "readOnly": true,
  "mode": "docker+azure",
  "source": { "metadata": { "...": "..." }, "blobs": { "...": "..." } },
  "target": { "label": "...", "database": "...", "objectStore": "..." },
  "summary": {
    "imodels": 0, "changesets": 0, "committedChangesets": 0,
    "pendingChangesets": 0, "deletedChangesets": 0,
    "baselines": 0, "checkpoints": 0, "namedVersions": 0, "blobs": 0,
    "errors": 0, "warnings": 0, "infos": 0, "unverified": 0
  },
  "chains": [],
  "findings": [],
  "unverified": [],
  "limitations": [],
  "complete": true,
  "result": "CLEAN",
  "exitCode": 0
}
```

### 5.2 Markdown

`renderMarkdown` 生成人类可读报告：result/exit、target、summary、chains（head/root/pending）、
findings、unverified、退出码与 limitations。表格中的 `|`/换行会被转义。

### 5.3 退出码

| 退出码 | 含义 | 处理 |
|---:|---|---|
| 0 | 在已映射范围内未发现 error，且所有必要检查都完成 | 记录证据；仍需 DR 演练与业务验收 |
| 1 | 发现 integrity error（或有 warning 且 `--fail-on-warnings`） | 不要修复数据来“变绿”；从同一备份集恢复/升级处理 |
| 2 | 用法/配置/输入 schema 错误 | 修命令或快照；不会写入目标 |
| 3 | 扫描无法完成或不完整（unverified/适配器/连接/清单失败）：表/列/映射/哈希/清单缺失，或读取源失败 | 补齐适配器/配置/连接后重跑；**不得**对外宣称 clean |

优先级：error → 1；无 error 但 unverified → 3；仅 warning → 0（除非 `--fail-on-warnings`）。

### 5.4 证据记录

每次正式扫描至少记录：

- 命令（去掉密码/密钥；只记环境变量名）；
- 目标：隔离 compose 项目/DB 容器/库名/schema、对象存储 endpoint/container/prefix、iModel 过滤；
- 扫描窗口（开始/结束 UTC）、是否 quiesced、源提交（`git rev-parse HEAD`）；
- 退出码、`result`、`summary`、JSON + Markdown 文件路径及二者 SHA-256；
- 所有 `unverified` 原因；若 exit 3，明确“本次未证明什么”。

```powershell
Get-FileHash D:\evidence\integrity-20261124T120000Z.json -Algorithm SHA256
Get-FileHash D:\evidence\integrity-20261124T120000Z.md -Algorithm SHA256
```

报告建议放私有证据库；公开仓只放脱敏结论。**不要提交 DB snapshot、blob inventory、报告或
任何含模型/客户标识的产物。**

---

## 6. 发现码与处置

`error`（exit 1）：

| 代码 | 含义 | 处置 |
|---|---|---|
| `missing-changeset-blob` | committed 行引用的 blob 不存在 | 从同一备份集恢复 DB+对象；不补 blob |
| `missing-checkpoint-blob` | checkpoint 引用的 blob 不存在 | 不作为版本使用；成套恢复 |
| `blob-size-mismatch` | 声明大小 ≠ 存储大小 | 视为损坏；成套恢复 |
| `blob-sha256-mismatch` / `blob-sha1-mismatch` | 声明摘要 ≠ 存储字节 | 视为损坏；成套恢复 |
| `missing-changeset` | committed index 不连续 | 从备份恢复并排查写者 |
| `missing-parent` / `dangling-parent` / `parent-index-mismatch` / `prev-hash-mismatch` | 父链断/错 | 视为账本损坏；恢复 |
| `duplicate-changeset-index` | 一个 index 多个 active 行 | 走 D2 恢复路径，不手删 |
| `pending-changeset-in-chain` | waitingForFile 占用已提交 index | 走批准的 stale 恢复路径 |
| `missing-baseline` / `missing-baseline-blob` | iModel 有 changeset 但 baseline 不可用 | 恢复 baseline/对象存储 |
| `checkpoint-target-missing` / `checkpoint-target-not-uploaded` | checkpoint 指向缺失/未封账 changeset | 不暴露为版本；恢复 |
| `invalid-checkpoint` | successful 行缺正大小/必要哈希 | 重新生成前先恢复数据 |
| `duplicate-successful-checkpoint` | 同 iModel/index 多个 successful | 查控制面；走批准的迁移/保留 |
| `dangling-named-version` | NV 指向缺失 changeset | 恢复账本；不静默重定向 |
| `orphan-blob` | managed prefix 下无 DB 引用 | 批准的对账/隔离后再处理；工具不删除 |
| `dangling-imodel-row` | 行引用不存在的 iModel | 恢复元数据或缩范围 |

`warning`（缺省不改变 exit；`--fail-on-warnings` 可 gate）：
`changeset-without-blob-reference`、`pending-changeset`、`unknown-changeset-state`、
`legacy-chain`、`imodel-changeset-count-mismatch`、`checkpoint-scheduled`、`checkpoint-failed`、
`named-version-checkpoint-missing`、`named-version-checkpoint-not-ready`、`unsupported-checksum`。

`unverified`（exit 3）：`orphan-scan-skipped`、`legacy-chain-root-unavailable`、`checksum-not-verifiable`、`checkpoint-content-hash-not-declared`、`baseline-inventory-unavailable`、`checkpoint-inventory-unavailable`、
`named-version-inventory-unavailable`、`imodel-inventory-unavailable`、
`adapter-mapping-incomplete`、`blob-inventory-incomplete`、`blob-listing-incomplete`、
`sha256-not-collected`、`sha1-not-collected`、`changeset-blob-unmapped`、
`changeset-size-not-declared`、`changeset-checksum-not-declared`、`prev-hash-not-available`、
`baseline-blob-unmapped`、`baseline-not-mapped`、`checkpoint-blob-unmapped`。

处置原则：**任何写操作（修复、删除、隔离、重生成）都不属于本工具**；必须先做新备份，
按 `BACKUP-RESTORE.md` 的 HITL 流程与 G1 工作包执行。

---

## 7. 本工具不能证明什么（必须显式承认）

1. **不能证明可恢复性**：没跑过 `restore-stack.ps1` + 隔离栈验收，就不能说备份可恢复。
2. **不能证明 RPO/RTO**：扫描不是演练；RPO/RTO 需要 `DR-DRILL.md` 的计时与验收记录。
3. **不能证明模型语义**：BIS/geometry/tree/params/feature DAG 的正确性不在范围内。
4. **不能独立重算 canonical chainHash**：只报告存储的 chain root，并检查 parent/prevHash 关系；
   DB 中 chainHash 若被成对伪造，本工具不检测。canonical 公式变更属于 D1.7 实现。
5. **不是签名/MAC**：SHA-256 只证明“对象字节与声明摘要一致”；DB+对象存储被协同篡改时无法发现。
6. **不是跨存储原子快照**：DB 只读事务与对象 LIST/GET 不是同一快照；有写者时可能得到时序偏差。
   强结论必须 quiesced/隔离。
7. **不检查 checkpoint CloudSqlite 块**：成功 checkpoint 的容器块完整性/可打开性需要原生 readback
   或 checkpoint worker 证据；本工具只在有具体 blob path 时比对该对象。
8. **不检查对象生命周期/安全控制**：版本化、对象锁、WORM、KMS、ACL、审计、Azurite well-known key
   都不在范围内；Azurite 仅开发用途。
9. **不证明 live Hub schema 映射正确**：v1 live 适配器未对运行中 Hub 验证；未映射列会 exit 3，
   不会变成 clean。首次使用必须小范围核对。
10. **不是修复工具**：没有 `--repair`、`--delete`、`--migrate` 模式，未来也不应把修复塞进
    同一个只读入口。

---

## 8. 与 DR 演练的衔接

- 恢复前：在源/演练栈 quiesced 状态下跑扫描，保存 baseline 报告。
- 恢复后：对隔离栈再跑同一命令，比较 `chains[]`、blob 数、error/unverified；任何差异都要记录。
- 若恢复后 exit 3，先补齐扫描映射或标注“未验证”，**不得**把 unknown 写成 clean。
- 破坏性模拟（删 drill 栈对象/行）只能在 `DR-DRILL.md` 的隔离流程与 HITL 下做；
  本切片未执行任何破坏性演练。

## 9. 故障排查

| 症状 | 处理 |
|---|---|
| exit 2：`configure a metadata source` | 传 `--db-snapshot` 或 `--db-mode docker|psql` |
| exit 2：`account key` | 设置 `--blob-key-env` 指向的环境变量；不要用命令行密钥 |
| exit 3：`no Hub ledger tables found` | 检查 `--db-schema`/库名/容器；确认是隔离 Hub 库 |
| exit 3：`changesets has no filePath` | 该 Hub 版本的 blob 列名不同；扩展适配器/用 snapshot，不要猜路径 |
| exit 3：`baseline-not-mapped` | 给 `--baseline-path-template` 或改用 JSON snapshot 显式映射 |
| exit 3：`*--inventory-unavailable` | 对应表不存在或未导出；补表/导出后重跑 |
| exit 1：`orphan-blob` 大量出现 | prefix 太宽（含 checkpoint 块/tile）；缩到账本专属前缀 |
| Azure 403 | SharedKey 账户/密钥/endpoint 不匹配；确认账号名与容器 |
| psql 连接失败 | 检查 `PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD`；工具用 `-w` 不会提示 |
| 报告被误加入 git | 立即移除；报告可能含客户模型标识，只能进私有证据库 |

## 10. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-24 | Skeleton v1：只读扫描核心、Postgres/目录/Azure 适配器、JSON+Markdown、24 个 `node:test`（含 mock Postgres/Azurite）；live Hub 未验证；未执行修复或破坏性演练 |
| 2026-11-24 | 隔离 drill 实测修复：① Azure path-style 端点 SharedKey 规范化按 Azure SDK 前置 account（`/account/account/...`），修复 Azurite 403；② `buildReadOnlySql` 保留 SELECT 终止分号，修复 Postgres `syntax error near "COMMIT"`。两处均有单测；未对生产 Hub 执行 |
