# 后端私有化与产物分发 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 modeling-server / webhook-agent 移入私有仓 `luban-backend`，公开仓历史彻底清除两目录，建立 GHCR 镜像 + Releases 产物分发链路，使任何人可在不开源后端源码的前提下 4 条命令起全栈。

**Architecture:** 私有仓以 subtree split 继承双服务完整历史，link: 依赖改指向并排检出的公开仓（`../../tiangong-kaiwu/...`）；webhook-agent/imodelhub 以镜像分发（ghcr.io），modeling-server 以 Windows 宿主产物包分发（GitHub Releases）；公开仓 filter-repo 清史后改造 compose/脚本/文档，最终以全新 clone 模拟外部验证者完成五层验收。

**Tech Stack:** git subtree/filter-repo、pnpm 10（hoisted node-linker）、Docker、GitHub CLI（gh）、PowerShell 5.1、tar（bsdtar，Windows 自带）。

**Spec:** `docs/superpowers/specs/2026-10-01-backend-privatization-design.md`（执行本计划前先读 spec；决策 D1-D5 不可翻案）

## Global Constraints

- 私有仓路径固定 `D:\Github\luban-backend`，公开仓 `D:\Github\tiangong-kaiwu`，imodelhub `D:\Github\imodelhub-services`，imodel-native `D:\Github\imodel-native`（兄弟目录约定，spec D2）。
- GHCR owner 一律 `chenjinxian`；镜像双 tag `backend-YYYYMMDD` + `latest`。
- 禁止在 link: 项目用 `pnpm add`；装依赖 = `corepack pnpm@10 install`（必要时 `--no-frozen-lockfile`），非交互加 `CI=true`。
- 产物不得包含 `.env`、sourcemap（`sourceMap=false`）、后端 TS 源码。
- MS 分发形态 = Windows 宿主（spec D4）；不做 Linux 原生编译。
- 公开仓任何 git 历史重写前必须先做 mirror 备份。
- 本机 pnpm 未全局安装，一律 `corepack pnpm@10`。

---

### Task 1: 私有仓创建与历史继承

**Files:**
- Create: `D:\Github\luban-backend\`（git 仓）
- Create: `D:\Github\luban-backend\.gitignore`

**Interfaces:**
- Produces: 私有仓 main 分支，含 `modeling-server/`、`webhook-agent/` 两目录完整历史（供 Task 2 起步）；公开仓本地多出 `split-ms`/`split-wa` 两个本地分支（不 push，Task 6 前删除）。

- [x] **Step 1: 确认公开仓工作区干净**

```bash
git -C /d/Github/tiangong-kaiwu status --porcelain
```
Expected: 仅 itwinjs-core/test-apps 下未跟踪 .bim 资产（Task 6 处理），无已跟踪文件改动。

- [x] **Step 2: subtree split 两条历史线**

```bash
cd /d/Github/tiangong-kaiwu
git subtree split --prefix=modeling-server -b split-ms
git subtree split --prefix=webhook-agent -b split-wa
```
Expected: 各输出 `Created branch split-ms`（43 个提交）/`split-wa`（15 个提交）。用 `git log --oneline split-ms | wc -l` 核对提交数不为零。

- [x] **Step 3: 初始化私有仓并合并历史**

subtree split 分支的**树根 = 原目录内容**（无 modeling-server/ 前缀），故每条线先 merge 连通历史、再 `git mv` 归位子目录（两条线的顶层文件同名——package.json 等——必须先归位再 merge 第二条，避免 add/add 冲突）：

```bash
mkdir -p /d/Github/luban-backend && cd /d/Github/luban-backend
git init -b main
git commit --allow-empty -m "chore: 私有仓初始化"
git fetch ../tiangong-kaiwu split-ms:split-ms split-wa:split-wa

# --- modeling-server 历史线 ---
git merge --allow-unrelated-histories --no-commit split-ms
git commit -m "merge: modeling-server 历史线（subtree split 继承）"
mkdir modeling-server
ls -A | grep -vx -e modeling-server -e .git | xargs -I{} git mv {} modeling-server/
git commit -m "chore: modeling-server 归位子目录"

# --- webhook-agent 历史线（此时根上只有 modeling-server/，无同名冲突）---
git merge --allow-unrelated-histories --no-commit split-wa
git commit -m "merge: webhook-agent 历史线（subtree split 继承）"
mkdir webhook-agent
ls -A | grep -vx -e modeling-server -e webhook-agent -e .git | xargs -I{} git mv {} webhook-agent/
git commit -m "chore: webhook-agent 归位子目录"
git branch -D split-ms split-wa
```

- [x] **Step 4: 写私有仓 .gitignore**

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
*.log
.env
.env.*
!.env.example
# slvs node-gyp 构建产物
modeling-server/native/slvs/build/
webhook-agent/data/
# 发布 staging（Task 3 起）
staging/
```

- [x] **Step 5: 验证历史继承**

```bash
git log --oneline | head -5 && ls modeling-server/src webhook-agent/src | head -20
```
Expected: 看到 native 攻坚 / M2 的提交（如 `792df58` 系消息），两服务 src 齐全。

- [x] **Step 6: Commit**

```bash
git add .gitignore && git commit -m "chore: 私有仓 .gitignore"
```

---

