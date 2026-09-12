FROM node:22-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build:release
RUN npm prune --omit=dev

FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget unzip \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) XRAY_ARCH="64" ;; \
      arm64) XRAY_ARCH="arm64-v8a" ;; \
      arm) XRAY_ARCH="arm32-v7a" ;; \
      *) echo "Unsupported Docker architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    mkdir -p /app/bin /tmp/xray; \
    wget -q -O /tmp/xray/xray.zip "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${XRAY_ARCH}.zip"; \
    unzip -q /tmp/xray/xray.zip xray -d /tmp/xray; \
    mv /tmp/xray/xray /app/bin/xray; \
    chmod 755 /app/bin/xray; \
    rm -rf /tmp/xray

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3456

VOLUME ["/app/data", "/app/bin"]
EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3456/api/health || exit 1

CMD ["node", "dist/server.mjs"]
