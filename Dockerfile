FROM node:22-slim

# Install git + native build tools for node-pty compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      git \
      build-essential \
      python3 \
      make \
      g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy application source
COPY . .

# Create volume mount points for persistent data
VOLUME ["/app/.sessions", "/app/.made-data"]

# Expose the default port
EXPOSE 3000

# Health check against the root endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

# Start the server
ENTRYPOINT ["node", "src/server.mjs"]
