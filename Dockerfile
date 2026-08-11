# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Background document AI worker (build with: --target worker)
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src

CMD ["sh", "-c", "node prisma/sync-schema.mjs || echo \"WARN: schema sync failed, starting worker anyway\"; exec npm run documenti:worker"]

# Production web app — MUST be last: Coolify builds the final stage by default
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# pg + transitive deps for prisma/sync-schema.mjs at container startup
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/split2 ./node_modules/split2
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/xtend ./node_modules/xtend

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Sync schema all'avvio; il server parte anche se lo sync va in warning
CMD ["sh", "-c", "node prisma/sync-schema.mjs || echo \"WARN: schema sync failed, starting anyway\"; exec node server.js"]
