# syntax=docker/dockerfile:1
#
# Build context is the folder that holds both repositories (see compose.yaml),
# because the app compiles the EmberKV SDK from ../emberkv/sdk/typescript.
#   docker build -f erp/Dockerfile -t kiln-erp ..

FROM node:24-alpine AS deps
WORKDIR /src/erp
COPY emberkv/sdk/typescript /src/emberkv/sdk/typescript
COPY erp/package.json erp/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /src/erp
COPY --from=deps /src/emberkv /src/emberkv
COPY --from=deps /src/erp/node_modules ./node_modules
COPY erp/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# One-shot jobs (migrations, demo seed) reuse the build stage, which has tsx.
FROM build AS tools
CMD ["npm", "run", "db:migrate"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S kiln && adduser -S kiln -G kiln
COPY --from=build --chown=kiln:kiln /src/erp/.next/standalone ./
COPY --from=build --chown=kiln:kiln /src/erp/.next/static ./.next/static
COPY --from=build --chown=kiln:kiln /src/erp/public ./public
USER kiln
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
