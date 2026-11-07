# Standalone Liitpos server. The default `npm run build` stays the Vercel build.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_PUBLIC_ORIGIN=https://liitpos.185-250-36-27.sslip.io
ENV VITE_PUBLIC_ORIGIN=$VITE_PUBLIC_ORIGIN
ENV LIITPOS_STANDALONE=1
RUN node scripts/with-app-env.mjs vite build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.output ./.output
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/scripts/migration-plan.mjs ./scripts/migration-plan.mjs
COPY --from=build /app/scripts/standalone-host.mjs ./scripts/standalone-host.mjs
COPY --from=build /app/deploy/docker-entrypoint.mjs ./docker-entrypoint.mjs
RUN chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "docker-entrypoint.mjs"]
