# ============================================================
# LubanCAD web-next（@luban-cad/web-next）镜像 —— M5-T9 切换冲刺
#
# 与 apps/web 的 luban-cad/Dockerfile 同构（link: 源码消费的容器化方案已在
# 旧镜像上验证），差异四处：
#   1. 构建段 base=node:22-alpine（下方注）；构建过滤面 --filter
#      @luban-cad/web-next...（shared → viewer-next → web-next 拓扑序；
#      editor-frontend 不重建——其 lib/ 由宿主预构建、随 context 进入镜像，
#      与旧镜像同口径）
#   2. docker-closure 走查起点：web-next 的 link: 闭包（apps/web-next +
#      shared + viewer-next + editor/frontend + editor/common）
#   3. workspace 根 node_modules 的 link: 兜底 farm（M5-T9 实测新增，见
#      该 RUN 注：现行 pnpm hoisted 不再把 link: 依赖平铺到根）
#   4. 构建后硬断言 dist/scripts/parse-imdl-worker.js 在场且与
#      itwinjs-core/core/frontend/lib/public/scripts/ 源 cmp 逐字节一致
#      （publicPath 铁律守卫：publicPath:'/' 下 core-frontend 的 ImdlParser 按
#      `<origin>/scripts/parse-imdl-worker.js` 取 tile 解码 worker；该文件
#      缺失时 SPA 回退返回 index.html 当 JS——worker 静默死亡、几何渲染
#      不出（2026-10-09/2026-10-22 两代实证）；在场但漂移 = worker 与 lib/esm
#      主包版本错配，同类炸面。文件本体由 apps/web-next/public/scripts/
#      提供（vite publicDir 随构建拷贝，dev :5300 同路受益），快照源 =
#      itwinjs-core/core/frontend/lib/public/scripts/parse-imdl-worker.js——
#      **itwinjs-core 上游同步/重编译后须重拷对齐**（同 apps/web 先例，
#      已登记 UPSTREAM_SYNC 检查单）。此断言防「public/ 被误删仍构建成功」
#      与「快照陈旧仍构建成功」两类静默绿。
#
# 构建上下文必须是【仓库根】（.dockerignore 白名单裁剪）：web-next 经
# pnpm link: 消费 itwinjs-core 源码 + 宿主 rush build 产物 lib/。
#   docker build -f luban-cad/apps/web-next/Dockerfile <仓库根>
# （根 docker-compose.yml 的 web 服务已按此配置 build。）
#
# 布局说明：容器内以 /build 复刻仓库相对布局（/build/luban-cad +
# /build/itwinjs-core），使 lockfile 中的 link: 相对路径原样可解析。
# 安装用 --config.node-linker=hoisted：Vite/tsc 会沿 realpath 解析
# linked 包的依赖，hoisted 平铺 + /build/node_modules 回退软链
# 让 itwinjs 真实路径的向上查找命中依赖。
# ============================================================
# 源版本内嵌（B2 2026-10-26）：rebuild-web.ps1 经 `docker compose build
# --build-arg GIT_COMMIT=<sha>` 注入（手工 compose build 未注入时留缺省
# unknown）。只进运行段 LABEL 元数据，不参与任何 RUN——层缓存不受影响
# （构建缓存命中与有无 GIT_COMMIT 无关）。verify-stack.ps1 Step E 用该标签
# 做镜像陈旧检测；无标签/unknown 时退化为「镜像 Created vs 最新源提交」时间比较。
ARG GIT_COMMIT=unknown

# 构建段 base=node:22-alpine（M5-T9 brief 钉死；本机构建缓存常驻——旧镜像的
# node:20-bookworm-slim 需外网拉取。构建面纯 JS 工具链（pnpm/vite/tsc/esbuild
# 有 musl 变体），无 glibc 依赖）
FROM node:22-alpine AS builder

ENV CI=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 复刻仓库布局（link: 相对路径逐字对齐宿主）
COPY itwinjs-core/ /build/itwinjs-core/
COPY luban-cad/ /build/luban-cad/

# 给 itwinjs 真实路径提供 node_modules 向上查找的落点
RUN ln -s /build/luban-cad/node_modules /build/node_modules

# itwinjs-core d.ts/js 链解析锚点：.dockerignore 排除了各包自带的 node_modules
# （rush 现场），IModelConnection.d.ts/js 等内部对 @itwin/* 工作区包的导入会
# 从真实路径向上 walk-up——必须在 itwinjs-core 树根建集中 symlink farm 兜底，
# 否则 tsc skipLibCheck 下静默丢基类成员（TS2339）、vite 打包报
# "Rollup failed to resolve import"。按各包 package.json 的 name 动态建链
# （覆盖 ecschema-rpcinterface-common 等非直觉命名；editor/* 自 2026-10-22
# 收编 luban-cad/packages/editor 后 fork 内无此目录，glob 空转无害）
RUN mkdir -p /build/itwinjs-core/node_modules \
 && cd /build/itwinjs-core \
 && for d in core/* core/*/* editor/* editor/*/* presentation/* presentation/*/* ui/* ui/*/*; do \
      if [ -f "/build/itwinjs-core/$d/package.json" ]; then \
        name=$(node -p "try{require('/build/itwinjs-core/$d/package.json').name}catch(e){''}" 2>/dev/null); \
        if [ -n "$name" ] && [ "$name" != "undefined" ]; then \
          mkdir -p "/build/itwinjs-core/node_modules/$(dirname "$name")"; \
          ln -sfn "/build/itwinjs-core/$d" "/build/itwinjs-core/node_modules/$name"; \
        fi; \
      fi; \
    done