### Task 2: 私有仓 link: 改写 + env 兜底 + bootstrap + 回归绿

**Files:**
- Modify: `luban-backend/modeling-server/package.json`（dependencies 7 处 link:）
- Modify: `luban-backend/webhook-agent/package.json`（dependencies 6 处 link:）
- Modify: `luban-backend/modeling-server/src/config.ts:10-32`（loadRootEnvFile）
- Modify: `luban-backend/webhook-agent/src/config.ts`（同构改造）
- Test: `luban-backend/modeling-server/src/config.test.ts`、`luban-backend/webhook-agent/src/config.test.ts`（追加兄弟仓兜底用例）
- Create: `luban-backend/scripts/copy-native.ps1`（公开仓 replace 脚本薄封装）
- Create: `luban-backend/README.md`、`luban-backend/CLAUDE.md`

**Interfaces:**
- Consumes: 公开仓 itwinjs-core rush build 产物（lib/）、`luban-cad/packages/shared` dist、`scripts/replace-imodeljs-native.ps1` 的 `-ScanRoots` 参数。
- Produces: 私有仓可独立 `pnpm dev`/`pnpm test` 的两服务；`loadRootEnvFile` 支持 `LUBAN_ENV_FILE` 覆盖与兄弟仓 `tiangong-kaiwu/.env` 兜底（Task 4 产物模式复用同一路径约定）。

- [x] **Step 1: 写 env 兜底的失败测试**

两服务 config.test.ts 各追加（写法对齐文件内现有用例风格；用 node:fs mkdtempSync 造临时兄弟布局）：

```ts
it('falls back to sibling tiangong-kaiwu/.env when walking up finds none', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'luban-cfg-'));
  const svcDir = path.join(root, 'luban-backend', 'modeling-server', 'dist');
  fs.mkdirSync(svcDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'tiangong-kaiwu', '.env') /* 先 mkdirSync */, 'PORT=4321\n', { flag: 'w' });
  // 重新加载本模块的 env 解析（模块级副作用，用动态 import + 查询 PORT 默认被覆盖）
  // 注：具体断言手段沿用该测试文件中现有「重新加载 config」的既有模式（如 vi.resetModules + dynamic import）
});
```
（执行者注：先读 config.test.ts 现有结构，按其既有 reset/导入模式补全断言；断言核心 = PORT 读到 4321。）

- [x] **Step 2: 跑测试确认失败**

```bash
cd /d/Github/luban-backend/modeling-server && npx vitest run src/config.test.ts
```
Expected: 新用例 FAIL（当前向上走查不检查兄弟目录）。

- [x] **Step 3: 改两服务 config.ts 的 loadRootEnvFile**

在向上循环内追加兄弟仓检查，并在函数最前加显式覆盖（两服务同构，逐字改）：

```ts
function loadRootEnvFile(): void {
  // Test-only seam: config tests set LUBAN_CONFIG_NO_ENV_FILE=1 so a real
  // repo-root .env (developer machine) cannot leak into the cases under test.
  if (process.env.LUBAN_CONFIG_NO_ENV_FILE === '1') return;
  // Explicit override (private-repo dev / product mode can point anywhere).
  if (process.env.LUBAN_ENV_FILE) {
    try { process.loadEnvFile(process.env.LUBAN_ENV_FILE); } catch { /* malformed file: schema will report */ }
    return;
  }
  // Walk up from this file; at each level also probe the sibling public-repo
  // layout <dir>/tiangong-kaiwu/.env (covers both luban-backend/<svc>/dist
  // and dist-backend/<svc>/dist — both sit under a parent holding the
  // public checkout).
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    const sibling = path.join(dir, 'tiangong-kaiwu', '.env');
    for (const probe of [candidate, sibling]) {
      if (fs.existsSync(probe)) {
        try { process.loadEnvFile(probe); } catch { /* malformed file: schema will report */ }
        return;
      }
    }
    dir = path.dirname(dir);
  }
}
```

- [x] **Step 4: 跑测试确认通过（两服务）**

```bash
cd /d/Github/luban-backend/modeling-server && npx vitest run src/config.test.ts
cd ../../webhook-agent && npx vitest run src/config.test.ts
```
Expected: PASS 全绿。

- [x] **Step 5: 改写两服务 package.json 的 link: 路径**

modeling-server/package.json dependencies 中 6 处 `link:../itwinjs-core/` → `link:../../tiangong-kaiwu/itwinjs-core/`，1 处 `link:../luban-cad/packages/shared` → `link:../../tiangong-kaiwu/luban-cad/packages/shared`。webhook-agent 同理（5 处 itwinjs-core + 1 处 shared）。

- [x] **Step 6: 安装依赖**

前置确认（公开仓内执行）：
```bash
ls /d/Github/tiangong-kaiwu/luban-cad/packages/shared/dist/package.json   # shared 有 dist
ls /d/Github/tiangong-kaiwu/itwinjs-core/core/backend/lib                # rush 产物在
```
缺失则先在公开仓补：`cd luban-cad/packages/shared && corepack pnpm@10 build`；rush 构建见公开仓 CLAUDE.md。

