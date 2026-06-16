FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
COPY .agntdev-bot-toolkit.tgz ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY .agntdev-bot-toolkit.tgz ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
