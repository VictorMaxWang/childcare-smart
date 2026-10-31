FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build && \
    mkdir -p /app/standalone-runtime && \
    cp -a /app/.next/standalone/. /app/standalone-runtime/ && \
    rm -rf /app/standalone-runtime/node_modules && \
    find /app/.next/standalone/node_modules -depth -exec touch -h -d @0 {} +

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
# 将追踪依赖与业务构建分层，稳定依赖文件的时间元数据，修复业务时无需反复传输整层依赖。
# standalone 不自动携带 public/static；音频接口也依赖完整 public 路径。
COPY --from=builder --chown=node:node /app/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/standalone-runtime ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
