FROM node:22-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p .sessions

EXPOSE 3000

ENV ACE_PORT=3000
ENV ACE_HOST=0.0.0.0

CMD ["node", "src/server.mjs"]