安装：
```bash
cd /d/Github/luban-backend/modeling-server && CI=true corepack pnpm@10 install --no-frozen-lockfile
cd ../webhook-agent && CI=true corepack pnpm@10 install --no-frozen-lockfile
```
核对 lockfile 中 `link:` 计数不变（modeling-server 7、webhook-agent 6）：
```bash
grep -c "link:" modeling-server/pnpm-lock.yaml webhook-agent/pnpm-lock.yaml
```

- [x] **Step 7: slvs 原生插件重编译（仅 modeling-server）**

```bash
cd /d/Github/luban-backend/modeling-server/native/slvs
ls   # 确认 binding.gyp / VENDOR.md 在
npm run build   # 或 node-gyp rebuild（按该目录 README/VENDOR.md 实际命令）
```
（执行者注：VENDOR.md 是新机器 bootstrap 权威；若编译依赖 SolveSpace 源已就位则直接 node-gyp。）

- [x] **Step 8: 原生库替换（薄封装脚本）**

Create `luban-backend/scripts/copy-native.ps1`：

```powershell
# copy-native.ps1 — 调用公开仓 replace-imodeljs-native.ps1，把本地编译的
# imodeljs.node 覆盖到【私有仓】两服务的 node_modules（-ScanRoots 机制）。
# 前置与硬门槛见公开仓 scripts/replace-imodeljs-native.ps1 文件头。
[CmdletBinding()] param(
  [string]$KaiwuRoot = 'D:\Github\tiangong-kaiwu',
  [string]$BackendRoot = 'D:\Github\luban-backend',
  [string]$Config = 'release'
)
$ErrorActionPreference = 'Stop'
& (Join-Path $KaiwuRoot 'scripts\replace-imodeljs-native.ps1') `
  -Config $Config `
  -ScanRoots @((Join-Path $BackendRoot 'modeling-server'), (Join-Path $BackendRoot 'webhook-agent'))
```

执行并验证：

```bash
powershell -File /d/Github/luban-backend/scripts/copy-native.ps1
```
Expected: 输出「发现 N 个安装现场」「已覆盖」「OK: dev build loaded」。

- [x] **Step 9: 全量回归（零回归证明）**

```bash
cd /d/Github/luban-backend/modeling-server && npx vitest run
cd ../../webhook-agent && npx vitest run
```
Expected: MS 30 个测试文件、WA 10 个测试文件全部 PASS（与公开仓移出前同绿；若有既有 skip 维持原状）。

- [x] **Step 10: dev 起服务冒烟（需公开仓根 .env 已生成 + hub/azurite 可达；不可达则改在 Task 8 全栈验证）**

```bash
cd /d/Github/luban-backend/modeling-server && CI=true corepack pnpm@10 dev &   # :4001
curl -s http://127.0.0.1:4001/health
```
Expected: health 200；日志含 "using dev build from" 横幅。

- [x] **Step 11: 写私有仓 README.md 与 CLAUDE.md**

README.md 必含：前置（公开仓并排检出 + `rush build --to ...` + shared `pnpm build`）、bootstrap 命令序列（install→slvs→copy-native→test→dev）、link: 禁 `pnpm add` 等坑清单（从公开仓根 CLAUDE.md「常见坑」移拷后端相关条目）、目录布局。CLAUDE.md 必含：后端开发准则（编辑管道硬约束、事务可撤销、测试口径）+ 指向公开仓 CLAUDE.md 的 itwinjs-core 同步/修改规约。

- [x] **Step 12: Commit（私有仓）**

```bash
cd /d/Github/luban-backend && git add -A
git commit -m "feat: 私有仓起步——link: 改指公开仓兄弟目录 + env 兄弟兜底 + copy-native 封装 + bootstrap 文档"
```

---

### Task 3: 镜像构建（build-images.ps1 + WA 首次实测 + imodelhub 多阶段化）

**Files:**
- Create: `luban-backend/scripts/build-images.ps1`
- Modify: `D:\Github\imodelhub-services\Dockerfile`（多阶段化，在 imodelhub-services 仓提交）
- Consumes: 公开仓 `.dockerignore`（裁剪规则母本）、私有仓两 Dockerfile（随源码树已在 `luban-backend/<svc>/Dockerfile`）。

**Interfaces:**
- Produces: 本地镜像 `ghcr.io/chenjinxian/luban-webhook-agent:<Tag>`、`ghcr.io/chenjinxian/imodelhub:<Tag>`（Task 5 push；Tag 格式 `backend-YYYYMMDD`）。

- [x] **Step 1: imodelhub Dockerfile 多阶段化**

替换 `D:\Github\imodelhub-services\Dockerfile` 为（保持其原有启动脚本/wait-for-it 语义不变）：

```dockerfile
# 多阶段：源码仅存在于 builder，运行层只带 dist + node_modules（防源码入镜像层）
FROM node:22.21.1-alpine AS builder
RUN apk add --no-cache bash && npm i -g typescript
WORKDIR /src
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22.21.1-alpine
RUN apk add --no-cache bash
COPY --from=builder /src/node_modules /usr/src/app/node_modules
COPY --from=builder /src/dist /usr/src/app/dist
COPY --from=builder /src/package.json /usr/src/app/package.json
COPY ./wait-for-it.sh /opt/wait-for-it.sh
COPY ./startup.relational.dev.sh /opt/startup.relational.dev.sh
RUN chmod +x /opt/wait-for-it.sh /opt/startup.relational.dev.sh \
 && sed -i 's/\r//g' /opt/wait-for-it.sh /opt/startup.relational.dev.sh \
 && if [ ! -f /usr/src/app/.env ]; then cp env-example-relational /usr/src/app/.env; fi
WORKDIR /usr/src/app
EXPOSE 4000
CMD ["/opt/startup.relational.dev.sh"]
```
（执行者注：`npm run build` 产物路径以该仓 nest-cli.config 为准，若 dist 输出到别处（如 `dist/src`），COPY 路径相应调整；startup 脚本若引用 src/ 下文件则需一并 COPY。先 `docker build` 验证再提交。）

