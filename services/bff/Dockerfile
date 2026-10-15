# ============================================================
# luban-bff 镜像（RW1-T3）—— BFF v1 薄层（/api JWT 终结 + 限流 + CORS + 反代）
#
# 构建上下文 = services/bff（独立 pnpm 项目，零 link:/零原生依赖，
# 与 MS/WA 的「仓库根上下文」布局无关）。compose 内 build: ./services/bff
#（RW1-T3 Ruling：v1 本仓构建，稳定后再上 GHCR 管线）。
# ============================================================
FROM node:20-bookworm-slim AS builder

ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm@10 install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN corepack pnpm@10 run build

# ---------- 运行阶段 ----------
FROM node:20-bookworm-slim

ENV NODE_ENV=production
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm@10 install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

EXPOSE 4003
USER node
CMD ["node", "dist/server.js"]
