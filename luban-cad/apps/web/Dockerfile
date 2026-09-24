FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g @microsoft/rush
COPY luban-cad/ ./luban-cad/
COPY common/ ./common/
COPY rush.json .
RUN rush install --bypass-policy && rush build --to @luban-cad/web

FROM nginx:alpine
COPY --from=builder /app/luban-cad/apps/web/dist /usr/share/nginx/html
EXPOSE 80