在 imodelhub-services 仓提交：`git commit -m "build: Dockerfile 多阶段化——运行层不含源码（后端私有化配套）"`

- [x] **Step 2: 写 build-images.ps1（staging 组装 + docker build）**

Create `luban-backend/scripts/build-images.ps1`：

```powershell
# build-images.ps1 — 组装 staging（复刻公开仓根构建上下文布局）并 docker build
# webhook-agent / imodelhub 两镜像。WA 的 Dockerfile 复刻布局机制见其文件头。
[CmdletBinding()] param(
  [string]$KaiwuRoot   = 'D:\Github\tiangong-kaiwu',
  [string]$BackendRoot = 'D:\Github\luban-backend',
  [string]$HubRoot     = 'D:\Github\imodelhub-services',
  [string]$Tag         = "backend-$(Get-Date -Format 'yyyyMMdd')"
)
$ErrorActionPreference = 'Stop'

# --- WA staging：itwinjs-core(裁剪) + luban-cad/packages + webhook-agent + .dockerignore ---
$staging = Join-Path $BackendRoot 'staging\wa'
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Force "$staging\itwinjs-core" | Out-Null
# itwinjs-core 仅拷被 link: 引用的四个子树（对齐公开仓 .dockerignore 白名单），排除 common/node_modules
robocopy "$KaiwuRoot\itwinjs-core\core"        "$staging\itwinjs-core\core"        /E /XD node_modules | Out-Null
robocopy "$KaiwuRoot\itwinjs-core\editor"      "$staging\itwinjs-core\editor"      /E /XD node_modules | Out-Null
robocopy "$KaiwuRoot\itwinjs-core\presentation" "$staging\itwinjs-core\presentation" /E /XD node_modules | Out-Null
robocopy "$KaiwuRoot\itwinjs-core\ui"          "$staging\itwinjs-core\ui"          /E /XD node_modules | Out-Null
robocopy "$KaiwuRoot\luban-cad\packages"       "$staging\luban-cad\packages"       /E /XD node_modules dist | Out-Null
robocopy "$BackendRoot\webhook-agent"          "$staging\webhook-agent"            /E /XD node_modules dist data | Out-Null
Copy-Item "$KaiwuRoot\.dockerignore" "$staging\.dockerignore" -Force

docker build -t "ghcr.io/chenjinxian/luban-webhook-agent:$Tag" -t "ghcr.io/chenjinxian/luban-webhook-agent:latest" `
  -f "$staging\webhook-agent\Dockerfile" "$staging"

# --- imodelhub：仓自身即上下文 ---
docker build -t "ghcr.io/chenjinxian/imodelhub:$Tag" -t "ghcr.io/chenjinxian/imodelhub:latest" "$HubRoot"

Write-Host "==> 完成: ghcr.io/chenjinxian/{luban-webhook-agent,imodelhub}:$Tag + latest"
```

- [x] **Step 3: 构建并实测 WA 镜像（Dockerfile 首次真实验证）**

```bash
powershell -File /d/Github/luban-backend/scripts/build-images.ps1
```
Expected: 两镜像 BUILD SUCCESS。已知风险（Dockerfile 自述未实测）：~600 包闭包时长、frozen-lockfile 在 staging 布局下解析——若 frozen-lockfile 失败，核对 staging 内 pnpm-lock.yaml 与布局逐字对齐宿主；构建时长 >10 分钟属预期。

- [x] **Step 4: 镜像冒烟**

```bash
docker run --rm -d --name wa-smoke -p 14002:4002 ghcr.io/chenjinxian/luban-webhook-agent:latest
sleep 10 && curl -s http://127.0.0.1:14002/health ; docker rm -f wa-smoke
```
Expected: health JSON 返回（缺密钥 env 时可能报配置错误——那也证明镜像可起；完整功能验证在 Task 8 全栈）。

- [x] **Step 5: Commit（私有仓）**

```bash
cd /d/Github/luban-backend && git add scripts/build-images.ps1
git commit -m "feat: 镜像构建脚本——staging 复刻布局 + WA/imodelhub 双镜像（WA Dockerfile 首次实测）"
```

---

### Task 4: MS 产物打包（build-ms-dist.ps1）+ 独立冒烟

**Files:**
- Create: `luban-backend/scripts/build-ms-dist.ps1`
- Produces: `luban-backend/dist-out/modeling-server-win-x64-<Tag>.tgz`（Task 5 上传 Releases）

**Interfaces:**
- Consumes: `scripts/copy-native.ps1`（Task 2）、slvs.node（Task 2 Step 7）、公开仓根 `.env`（冒烟时）。
- Produces: 自包含产物树（dist + hoisted 实体 node_modules + win-x64 原生二进制 + slvs.node + package.json），可 `node dist/main.js` 直接运行。

- [x] **Step 1: 写 build-ms-dist.ps1**

```powershell
# build-ms-dist.ps1 — 打包 modeling-server Windows 宿主产物（自包含 tgz）。
# 布局 = <svc>/dist + <svc>/node_modules(hoisted 实体化) + <svc>/native/slvs/build/Release/slvs.node
#        + <svc>/package.json。不含 .env、不含 sourcemap、不含 TS 源码。
[CmdletBinding()] param(
  [string]$KaiwuRoot   = 'D:\Github\tiangong-kaiwu',
  [string]$BackendRoot = 'D:\Github\luban-backend',
  [string]$Tag         = "backend-$(Get-Date -Format 'yyyyMMdd')"
)
$ErrorActionPreference = 'Stop'
$svc = Join-Path $BackendRoot 'modeling-server'
$out = Join-Path $BackendRoot 'dist-out'
$tree = "$out\modeling-server"
if (Test-Path $tree) { Remove-Item -Recurse -Force $tree }
New-Item -ItemType Directory -Force $tree | Out-Null

