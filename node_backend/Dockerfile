# --- Build Stage ---
FROM node:20-slim AS builder
WORKDIR /app

# Install build dependencies for better-sqlite3 compilation
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# --- Final Production Stage ---
FROM node:20-slim
WORKDIR /app

# Install sqlite3 runtime dependency
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy built node_modules and code
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Expose port and configure environment
EXPOSE 3002
ENV PORT=3002
ENV NODE_ENV=production

CMD ["npm", "start"]
