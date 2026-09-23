FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g @microsoft/rush
COPY . .
RUN rush install --bypass-policy && rush rebuild

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/web-agent/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4002
CMD ["node", "dist/main.js"]