# 1) 独立 hoisted 安装（prod 依赖，装到产物树）
#    产物树比私有仓服务目录深一级（dist-out\<svc>），link: 前缀须同步加深一级
Copy-Item "$svc\package.json" "$tree\package.json"
(Get-Content "$tree\package.json" -Raw) `
  -replace 'link:\.\./\.\./tiangong-kaiwu/', 'link:../../../tiangong-kaiwu/' | Set-Content "$tree\package.json"
Copy-Item "$svc\pnpm-lock.yaml" "$tree\pnpm-lock.yaml"
Push-Location $tree
  $env:CI='true'
  corepack pnpm@10 install --config.node-linker=hoisted --prod --no-frozen-lockfile
Pop-Location

# 2) tsc 构建（确认 sourceMap=false 后执行）
$sm = (Get-Content "$svc\tsconfig.json" -Raw)
if ($sm -match '"sourceMap"\s*:\s*true') { throw "tsconfig sourceMap=true — 产物禁止 sourcemap" }
Copy-Item "$svc\tsconfig.json" "$tree\tsconfig.json"
Copy-Item "$svc\src" "$tree\src" -Recurse
Push-Location $tree; corepack pnpm@10 exec tsc; Pop-Location
# 编译后剥除源码与构建配置（产物只留 dist + node_modules + 运行所需）
Remove-Item "$tree\src" -Recurse -Force
Remove-Item "$tree\tsconfig.json", "$tree\pnpm-lock.yaml" -Force

# 3) 原生二进制：replace 到产物树 + slvs.node
& (Join-Path $BackendRoot 'scripts\copy-native.ps1') -ScanRootsExtra $tree   # 见 Step 2 注
New-Item -ItemType Directory -Force "$tree\native\slvs\build\Release" | Out-Null
Copy-Item "$svc\native\slvs\build\Release\slvs.node" "$tree\native\slvs\build\Release\"

# 4) 打包：tar dereference（实体化 link: symlink；Windows 自带 bsdtar）
New-Item -ItemType Directory -Force $out | Out-Null
$tgz = "$out\modeling-server-win-x64-$Tag.tgz"
if (Test-Path $tgz) { Remove-Item $tgz }
tar -czf $tgz --dereference -C $out modeling-server
Write-Host "==> 产物: $tgz"
```

**Step 2 注（copy-native 扩展）**：`copy-native.ps1` 追加可选参数 `[string[]]$ScanRootsExtra = @()`，转发给公开仓脚本的 `-ScanRoots`（拼接既有两服务目录）。公开仓脚本 `$patterns` 循环已原生支持任意 ScanRoots 目录。

- [x] **Step 3: 打包 + 产物独立冒烟**

```bash
powershell -File /d/Github/luban-backend/scripts/build-ms-dist.ps1
mkdir -p /tmp/ms-smoke && tar -xzf /d/Github/luban-backend/dist-out/modeling-server-win-x64-*.tgz -C /tmp/ms-smoke
cd /tmp/ms-smoke/modeling-server && LUBAN_ENV_FILE=/d/Github/tiangong-kaiwu/.env node dist/main.js &
curl -s http://127.0.0.1:4001/health
```
Expected: health 200；控制台含 "using dev build from" 横幅（证明 win-x64 替换进产物）。杀进程收尾。

- [x] **Step 4: 泄露面自检**

```bash
tar -tzf /d/Github/luban-backend/dist-out/modeling-server-win-x64-*.tgz | grep -E '\.env$|\.map$|src/.*\.ts$' || echo CLEAN
```
Expected: CLEAN（脚本已在 tsc 后剥除 src/tsconfig/pnpm-lock；无 .env、无 sourcemap、无 TS 源）。

- [x] **Step 5: Commit（私有仓）**

```bash
cd /d/Github/luban-backend && git add scripts/
git commit -m "feat: MS 产物打包——hoisted 实体化 + tar dereference + 泄露面自检"
```

---

### Task 5: 发布流水线（publish.ps1）+ GHCR/Releases 首发

**Files:**
- Create: `luban-backend/scripts/publish.ps1`

