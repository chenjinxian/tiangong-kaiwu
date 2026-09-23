FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g @microsoft/rush
COPY open-cloud-cad/ ./open-cloud-cad/
COPY common/ ./common/
COPY rush.json .
RUN rush install --bypass-policy && rush rebuild --to @open-cloud-cad/backend

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/open-cloud-cad/apps/backend/dist ./dist
COPY --from=builder /app/open-cloud-cad/apps/backend/package.json .
COPY --from=builder /app/common ./common
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4001
CMD ["node", "dist/main.js"]
