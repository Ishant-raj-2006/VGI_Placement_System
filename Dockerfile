# Single-image build: React app is built, then served by the Node API (one container, one port).
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
RUN mkdir -p /app/backend/storage && chown -R node:node /app/backend/storage
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:5000/health || exit 1
CMD ["node", "src/server.js"]
