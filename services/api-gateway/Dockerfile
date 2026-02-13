FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY services/api-gateway/package*.json ./
COPY services/api-gateway/tsconfig.json ./
COPY tsconfig.base.json ../tsconfig.base.json

# Install all dependencies (including dev for TypeScript)
RUN npm install

# Copy source code
COPY services/api-gateway/src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY services/api-gateway/package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]
