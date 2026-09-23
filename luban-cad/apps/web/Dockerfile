FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g @microsoft/rush
COPY open-cloud-cad/ ./open-cloud-cad/
COPY common/ ./common/
COPY rush.json .
RUN rush install --bypass-policy && rush build --to @open-cloud-cad/web

FROM nginx:alpine
COPY --from=builder /app/open-cloud-cad/apps/web/dist /usr/share/nginx/html
EXPOSE 80
