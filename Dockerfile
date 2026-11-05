# Serveur de jeu en ligne (Node 24 LTS). better-sqlite3 est le seul module natif.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json ./
COPY server ./server
COPY shared ./shared
COPY src/engine ./src/engine
RUN npx esbuild server/src/index.ts server/src/backup.ts --bundle --platform=node --format=esm --target=node20 \
    --packages=external --outdir=server/dist --out-extension:.js=.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DB_PATH=/data/coinche.sqlite TRUST_PROXY=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
RUN mkdir /data && chown node:node /data && chmod 700 /data
USER node
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.mjs"]
