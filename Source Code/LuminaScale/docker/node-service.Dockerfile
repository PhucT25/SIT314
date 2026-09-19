FROM node:22-alpine

ARG SERVICE
ENV SERVICE=${SERVICE}
WORKDIR /app

COPY package.json ./
COPY packages/core/package.json packages/core/package.json
COPY services/ingestion/package.json services/ingestion/package.json
COPY services/processor/package.json services/processor/package.json
COPY services/api/package.json services/api/package.json
COPY simulator/package.json simulator/package.json
RUN npm install --omit=dev

COPY packages/core packages/core
COPY services services
COPY simulator simulator

ENV NODE_ENV=production
CMD ["sh", "-c", "node services/${SERVICE}/src/index.js"]
