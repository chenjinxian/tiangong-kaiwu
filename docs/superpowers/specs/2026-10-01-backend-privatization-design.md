# 后端私有化与产物分发机制设计（backend privatization）

- **日期**：2026-10-01
- **状态**：已确认（四节设计经逐节确认）
- **背景需求**：luban-cad 前端开源；全部后台服务（modeling-server / webhook-agent / imodelhub-services）不开源；任何人（Windows）可在不开源后端源码的前提下快速、方便地起服务使用 luban-cad。

## 1. 决策记录（用户裁决，不可翻案项）

| # | 决策点 | 裁决 |
|---|---|---|
| D1 | 私有项目组织 | **合并为一个私有仓** `luban-backend`（`D:\Github\luban-backend\`），内含 modeling-server/ + webhook-agent/ 两目录 |
| D2 | link: 依赖解析 | **兄弟目录 link:**：私有仓内 link: 改为 `../../tiangong-kaiwu/...`，指向公开仓并排检出（与 imodelhub-services 先例同模式） |
| D3 | 公开仓历史 | **git filter-repo 彻底清除**两服务路径并 force push（代码从公开面完全消失） |
| D4 | MS 分发形态 | **宿主 Windows 先行**（产物 zip：dist + hoisted node_modules + 本地编译 imodeljs-win32-x64 + slvs.node）；Linux 原生编译为后续演进，非本期目标 |
| D5 | 分发渠道 | **GHCR（WA/imodelhub 镜像）+ GitHub Releases（MS 产物 zip）**；产物不入公开仓 git 历史 |

## 2. 终态架构

```
D:\Github\
├─ tiangong-kaiwu\            ← 公开仓（public）：luban-cad 开源前端 + itwinjs-core fork
│   ├─ itwinjs-core/            保留（前端 link: 源码依赖）
│   ├─ luban-cad/               保留（开源主体）
│   ├─ docker-compose.yml       改造（§4.2）
│   ├─ scripts/                 改造（§4.3）
│   ├─ deploy/                  保留（nginx）
│   ├─ dist-backend/            MS 产物解压落点（.gitignore，不入库）
│   └─ docs/                    改写（§4.4）
│
├─ luban-backend\             ← 新私有仓：全部闭源后端
│   ├─ modeling-server/         link: 改写（§3.2）
│   ├─ webhook-agent/           link: 改写（§3.2）
│   ├─ scripts/
│   │   ├─ build-images.ps1     staging 组装 → docker build（WA/imodelhub）
│   │   ├─ build-ms-dist.ps1    MS 产物 zip 打包
│   │   ├─ replace-imodeljs-native.ps1（私有仓版，或公开仓脚本参数化后的薄封装）
│   │   └─ publish.ps1          ①镜像 push GHCR ②MS zip 上传 Releases
│   ├─ CLAUDE.md                后端开发准则（自公开仓根 CLAUDE.md 拆出后端部分）
│   └─ README.md                bootstrap（前置 = 公开仓并排检出 + rush build）
│
└─ imodelhub-services\        ← 原样仓外私有（本就未入公开仓）；仅 Dockerfile 多阶段化 + 镜像推 GHCR
```

**验证者体验（终态，4+2 条命令）**：

```powershell
git clone https://github.com/chenjinxian/tiangong-kaiwu
powershell -File scripts/generate-env.ps1      # 密钥（幂等）
powershell -File scripts/fetch-backend.ps1     # 下载 MS 产物 zip → dist-backend/ + docker compose pull
docker compose up -d                           # 8 容器（WA/imodelhub 走 GHCR 镜像）
powershell -File scripts/start-ms-host.ps1     # 宿主 MS :4001（产物模式，零 install/build）
powershell -File scripts/verify-stack.ps1      # 全栈验收
```

（8 容器 + 宿主 MS = 全栈；MS 形态裁决沿用 2026-09-27 Task 3。）

## 3. 私有仓设计

### 3.1 历史继承（subtree split，非裸 copy）

```bash
# 公开仓内（filter-repo 之前执行）
git subtree split --prefix=modeling-server -b split-ms
git subtree split --prefix=webhook-agent -b split-wa
# 私有仓 init 后分别 merge 两条历史线
```

- native 攻坚 / M2 的 43+15 个提交谱系完整带入私有仓；filter-repo 后私有仓成为这段工程历史的唯一持有地。
- 私有仓 remote（如 `chenjinxian/luban-backend`，private）。

### 3.2 link: 依赖改写

两服务 package.json：

- `link:../itwinjs-core/<pkg>` → `link:../../tiangong-kaiwu/itwinjs-core/<pkg>`
- `link:../luban-cad/packages/shared` → `link:../../tiangong-kaiwu/luban-cad/packages/shared`

- 公开仓单份 itwinjs-core 检出，rush build 产物被前端与私有后端**只读共享**。
- 已知坑沿用并写入私有仓 README：`CI=true`（非交互 install）、禁 `pnpm add`（link: 重解析陷阱，加依赖须手改 package.json + `corepack pnpm@10 install --no-frozen-lockfile` + 核对 lockfile link: 计数）、rush store 路径（`last-install.flag`）、`@luban-cad/shared` 需先构建 dist。
- 防呆：bootstrap 检查 `../../tiangong-kaiwu/itwinjs-core` 存在性，缺失即报"先检出公开仓并 rush build"。

### 3.3 密钥单源

- 唯一源仍是**公开仓根 `.env`**（`generate-env.ps1` 生成）。
- 私有仓两服务 dotenv 解析改为向上查找 `../../tiangong-kaiwu/.env`（dev 与产物模式同一路径约定；config 模块相对解析，不依赖 CWD）。

### 3.4 原生二进制

- `replace-imodeljs-native.ps1` 语义不变（硬门槛版本 tag 校验等），落点改为私有仓 `modeling-server/node_modules`；实现上脚本参数化 `-MsDir` 或私有仓持薄封装副本。
- `slvs.node` 随源码树走（node-gyp 在私有仓内重编译；`LUBAN_SLVS_NODE` 环境变量机制不变，产物形态复用）。

## 4. 公开仓改造

### 4.1 filter-repo

执行序内置于 §6 第 3 步，要点：

```bash
git clone --mirror . ../tiangong-kaiwu.mirror.bak    # 全量备份
git filter-repo --path modeling-server --path webhook-agent --invert-paths
git push --force origin main
```

- **itwinjs-core subtree 谱系是最大风险点**：hash 重写但拓扑保留；重写后必须演练 `scripts/sync-from-upstream.sh`（§6 第 5 步验收 5）。降级预案：若 subtree pull 谱系断裂，以 `git subtree add --prefix=itwinjs-core` 重新初始化谱系（丢历史连续性，保功能）。
- 诚实约束：GitHub 服务端旧 SHA 缓存仍可能被访问一段时间；如需物理彻底清除须联系 GitHub support。建议节奏：先转 private → 确认 → 再 public。
- 工作区未跟踪 test 资产（`itwinjs-core/test-apps/display-test-app/assets/*.bim*` 等）与 filter-repo 无关，动手前先清理或另行处理。

### 4.2 docker-compose.yml

| 服务 | 改造 |
|---|---|
| webhook-agent | `build:` 段删除 → `image: ghcr.io/chenjinxian/luban-webhook-agent:latest` |
| imodelhub | `build:` 段删除 → `image: ghcr.io/chenjinxian/imodelhub:latest` |
| modeling-server（profiles: container） | 整段移除（镜像构建属私有仓事务） |
| postgres / redis / maildev / azurite / web / nginx | 不动 |

### 4.3 scripts/

| 脚本 | 改造 |
|---|---|
| `fetch-backend.ps1`（新增） | `gh release download --repo chenjinxian/tiangong-kaiwu --pattern '*.zip'`（默认最新 Release）→ 解压 `dist-backend/modeling-server/` → `docker compose pull`；幂等 |
| `start-ms-host.ps1` | 双模式：**产物模式**（默认；检测 `dist-backend/modeling-server/` 存在 → 直接 `node dist/main.js`，零 install/build）/**源码模式**（`-Source <luban-backend 路径>`，现有 install/build/start 流程，供私有仓开发者） |
| `verify-stack.ps1` / `generate-env.ps1` | 经 compose 抽象，核对路径引用即可，预期零/微改 |
| `sync-from-upstream.sh` | 不改；filter-repo 后演练验证 |
| `.gitignore` | 追加 `dist-backend/` |

镜像 tag 双轨：`backend-YYYYMMDD`（日期版）+ `latest`。

### 4.4 文档改写

- 根 CLAUDE.md：仓库布局表去掉两服务行（改私有仓指引一句话 + 产物使用指引）、命令节删除后端 dev 命令、常见坑拆分（link: 类坑移私有仓 README）。
- README、docs/Architecture.md、docs/Deployment-Guide.md：部署口径改产物链路（fetch-backend → compose → start-ms-host）。
- docs/UPSTREAM_SYNC.md、docs/ITWINJS_CORE_MODIFICATIONS.md：保留不动。
- `luban-cad/apps/web` package.json：`start:modeling-server` 脚本移除（`start` 改单进程前端）；文档说明后端另起。
- **文档暴露面（默认保留，用户审阅时可改）**：`docs/superpowers/` 与 `.superpowers/sdd/` 中 native-assault、M2 等报告不含源码本体但含后端实现细节（sweep 双因子、ACIS 线程模型等）。默认随公开仓保留；若视为敏感，可将高细节文档移私有仓（届时公开仓引用改为指向私有仓）。

## 5. 发布机制（私有仓 `scripts/publish.ps1`）

```
publish.ps1 [-Tag backend-YYYYMMDD]
 ├─ ① build-images.ps1
 │    staging 组装：拷公开仓 itwinjs-core/ + luban-cad/packages/（.dockerignore 裁剪）
 │              + 服务源码 → staging/<svc>/ → docker build
 │    WA：复用现有 Dockerfile（复刻布局 + hoisted + NODE_PRESERVE_SYMLINKS，首次实测）
 │    imodelhub：先在其仓多阶段化 Dockerfile（builder 编译；运行层仅 COPY dist + node_modules，源码不进镜像层）
 │    tag：ghcr.io/chenjinxian/{luban-webhook-agent,imodelhub}:{Tag,latest}
 ├─ ② docker push（gh auth token | docker login ghcr.io 一次配置）
 ├─ ③ build-ms-dist.ps1
 │    私有仓 modeling-server：hoisted 独立安装 node_modules（实体拷贝、无跨仓 symlink）
 │    + tsc dist（核对 sourceMap=false，防源码随 sourcemap 泄露）
 │    + replace-imodeljs-native 后的 win-x64 原生二进制 + slvs.node
 │    → modeling-server-win-x64-<Tag>.zip（不含 .env）
 └─ ④ gh release create <Tag> --repo chenjinxian/tiangong-kaiwu *.zip
```

**已知风险预告**：两 Dockerfile 文件头自述"本机 Docker 不可用，未实测"——①步即首次真实验证（~600 包闭包、构建时长、frozen-lockfile 解析）。

## 6. 执行顺序与测试计划

执行序（先建设、后破坏、终验证；每步可独立回退）：

1. **建私有仓**：split 双历史线 merge → 改 link: → bootstrap → 测试 → dev 冒烟（公开仓原封未动）
2. **打通产物链路**：build-images + push GHCR；build-ms-dist + Release 上传
3. **公开仓 filter-repo**（§4.1，mirror 备份先行）
4. **公开仓改造**（§4.2–4.4）
5. **全新 clone 端到端验证**

| # | 测试层 | 内容 | 通过标准 |
|---|---|---|---|
| 1 | 私有仓回归 | MS 30 测试文件 + WA 10 文件（vitest run） | 零回归（与移出前同绿） |
| 2 | 产物冒烟 | MS 产物目录独立起（health + "using dev build" 横幅 + 一个建模 op）；WA/imodelhub 容器 health | 全 200 |
| 3 | 全栈验收 | 全新 clone 公开仓 → §2 命令流 → `verify-stack.ps1` | 全绿（health×5 / 数据链 / WS 握手 / 横幅） |
| 4 | 前端 | apps/web 单测 + e2e（13 spec 对全栈跑） | 通过 |
| 5 | 谱系演练 | filter-repo 后 `sync-from-upstream.sh` 干跑 | subtree pull 可续（或触发降级预案并记录） |

**回退预案**：公开仓 mirror 备份随做随新，任何意外整体还原；私有仓独立于公开仓存在，公开仓事故不影响后端资产。

## 7. 非目标

- 不做 imodel-native / slvs 的 Linux 编译（全容器化留待后续演进）。
- 不改变 imodelhub-services 仓库归属（仓外私有原样；仅改其 Dockerfile + 镜像化）。
- 不做镜像构建 CI 化（风险 #12 CI 缺位另行立项；本期发布=私有仓本地脚本手动执行）。
- 不混淆/加固 JS 产物（dist 为可读 tsc 输出，接受产物级"技术可读"现实；法律面以闭源仓 + 无源码分发界定）。
