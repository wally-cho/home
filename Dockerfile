# Next.js standalone 빌드.
# EC2는 메모리가 3.7GB뿐이고 tium 서버와 handari가 이미 올라가 있으므로,
# 빌드는 GitHub Actions에서만 하고 EC2에서는 하지 않는다.

# ── build ──
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 빌드 시점에는 DB에 붙지 않는다. 모든 페이지가 동적이므로 프리렌더가 없다.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── run ──
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV TZ=Asia/Seoul

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
