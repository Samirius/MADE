FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

COPY static/ ./static/
COPY Dockerfile ./

EXPOSE 3000

ENV MADE_PORT=3000
ENV MADE_HOST=0.0.0.0

CMD ["node", "dist/server/index.js"]