**Interfaces:**
- Consumes: Task 3 镜像、Task 4 tgz。
- Produces: `ghcr.io/chenjinxian/luban-webhook-agent` 与 `ghcr.io/chenjinxian/imodelhub` 的 `<Tag>`+`latest` 远端镜像；公开仓 GitHub Release `<Tag>` 附 tgz（Task 7 的 fetch-backend.ps1 依赖）。

- [x] **Step 1: 一次性凭据配置（人工）**

```bash
gh auth status                       # 需已登录且含 write:packages scope
gh auth token | docker login ghcr.io -u chenjinxian --password-stdin
```

- [x] **Step 2: 写 publish.ps1**

```powershell
# publish.ps1 — 后端发布：镜像 push GHCR + MS 产物上传公开仓 Releases
[CmdletBinding()] param(
  [string]$Tag = "backend-$(Get-Date -Format 'yyyyMMdd')",
  [string]$PublicRepo = 'chenjinxian/tiangong-kaiwu'
)
$ErrorActionPreference = 'Stop'
$backend = 'D:\Github\luban-backend'

& (Join-Path $backend 'scripts\build-images.ps1')  -Tag $Tag
& (Join-Path $backend 'scripts\build-ms-dist.ps1') -Tag $Tag

docker push "ghcr.io/chenjinxian/luban-webhook-agent:$Tag"
docker push "ghcr.io/chenjinxian/luban-webhook-agent:latest"
docker push "ghcr.io/chenjinxian/imodelhub:$Tag"
docker push "ghcr.io/chenjinxian/imodelhub:latest"

$tgz = Join-Path $backend "dist-out\modeling-server-win-x64-$Tag.tgz"
gh release create $Tag --repo $PublicRepo --title "$Tag 后端产物" `
  --notes "modeling-server Windows 宿主产物（含本地编译 imodeljs-native dev build + slvs.node）。WA/imodelhub 走 GHCR 镜像同 tag。" $tgz
Write-Host "==> 发布完成: $Tag"
```

- [x] **Step 3: 首发执行 + 验证**

```bash
powershell -File /d/Github/luban-backend/scripts/publish.ps1
gh release view --repo chenjinxian/tiangong-kaiwu        # Release 存在且带 tgz
docker manifest inspect ghcr.io/chenjinxian/luban-webhook-agent:latest   # 远端镜像可拉
```
（注意：此步发布到公开仓的 Release；此时公开仓 filter-repo 尚未执行，无冲突。）

- [x] **Step 4: Commit（私有仓）**

```bash
cd /d/Github/luban-backend && git add scripts/publish.ps1
git commit -m "feat: 发布流水线——GHCR 镜像 push + Releases 产物上传"
```

---

### Task 6: 公开仓 filter-repo 清史 + force push

**Files:**
- Modify: 公开仓 git 历史（全部 152+ 提交重写）
- 不改任何工作区文件（compose/脚本改造在 Task 7）

**Interfaces:**
- Consumes: Task 1 的 split-ms/split-wa 分支（历史已转移，可删）。
- Produces: `origin/main` 上不含 modeling-server/webhook-agent 任何路径与历史；本地工作仓 reset 到新历史（Task 7 在其上继续）。

- [x] **Step 1: 处理未跟踪 test 资产（人工确认）**

```bash
cd /d/Github/tiangong-kaiwu && git status --porcelain
```
对 `itwinjs-core/test-apps/display-test-app/` 下的 .bim/.Tiles 等未跟踪文件：与用户确认删除或保留（与本任务无 git 影响但需清爽起点）。

- [x] **Step 2: mirror 备份**

```bash
cd /d/Github/tiangong-kaiwu
git clone --mirror . ../tiangong-kaiwu.mirror.bak
ls ../tiangong-kaiwu.mirror.bak/refs/heads   # 备份完整
```

- [x] **Step 3: 删除 split 分支（历史已在私有仓）**

```bash
git branch -D split-ms split-wa
```

- [x] **Step 4: filter-repo（在独立 clone 中执行，不动工作仓）**

```bash
git clone /d/Github/tiangong-kaiwu /d/Github/tiangong-kaiwu.rewrite
cd /d/Github/tiangong-kaiwu.rewrite
git filter-repo --path modeling-server --path webhook-agent --invert-paths
git log --all --oneline -- modeling-server webhook-agent | wc -l   # Expected: 0
git remote -v   # filter-repo 已移除 remote，重加：
git remote add origin https://github.com/chenjinxian/tiangong-kaiwu.git
```
（若 git filter-repo 未安装：`pip install git-filter-repo`。）

- [x] **Step 5: force push + 工作仓对齐**

```bash
cd /d/Github/tiangong-kaiwu.rewrite
git push --force origin main
cd /d/Github/tiangong-kaiwu
git fetch origin
git reset --hard origin/main
git status   # 工作区干净（未跟踪资产视 Step 1 决定）
ls modeling-server webhook-agent 2>&1   # Expected: No such file or directory
```

- [x] **Step 6: subtree 谱系即时抽查**

```bash
cd /d/Github/tiangong-kaiwu
git log --oneline --grep "Squashed 'itwinjs-core/'" | head -2   # squash 谱系提交仍在
bash scripts/sync-from-upstream.sh --help 2>/dev/null || head -30 scripts/sync-from-upstream.sh  # 脚本在
```
（完整谱系演练在 Task 8 Step 5。）

- [x] **Step 7: GitHub 侧建议（告知用户，人工）**

建议用户将 GitHub 仓暂设 private → 确认旧 SHA 不可达 → 再转 public；如需物理彻底清除旧提交缓存，联系 GitHub support（spec §4.1 诚实约束）。

---

### Task 7: 公开仓改造（compose/脚本/.gitignore/文档）

**Files:**
- Modify: `docker-compose.yml`（webhook-agent/imodelhub 段；删 modeling-server profile 段）
- Create: `scripts/fetch-backend.ps1`
- Modify: `scripts/start-ms-host.ps1`（双模式）
- Modify: `.gitignore`（+ `dist-backend/`）
- Modify: `CLAUDE.md`、`README.md`、`docs/Architecture.md`、`docs/Deployment-Guide.md`
- Modify: `luban-cad/apps/web/package.json`（删 start:modeling-server）

**Interfaces:**
- Consumes: Task 5 的 GHCR 镜像名与 Release 资产（`gh release download` 默认最新）。
- Produces: 外部验证者 4+2 命令流所需的全部公开仓入口（Task 8 端到端依赖）。

- [x] **Step 1: compose 改造**

`docker-compose.yml` 中 webhook-agent 服务：删除 `build:` 两行（context/dockerfile），改：

```yaml
  webhook-agent:
    image: ghcr.io/chenjinxian/luban-webhook-agent:latest