WORKDIR /build/luban-cad
# 冻结 lockfile（lockfile 的 link: 导入器与 /build 布局一致）
RUN corepack pnpm@10 install --frozen-lockfile --config.node-linker=hoisted

# link: 目标的 registry 依赖闭包：pnpm install 不解析 link: 目标的 dependencies
# （fuse.js 等 core-frontend 的 registry 依赖缺失，vite 打包报
# "Rollup failed to resolve import"）。docker-closure.cjs 自动发现 link: 依赖
# 并递归走查输出 pnpm add 清单；web-next 闭包内各包分别跑一遍后去重。
# 布局里 itwinjs-core 树根的 symlink farm 已覆盖 @itwin/* 工作区包解析，
# 此处只需 --emit 阶段（无需 --link）
ENV CLOSURE_REPO_ROOT=/build
RUN { (cd apps/web-next && node ../../docker-closure.cjs --emit); \
      (cd packages/shared && node ../../docker-closure.cjs --emit); \
      (cd packages/viewer-next && node ../../docker-closure.cjs --emit); \
      (cd packages/editor/frontend && node ../../docker-closure.cjs --emit); \
      (cd packages/editor/common && node ../../docker-closure.cjs --emit); \
    } | tr ' ' '\n' | sed '/^$/d' | sort -u > /tmp/closure-add.txt \
 && (test -s /tmp/closure-add.txt \
     && xargs corepack pnpm@10 add -w --config.node-linker=hoisted < /tmp/closure-add.txt \
     || true)

# workspace 根 node_modules 的 link: 兜底 farm（M5-T9 实测新增，旧镜像构建期
# 不需要）：现行 pnpm（10.34）hoisted 布局只把 registry 依赖平铺到 workspace
# 根，link: 依赖的 symlink 留在各包本地 node_modules——根平铺的 registry 包
# （@itwin/imodels-access-frontend 等）import @itwin/core-bentley 时 walk-up
# 够不到 packages/*/node_modules，vite 报 "Rollup failed to resolve import"。
# 在根 node_modules 补齐 itwinjs-core 全部包 + luban-cad workspace 包的
# symlink（与上方 itwinjs-core 树根 farm 同理；目标与各包本地 link 同一
# realpath——单实例，无 instanceof 断裂面）。
RUN mkdir -p /build/luban-cad/node_modules \
 && cd /build \
 && for d in itwinjs-core/core/* itwinjs-core/core/*/* itwinjs-core/editor/* itwinjs-core/editor/*/* \
             itwinjs-core/presentation/* itwinjs-core/presentation/*/* itwinjs-core/ui/* itwinjs-core/ui/*/* \
             luban-cad/packages/* luban-cad/packages/editor/*; do \
      if [ -f "/build/$d/package.json" ]; then \
        name=$(node -p "try{require('/build/$d/package.json').name}catch(e){''}" 2>/dev/null); \
        if [ -n "$name" ] && [ "$name" != "undefined" ]; then \
          mkdir -p "/build/luban-cad/node_modules/$(dirname "$name")"; \
          ln -sfn "/build/$d" "/build/luban-cad/node_modules/$name"; \
        fi; \
      fi; \
    done \
 && test -e /build/luban-cad/node_modules/@itwin/core-bentley \
 && test -e /build/luban-cad/node_modules/@luban-cad/viewer-next

# 依拓扑序构建 web-next 及其 workspace 依赖（shared → viewer-next → web-next），
# 构建后硬断言 worker 快照在静态根且与 core/frontend/lib/public 源逐字节一致
# （publicPath 铁律 + 字节对齐守卫：文件在场但漂移 = worker 与 lib/esm 主包
# 版本错配，同样静默炸在 tile 解码——两文件同 context 同源，不存在合法
# 不一致态；上游同步/重编译后重拷对齐，见文件头注 4 与 UPSTREAM_SYNC 检查单）
RUN corepack pnpm@10 -r --filter @luban-cad/web-next... run build \
 && { test -f /build/luban-cad/apps/web-next/dist/scripts/parse-imdl-worker.js \
        && cmp /build/luban-cad/apps/web-next/dist/scripts/parse-imdl-worker.js \
               /build/itwinjs-core/core/frontend/lib/public/scripts/parse-imdl-worker.js; } \
 || { echo "FATAL: dist/scripts/parse-imdl-worker.js 缺失或与 core/frontend/lib/public 漂移（publicPath 铁律字节对齐断言）——重拷 apps/web-next/public/scripts/ 快照（见 README）"; exit 1; }

# ---------- 运行阶段：nginx 静态服务 ----------
FROM nginx:alpine
# ARG 需在本段重声明才能进 LABEL（全局 ARG 不跨 stage 可见）
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"
COPY luban-cad/apps/web-next/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /build/luban-cad/apps/web-next/dist /usr/share/nginx/html
EXPOSE 3000
