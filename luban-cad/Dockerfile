# ============================================================
# LubanCAD 前端（@luban-cad/web）镜像
#
# 构建上下文必须是【仓库根】，因为 apps/web 与 packages/* 通过
# pnpm `link:../../../itwinjs-core/...` 消费 itwinjs-core 源码 +
# 宿主 rush build 产物（lib/）。根 .dockerignore 负责裁剪 context。
#
# 前置（宿主一次性）：
#   1. itwinjs-core 已 rush build 出 lib/（apps/web 的 build:deps 脚本，
#      含 presentation-frontend / presentation-common —— 当前宿主缺这两个
#      的 lib/ 时镜像构建会在 tsc 阶段报 TS2307，重跑 build:deps 即可）
#   2. docker build 从仓库根执行（根 compose 已配好）
#
# 布局说明：容器内以 /build 复刻仓库相对布局（/build/luban-cad +
# /build/itwinjs-core），使 lockfile 中的 link: 相对路径原样可解析。
# 安装用 --config.node-linker=hoisted：Vite/tsc 会沿 realpath 解析
# linked 包的依赖，hoisted 平铺 + /build/node_modules 回退软链
# 让 itwinjs 真实路径的向上查找命中依赖。
# ============================================================
FROM node:20-bookworm-slim AS builder

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
# （覆盖 ecschema-rpcinterface-common 等非直觉命名；宿主构建能过是因为
# core/*/node_modules 在场）
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
# 并递归走查输出 pnpm add 清单；workspace 各包（apps/web + packages/*）分别
# 跑一遍后去重。布局里 itwinjs-core 树根的 symlink farm 已覆盖 @itwin/*
# 工作区包解析，此处只需 --emit 阶段（无需 --link）
ENV CLOSURE_REPO_ROOT=/build
RUN { (cd apps/web && node ../../docker-closure.cjs --emit); \
      (cd packages/shared && node ../../docker-closure.cjs --emit); \
      (cd packages/viewer-core && node ../../docker-closure.cjs --emit); \
      (cd packages/web-viewer && node ../../docker-closure.cjs --emit); \
    } | tr ' ' '\n' | sed '/^$/d' | sort -u > /tmp/closure-add.txt \
 && (test -s /tmp/closure-add.txt \
     && xargs corepack pnpm@10 add -w --config.node-linker=hoisted < /tmp/closure-add.txt \
     || true)

# 依拓扑序构建 web 及其 workspace 依赖（shared → viewer-core → web-viewer → web）
RUN corepack pnpm@10 -r --filter @luban-cad/web... run build

# ---------- 运行阶段：nginx 静态服务 ----------
FROM nginx:alpine
COPY luban-cad/apps/web/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /build/luban-cad/apps/web/dist /usr/share/nginx/html
EXPOSE 3000