```

imodelhub 服务：删除 `build:` 两行，改：

```yaml
  imodelhub:
    image: ghcr.io/chenjinxian/imodelhub:latest
```

整段删除 `modeling-server:`（profiles: container）服务定义及其注释块，并删除 volumes 段的 `briefcase-cache:`（其唯一消费者即该段）；文件头注释的「服务清单」「MS 形态裁决」段改写：MS 以 GitHub Releases 产物 + start-ms-host.ps1 产物模式运行，镜像构建属私有仓事务。

- [x] **Step 2: 新增 fetch-backend.ps1**

```powershell
# fetch-backend.ps1 — 拉取后端产物：MS 产物包（Releases）+ compose 镜像（GHCR）。幂等。
[CmdletBinding()] param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$PublicRepo = 'chenjinxian/tiangong-kaiwu'
)
$ErrorActionPreference = 'Stop'
$dest = Join-Path $RepoRoot 'dist-backend'
New-Item -ItemType Directory -Force $dest | Out-Null

Write-Host "==> 下载最新 Release 的 MS 产物 ..." -ForegroundColor Cyan
gh release download --repo $PublicRepo --pattern 'modeling-server-win-x64-*.tgz' --dir $dest --clobber
$tgz = Get-ChildItem "$dest\modeling-server-win-x64-*.tgz" | Sort-Object Name -Descending | Select-Object -First 1
Write-Host "==> 解压 $($tgz.Name) ..."
tar -xzf $tgz.FullName -C $dest
Write-Host "==> 拉取 GHCR 镜像（compose pull）..."
Push-Location $RepoRoot; docker compose pull; Pop-Location
Write-Host "==> 完成: $dest\modeling-server\（start-ms-host.ps1 直接可跑）"
```

- [x] **Step 3: start-ms-host.ps1 双模式**

在 param 区加 `[string]$Source = ''`；启动逻辑前加分支（保持既有 -Detach 语义不变）：

```powershell
if ($Source) {
  # 源码模式：私有仓检出者专用（现有 install/build/start 流程，$MsDir = $Source）
  $MsDir = $Source
} else {
  # 产物模式（默认）：dist-backend\modeling-server，零 install/build
  $MsDir = Join-Path $RepoRoot 'dist-backend\modeling-server'
  if (-not (Test-Path (Join-Path $MsDir 'dist\main.js'))) {
    throw "产物未就绪: $MsDir — 先跑 scripts\fetch-backend.ps1（或 -Source 指私有仓走源码模式）"
  }
}
```
（执行者注：通读 start-ms-host.ps1 现有 install/build/start 三段，产物模式跳过前两段直接进启动段；`corepack pnpm@10` 相关调用仅在源码模式保留。）

- [x] **Step 4: .gitignore 追加**

```
# 后端产物解压落点（fetch-backend.ps1）
dist-backend/
```

- [x] **Step 5: apps/web start 脚本清理**

`luban-cad/apps/web/package.json`：删除 `"start:modeling-server": "cd ../../modeling-server && npm run dev"`；`"start"` 改为 `"cross-env NODE_ENV=development vite"`（run-p 依赖随之移除或保留无害——移除 run-p 引用，若 devDependencies 里 run-p 无其他消费者则一并删）。

- [x] **Step 6: 文档改写**

- 根 `CLAUDE.md`：仓库布局表删 modeling-server/webhook-agent 两行，加一行「后端服务：私有仓 luban-backend（后端源码/发布脚本；产物经 GHCR+Releases 分发，fetch-backend.ps1 拉取）」；「常用命令」删两服务 dev 命令段，加「外部验证者快速起栈」4+2 命令块；「常见坑」中 link:/pnpm add/replace-native 类条目标注「（私有仓适用，见其 README）」。
- `README.md`：架构分工表同步（后端改私有+产物口径）。
- `docs/Architecture.md` / `docs/Deployment-Guide.md`：部署链路改「generate-env → fetch-backend → compose up → start-ms-host → verify-stack」；imodelhub/WA 标注镜像来源 GHCR。
- 不动：`docs/UPSTREAM_SYNC.md`、`docs/ITWINJS_CORE_MODIFICATIONS.md`。

- [x] **Step 7: compose 静态校验 + Commit**

```bash
cd /d/Github/tiangong-kaiwu && docker compose config --quiet && echo COMPOSE-OK
git add -A && git commit -m "feat: 公开仓后端产物化——compose 引 GHCR 镜像 + fetch-backend/start-ms-host 双模式 + 文档改口径"
```

---

### Task 8: 端到端五层验证

**Files:**
- Create: 验证记录 `docs/superpowers/plans/2026-10-01-backend-privatization-verification.md`（结果留痕）

**Interfaces:**
- Consumes: Task 1-7 全部产物。
- Produces: spec §6 五层验收全绿记录（或问题清单回灌修复）。

- [x] **Step 1: 层1 私有仓回归（已在 Task 2 达成，复核一次）**

```bash
cd /d/Github/luban-backend/modeling-server && npx vitest run 2>&1 | tail -3
cd ../../webhook-agent && npx vitest run 2>&1 | tail -3
```
Expected: 两处 Test Files 全 PASS。

- [x] **Step 2: 层2 产物冒烟（MS 独立起 + WA 容器 health）**

```bash
# MS 产物（Task 4 的 tgz 解压树直接起）
cd /tmp/ms-smoke/modeling-server && LUBAN_ENV_FILE=/d/Github/tiangong-kaiwu/.env node dist/main.js &
curl -s http://127.0.0.1:4001/health   # 200 + dev build 横幅
# WA/imodelhub 容器随层3 全栈起，此处免
```

- [x] **Step 3: 层3 全栈验收（模拟外部验证者，全新 clone）**

```bash
cd /d/Github && git clone https://github.com/chenjinxian/tiangong-kaiwu tiangong-kaiwu-e2e
cd tiangong-kaiwu-e2e
powershell -File scripts/generate-env.ps1
powershell -File scripts/fetch-backend.ps1
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
powershell -File scripts/verify-stack.ps1
```
Expected: verify-stack 全绿（health×5 / iTwin/iModel/baseline 数据链 / WS cookie 握手 / dev-build 横幅）。注意全新 clone 无 itwinjs-core rush 产物——fetch-backend 产物模式不需要它们（镜像内自装、MS 产物自包含），这正是"外部验证者零构建"的证明点。

- [x] **Step 4: 层4 前端**

```bash
cd /d/Github/tiangong-kaiwu/luban-cad/apps/web
corepack pnpm@10 install && corepack pnpm@10 test          # 53 单测
npx playwright test                                          # 13 e2e（对层3 全栈）
```
（e2e 环境变量/目标按该目录 playwright.config 既有约定；失败逐例区分「本改造引入」vs「既有问题」。）

- [x] **Step 5: 层5 subtree 谱系演练**

```bash
cd /d/Github/tiangong-kaiwu
bash scripts/sync-from-upstream.sh   # 观察 git subtree pull 是否正常定位基线
```
Expected: subtree pull 正常执行到「无新上游提交」或正常拉取（演练后若引入真实同步，按脚本流程走完并记 UPSTREAM_SYNC.md）。若谱系断裂：触发 spec §4.1 降级预案（`git subtree add --prefix=itwinjs-core` 重新初始化），结果记录在验证文档。

- [x] **Step 6: 写验证记录 + 收尾提交**

`docs/superpowers/plans/2026-10-01-backend-privatization-verification.md`：五层各节的命令、输出要点、通过/失败与处置。清理 `/d/Github/tiangong-kaiwu-e2e`、`/d/Github/tiangong-kaiwu.rewrite`、`/tmp/ms-smoke` 等临时目录。

```bash
cd /d/Github/tiangong-kaiwu && git add docs/superpowers/plans/2026-10-01-backend-privatization-verification.md
git commit -m "docs: 后端私有化五层验证记录——全栈产物链路端到端达成"
```

---

## Self-Review 记录

- **Spec 覆盖**：§2 终态（Task 1/6/7）、§3 私有仓（Task 1/2）、§4 公开仓（Task 6/7）、§5 发布（Task 3/4/5）、§6 执行序与五层测试（Task 8）、§7 非目标（无任务，正确）。无缺口。
- **占位符扫描**：无 TBD/TODO；imodelhub dist 路径与 WA 冒烟两处标了「执行者注」的条件分支说明，均为现场判据而非未决设计。
- **类型/命名一致性**：`build-images.ps1`/`build-ms-dist.ps1`/`publish.ps1`/`fetch-backend.ps1`/`copy-native.ps1`（含 `$ScanRootsExtra`）在 Task 2/3/4/5/7 间引用一致；镜像名 `ghcr.io/chenjinxian/{luban-webhook-agent,imodelhub}` 与 tag `backend-YYYYMMDD` 全文一致；产物名 `modeling-server-win-x64-<Tag>.tgz` 一致（spec 原文 zip，计划改 tgz——原因：link: symlink 须 dereference，bsdtar `--dereference` 原生支持而 Compress-Archive 不可靠；fetch 脚本相应用 `tar -xzf`）。
